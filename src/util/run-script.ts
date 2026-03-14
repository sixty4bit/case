import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from './logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger();

export interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a script safely via execFile (no shell injection).
 * Always returns a structured result — never throws.
 */
export async function runScript(
  scriptPath: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<ScriptResult> {
  const timeout = options?.timeout ?? 30_000;
  const start = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(scriptPath, args, {
      cwd: options?.cwd,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });

    log.info('script completed', {
      script: scriptPath,
      args,
      durationMs: Date.now() - start,
      exitCode: 0,
    });

    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: string | number };
    const exitCode = typeof e.code === 'number' ? e.code : 1;

    log.error('script failed', {
      script: scriptPath,
      args,
      durationMs: Date.now() - start,
      exitCode,
      error: e.message,
    });

    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? '',
      exitCode,
    };
  }
}
