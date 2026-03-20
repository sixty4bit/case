import { resolve } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { determineEntryPhase } from '../state/transitions.js';
import type { TaskJson, PipelinePhase } from '../types.js';

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
 * Scan for a task via the `.case/active` marker in the given repo directory.
 * Reads the task ID from the marker file, then loads the task JSON directly.
 *
 * Handles stale markers (>24h) and missing task files by cleaning up.
 */
export async function findTaskByMarker(caseRoot: string, repoPath: string): Promise<TaskMatch | null> {
  const markerPath = resolve(repoPath, '.case', 'active');

  // Check marker exists and staleness in one stat call
  let markerStat;
  try {
    markerStat = await stat(markerPath);
  } catch {
    return null; // Marker doesn't exist
  }

  const ageMs = Date.now() - markerStat.mtimeMs;
  if (ageMs > STALE_MARKER_MS) {
    await cleanupCaseDir(resolve(repoPath, '.case'));
    process.stdout.write('Stale .case/active marker (>24h) cleaned up.\n');
    return null;
  }

  // Read task ID from marker
  const taskId = (await Bun.file(markerPath).text()).trim();
  if (!taskId) {
    await cleanupCaseDir(resolve(repoPath, '.case'));
    return null;
  }

  // Load the task JSON
  const taskJsonPath = resolve(caseRoot, 'tasks/active', `${taskId}.task.json`);
  const taskFile = Bun.file(taskJsonPath);

  if (!(await taskFile.exists())) {
    await cleanupCaseDir(resolve(repoPath, '.case'));
    process.stdout.write('Stale marker cleaned. No active task.\n');
    return null;
  }

  try {
    const raw = await taskFile.text();
    const task = JSON.parse(raw) as TaskJson;
    const entryPhase = determineEntryPhase(task);
    const taskMdPath = taskJsonPath.replace(/\.task\.json$/, '.md');

    return { taskJson: task, taskJsonPath, taskMdPath, entryPhase };
  } catch {
    await cleanupCaseDir(resolve(repoPath, '.case'));
    return null;
  }
}

/** Remove the entire .case/ directory in a target repo. */
async function cleanupCaseDir(caseDirPath: string): Promise<void> {
  try {
    const { rm } = await import('node:fs/promises');
    await rm(caseDirPath, { recursive: true, force: true });
  } catch {
    // Already removed or inaccessible
  }
}
