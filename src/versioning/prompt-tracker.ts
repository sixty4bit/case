import { resolve } from 'node:path';
import { parseJsonLines } from '../util/parse-jsonl.js';
import { createLogger } from '../util/logger.js';

const log = createLogger();

interface ChangelogEntry {
  version: string;
  agent: string;
}

interface RunLogEntry {
  task: string;
  runId: string;
}

/**
 * Read the agent-versions changelog and return the latest prompt version per agent.
 * Returns an empty record if no changelog exists or on parse errors.
 */
export async function getCurrentPromptVersions(caseRoot: string): Promise<Record<string, string>> {
  const file = Bun.file(resolve(caseRoot, 'docs/agent-versions/changelog.jsonl'));
  if (!(await file.exists())) return {};

  const entries = parseJsonLines<ChangelogEntry>(await file.text(), (line) => {
    log.error('invalid changelog line', { line: line.slice(0, 100) });
  });

  const versions: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.agent && entry.version) {
      versions[entry.agent] = entry.version;
    }
  }
  return versions;
}

/**
 * Find the most recent runId for a given task in the run log.
 */
export async function findPriorRunId(caseRoot: string, taskId: string): Promise<string | null> {
  const file = Bun.file(resolve(caseRoot, 'docs/run-log.jsonl'));
  if (!(await file.exists())) return null;

  const entries = parseJsonLines<RunLogEntry>(await file.text());
  let priorRunId: string | null = null;
  for (const entry of entries) {
    if (entry.task === taskId) {
      priorRunId = entry.runId;
    }
  }
  return priorRunId;
}
