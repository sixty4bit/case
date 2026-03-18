import { resolve } from 'node:path';
import { readdir, stat, unlink } from 'node:fs/promises';
import { determineEntryPhase } from '../state/transitions.js';
import { createLogger } from '../util/logger.js';
import type { TaskJson, PipelinePhase } from '../types.js';

const log = createLogger();

const STALE_MARKER_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface TaskMatch {
  taskJson: TaskJson;
  taskJsonPath: string;
  taskMdPath: string;
  entryPhase: PipelinePhase;
}

/**
 * Scan `tasks/active/*.task.json` for a task matching the given issue.
 * Returns the match with its resolved entry phase, or null if not found.
 */
export async function findTaskByIssue(
  caseRoot: string,
  repoName: string,
  issueType: 'github' | 'linear' | 'freeform',
  issueNumber: string,
): Promise<TaskMatch | null> {
  const activeDir = resolve(caseRoot, 'tasks/active');

  let entries: string[];
  try {
    entries = await readdir(activeDir);
  } catch {
    return null;
  }

  const taskFiles = entries.filter((f) => f.endsWith('.task.json'));

  for (const file of taskFiles) {
    const taskJsonPath = resolve(activeDir, file);
    try {
      const raw = await Bun.file(taskJsonPath).text();
      const task = JSON.parse(raw) as TaskJson;

      if (task.repo === repoName && task.issueType === issueType && task.issue === issueNumber) {
        const entryPhase = determineEntryPhase(task);
        const taskMdPath = taskJsonPath.replace(/\.task\.json$/, '.md');

        log.info('found existing task by issue', {
          taskId: task.id,
          repo: repoName,
          issue: issueNumber,
          entryPhase,
        });

        return { taskJson: task, taskJsonPath, taskMdPath, entryPhase };
      }
    } catch {
      // Skip unparseable files
      continue;
    }
  }

  return null;
}

/**
 * Scan for a task via the `.case-active` marker in the given repo directory.
 * Reads the task ID from the marker file, then loads the task JSON directly.
 *
 * Handles stale markers (>24h) and missing task files by cleaning up.
 */
export async function findTaskByMarker(
  caseRoot: string,
  repoPath: string,
): Promise<TaskMatch | null> {
  const markerPath = resolve(repoPath, '.case-active');

  // Check if marker exists
  const markerFile = Bun.file(markerPath);
  if (!(await markerFile.exists())) {
    return null;
  }

  // Check staleness (>24h)
  try {
    const markerStat = await stat(markerPath);
    const ageMs = Date.now() - markerStat.mtimeMs;
    if (ageMs > STALE_MARKER_MS) {
      log.info('cleaning stale .case-active marker', { path: markerPath, ageMs });
      await cleanupMarker(markerPath);
      process.stdout.write('Stale .case-active marker (>24h) cleaned up.\n');
      return null;
    }
  } catch {
    return null;
  }

  // Read task ID from marker
  const taskId = (await markerFile.text()).trim();
  if (!taskId) {
    await cleanupMarker(markerPath);
    return null;
  }

  // Load the task JSON
  const taskJsonPath = resolve(caseRoot, 'tasks/active', `${taskId}.task.json`);
  const taskFile = Bun.file(taskJsonPath);

  if (!(await taskFile.exists())) {
    log.info('marker references missing task, cleaning up', { taskId, markerPath });
    await cleanupMarker(markerPath);
    process.stdout.write('Stale marker cleaned. No active task.\n');
    return null;
  }

  try {
    const raw = await taskFile.text();
    const task = JSON.parse(raw) as TaskJson;
    const entryPhase = determineEntryPhase(task);
    const taskMdPath = taskJsonPath.replace(/\.task\.json$/, '.md');

    log.info('found existing task by marker', {
      taskId: task.id,
      entryPhase,
    });

    return { taskJson: task, taskJsonPath, taskMdPath, entryPhase };
  } catch {
    log.error('failed to parse task file referenced by marker', { taskId, taskJsonPath });
    await cleanupMarker(markerPath);
    return null;
  }
}

/** Remove a .case-active marker file. */
async function cleanupMarker(markerPath: string): Promise<void> {
  try {
    await unlink(markerPath);
  } catch {
    // Already removed or inaccessible
  }
}
