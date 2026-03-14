import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { ProjectEntry, ServerConfig, TaskCreateRequest } from './types.js';
import { loadProjects } from './config.js';
import { createTask } from './entry/task-factory.js';
import { parseGitHubEvent, verifyWebhookSignature } from './entry/github-webhook.js';
import { startScanners } from './entry/scanners/index.js';
import { buildPipelineConfig } from './config.js';
import { runPipeline } from './pipeline.js';
import { createLogger } from './util/logger.js';

const log = createLogger();

/**
 * Start the Case orchestrator as an HTTP service.
 *
 * Endpoints:
 *   POST /webhook/github    — Receive GitHub webhook events
 *   POST /tasks             — Manually create a task
 *   POST /tasks/:id/start   — Start pipeline for an existing task
 *   GET  /health            — Health check
 *   GET  /tasks             — List pending tasks
 */
export async function startServer(caseRoot: string, config: ServerConfig): Promise<void> {
  const repos = await loadProjects(caseRoot);
  const pendingTasks: TaskCreateRequest[] = [];

  // Start scanners
  const stopScanners = startScanners(caseRoot, repos, config.scanners, (tasks) => {
    for (const task of tasks) {
      log.info('scanner created task', { repo: task.repo, title: task.title });
      pendingTasks.push(task);
    }
  });

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, caseRoot, config, repos, pendingTasks);
    } catch (err) {
      log.error('request error', { error: String(err) });
      jsonResponse(res, 500, { error: 'Internal server error' });
    }
  });

  server.listen(config.port, config.host, () => {
    log.info('server started', { port: config.port, host: config.host });
    process.stdout.write(`Case orchestrator listening on http://${config.host}:${config.port}\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    log.info('shutting down');
    stopScanners();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  caseRoot: string,
  config: ServerConfig,
  repos: ProjectEntry[],
  pendingTasks: TaskCreateRequest[],
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const method = req.method?.toUpperCase() ?? 'GET';

  // Health check
  if (method === 'GET' && url.pathname === '/health') {
    jsonResponse(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }

  // List pending tasks
  if (method === 'GET' && url.pathname === '/tasks') {
    jsonResponse(res, 200, {
      pending: pendingTasks.map((t) => ({
        repo: t.repo,
        title: t.title,
        trigger: t.trigger.type,
      })),
    });
    return;
  }

  // GitHub webhook
  if (method === 'POST' && url.pathname === '/webhook/github') {
    await handleGitHubWebhook(req, res, caseRoot, config, pendingTasks);
    return;
  }

  // Create task manually
  if (method === 'POST' && url.pathname === '/tasks') {
    await handleCreateTask(req, res, caseRoot, pendingTasks);
    return;
  }

  // Start a pending task
  const startMatch = url.pathname.match(/^\/tasks\/(\d+)\/start$/);
  if (method === 'POST' && startMatch) {
    const idx = parseInt(startMatch[1], 10);
    await handleStartTask(idx, res, caseRoot, pendingTasks);
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
}

async function handleGitHubWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  caseRoot: string,
  config: ServerConfig,
  pendingTasks: TaskCreateRequest[],
): Promise<void> {
  const body = await readBody(req);

  // Verify signature if secret is configured
  if (config.webhookSecret) {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!verifyWebhookSignature(body, signature, config.webhookSecret)) {
      jsonResponse(res, 401, { error: 'Invalid signature' });
      return;
    }
  }

  const eventType = req.headers['x-github-event'] as string;
  const deliveryId = (req.headers['x-github-delivery'] as string) ?? 'unknown';

  if (!eventType) {
    jsonResponse(res, 400, { error: 'Missing X-GitHub-Event header' });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON' });
    return;
  }

  const task = parseGitHubEvent(eventType, deliveryId, payload);
  if (task) {
    if (task.autoStart) {
      // Auto-start: create and run immediately
      const created = await createTask(caseRoot, task);
      // Fire and forget — don't block the webhook response
      dispatchPipeline(caseRoot, created.taskJsonPath).catch((err) => {
        log.error('auto-start pipeline failed', { error: String(err) });
      });
      jsonResponse(res, 201, { action: 'created_and_started', taskId: created.taskId });
    } else {
      // Queue for human approval
      pendingTasks.push(task);
      jsonResponse(res, 201, { action: 'queued', repo: task.repo, title: task.title });
    }
  } else {
    jsonResponse(res, 200, { action: 'ignored' });
  }
}

async function handleCreateTask(
  req: IncomingMessage,
  res: ServerResponse,
  caseRoot: string,
  pendingTasks: TaskCreateRequest[],
): Promise<void> {
  const body = await readBody(req);

  let request: TaskCreateRequest;
  try {
    request = JSON.parse(body) as TaskCreateRequest;
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON' });
    return;
  }

  if (!request.repo || !request.title || !request.description) {
    jsonResponse(res, 400, { error: 'Missing required fields: repo, title, description' });
    return;
  }

  // Default trigger for manual API calls
  if (!request.trigger) {
    request.trigger = { type: 'manual', description: 'Created via API' };
  }

  const created = await createTask(caseRoot, request);
  jsonResponse(res, 201, { taskId: created.taskId, path: created.taskJsonPath });
}

async function handleStartTask(
  idx: number,
  res: ServerResponse,
  caseRoot: string,
  pendingTasks: TaskCreateRequest[],
): Promise<void> {
  if (idx < 0 || idx >= pendingTasks.length) {
    jsonResponse(res, 404, { error: 'Task index out of range' });
    return;
  }

  const request = pendingTasks.splice(idx, 1)[0];
  const created = await createTask(caseRoot, request);

  // Fire and forget
  dispatchPipeline(caseRoot, created.taskJsonPath).catch((err) => {
    log.error('pipeline dispatch failed', { taskId: created.taskId, error: String(err) });
  });

  jsonResponse(res, 200, { action: 'started', taskId: created.taskId });
}

async function dispatchPipeline(caseRoot: string, taskJsonPath: string): Promise<void> {
  const config = await buildPipelineConfig({
    taskJsonPath,
    mode: 'unattended',
  });
  await runPipeline(config);
}

// --- Helpers ---

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
