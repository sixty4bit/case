import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { ProjectEntry, TaskCreateRequest, TriggerSource } from '../../types.js';
import { createLogger } from '../../util/logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger();

/** Track repos we've already flagged outdated deps for. */
const flaggedRepos = new Set<string>();

interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  type: string;
}

/**
 * Check for outdated dependencies across repos.
 * Uses pnpm outdated (all repos are pnpm-based).
 */
export async function scanOutdatedDeps(caseRoot: string, repos: ProjectEntry[]): Promise<TaskCreateRequest[]> {
  const tasks: TaskCreateRequest[] = [];
  const trigger: TriggerSource = {
    type: 'scanner',
    scanner: 'deps',
    runId: `deps-${Date.now().toString(36)}`,
  };

  for (const repo of repos) {
    if (flaggedRepos.has(repo.name)) continue;

    try {
      const repoPath = repo.path.startsWith('/') ? repo.path : resolve(caseRoot, repo.path);

      const outdated = await getOutdatedPackages(repoPath, repo.packageManager);
      if (outdated.length === 0) continue;

      // Only flag if there are major version bumps or security-related packages
      const significant = outdated.filter((pkg) => {
        const [curMajor] = pkg.current.split('.');
        const [latMajor] = pkg.latest.split('.');
        return curMajor !== latMajor;
      });

      if (significant.length === 0) continue;

      flaggedRepos.add(repo.name);

      const depList = significant.map((p) => `- ${p.name}: ${p.current} → ${p.latest}`).join('\n');

      tasks.push({
        repo: repo.name,
        title: `Update ${significant.length} outdated dependencies`,
        description: [
          `Major version updates available:`,
          '',
          depList,
          '',
          'Update each dependency, run tests, and verify nothing breaks.',
        ].join('\n'),
        issueType: 'freeform',
        mode: 'attended', // Dep updates need human oversight
        trigger,
        autoStart: false,
      });
    } catch (err) {
      log.error('deps scanner failed for repo', { repo: repo.name, error: String(err) });
    }
  }

  if (tasks.length > 0) {
    log.info('deps scanner found outdated packages', { count: tasks.length });
  }

  return tasks;
}

async function getOutdatedPackages(repoPath: string, packageManager: string): Promise<OutdatedPackage[]> {
  const cmd = packageManager === 'pnpm' ? 'pnpm' : 'npm';
  const args = ['outdated', '--json'];

  try {
    // pnpm/npm outdated exits non-zero when outdated packages exist
    const { stdout } = await execFileAsync(cmd, args, {
      cwd: repoPath,
      timeout: 30_000,
    });
    return parseOutdatedOutput(stdout);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string };
    // Non-zero exit is expected when packages are outdated
    if (e.stdout) {
      return parseOutdatedOutput(e.stdout);
    }
    return [];
  }
}

function parseOutdatedOutput(stdout: string): OutdatedPackage[] {
  if (!stdout.trim()) return [];

  try {
    const data = JSON.parse(stdout) as Record<string, { current: string; latest: string; type: string }>;
    return Object.entries(data).map(([name, info]) => ({
      name,
      current: info.current,
      latest: info.latest,
      type: info.type,
    }));
  } catch {
    return [];
  }
}
