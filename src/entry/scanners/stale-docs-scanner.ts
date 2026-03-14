import { resolve } from 'node:path';
import type { ProjectEntry, TaskCreateRequest, TriggerSource } from '../../types.js';
import { runScript } from '../../util/run-script.js';
import { createLogger } from '../../util/logger.js';

const log = createLogger();

/** Track repos we've already flagged stale docs for (with TTL). */
const flaggedRepos = new Map<string, number>();
const FLAGGED_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Run entropy-scan.sh across repos and create cleanup tasks for stale docs.
 * Wraps the existing script rather than reimplementing scanning logic.
 */
export async function scanStaleDocs(caseRoot: string, repos: ProjectEntry[]): Promise<TaskCreateRequest[]> {
  const tasks: TaskCreateRequest[] = [];
  const trigger: TriggerSource = {
    type: 'scanner',
    scanner: 'stale-docs',
    runId: `docs-${Date.now().toString(36)}`,
  };

  const entropyScript = resolve(caseRoot, 'scripts/entropy-scan.sh');

  evictStaleEntries(flaggedRepos);

  for (const repo of repos) {
    if (flaggedRepos.has(repo.name)) continue;

    try {
      const repoPath = repo.path.startsWith('/') ? repo.path : resolve(caseRoot, repo.path);

      const result = await runScript('bash', [entropyScript, repoPath], {
        timeout: 60_000,
      });

      // entropy-scan.sh exits 0 if clean, non-zero if drift detected
      if (result.exitCode !== 0 && result.stdout.trim()) {
        flaggedRepos.set(repo.name, Date.now());

        tasks.push({
          repo: repo.name,
          title: `Fix stale documentation in ${repo.name}`,
          description: [
            `entropy-scan.sh detected documentation drift:`,
            '',
            '```',
            result.stdout.trim(),
            '```',
            '',
            'Update the stale files to match the current code.',
          ].join('\n'),
          issueType: 'freeform',
          mode: 'unattended',
          trigger,
          autoStart: false,
        });
      }
    } catch (err) {
      log.error('stale docs scanner failed for repo', { repo: repo.name, error: String(err) });
    }
  }

  if (tasks.length > 0) {
    log.info('stale docs scanner found drift', { count: tasks.length });
  }

  return tasks;
}

function evictStaleEntries(map: Map<string, number>): void {
  const now = Date.now();
  for (const [key, ts] of map) {
    if (now - ts > FLAGGED_TTL_MS) map.delete(key);
  }
}
