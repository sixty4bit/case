import type { ProjectEntry, ScannerConfig, TaskCreateRequest } from '../../types.js';
import { scanCIFailures } from './ci-scanner.js';
import { scanStaleDocs } from './stale-docs-scanner.js';
import { scanOutdatedDeps } from './deps-scanner.js';
import { createLogger } from '../../util/logger.js';

const log = createLogger();

interface ScannerGroup {
  ci: ScannerConfig;
  staleDocs: ScannerConfig;
  deps: ScannerConfig;
}

type ScannerFn = (caseRoot: string, repos: ProjectEntry[]) => Promise<TaskCreateRequest[]>;

interface ActiveScanner {
  name: string;
  timer: ReturnType<typeof setInterval>;
}

/**
 * Start all enabled scanners. Returns a stop function that clears all timers.
 */
export function startScanners(
  caseRoot: string,
  allRepos: ProjectEntry[],
  configs: ScannerGroup,
  onTasks: (tasks: TaskCreateRequest[]) => void,
): () => void {
  const active: ActiveScanner[] = [];

  const scannerDefs: Array<{ name: string; config: ScannerConfig; fn: ScannerFn }> = [
    {
      name: 'ci',
      config: configs.ci,
      fn: (_caseRoot, repos) => scanCIFailures(repos),
    },
    {
      name: 'staleDocs',
      config: configs.staleDocs,
      fn: (cr, repos) => scanStaleDocs(cr, repos),
    },
    {
      name: 'deps',
      config: configs.deps,
      fn: (cr, repos) => scanOutdatedDeps(cr, repos),
    },
  ];

  for (const def of scannerDefs) {
    if (!def.config.enabled) continue;

    const repos = def.config.repos.length > 0 ? allRepos.filter((r) => def.config.repos.includes(r.name)) : allRepos;

    const run = async () => {
      try {
        const tasks = await def.fn(caseRoot, repos);
        if (tasks.length > 0) {
          onTasks(tasks);
        }
      } catch (err) {
        log.error(`scanner ${def.name} error`, { error: String(err) });
      }
    };

    // Run immediately on start, then on interval
    run();
    const timer = setInterval(run, def.config.intervalMs);
    active.push({ name: def.name, timer });

    log.info('scanner started', {
      scanner: def.name,
      intervalMs: def.config.intervalMs,
      repos: repos.map((r) => r.name),
    });
  }

  return () => {
    for (const scanner of active) {
      clearInterval(scanner.timer);
      log.info('scanner stopped', { scanner: scanner.name });
    }
  };
}
