#!/usr/bin/env bash
# analyze-failure.sh — Analyze an agent failure for intelligent respawning
#
# Usage:
#   analyze-failure.sh <task.json> <failed-agent> <error-summary>
#
# Reads task context and produces structured failure analysis as JSON to stdout.
# The orchestrator uses this to generate an adjusted retry prompt.
#
# Output (JSON):
#   failureClass  — categorized failure type
#   failedAgent   — which agent failed
#   errorSummary  — 1-line error description
#   filesInvolved — files the agent was working with
#   whatWasTried  — from working memory if available
#   suggestedFocus — targeted guidance for retry
#   retryViable   — boolean: whether an intelligent retry is likely to help

set -uo pipefail

TASK_FILE="${1:-}"
FAILED_AGENT="${2:-}"
ERROR_SUMMARY="${3:-}"

if [[ -z "$TASK_FILE" || -z "$FAILED_AGENT" ]]; then
  echo "Usage: analyze-failure.sh <task.json> <failed-agent> <error-summary>" >&2
  exit 1
fi

if [[ ! -f "$TASK_FILE" ]]; then
  echo "Error: task file not found: $TASK_FILE" >&2
  exit 1
fi

CASE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Derive working memory path from task file
TASK_STEM=$(basename "$TASK_FILE" .task.json)
TASK_DIR=$(dirname "$TASK_FILE")
WORKING_FILE="$TASK_DIR/${TASK_STEM}.working.md"

TS_FILE="$TASK_FILE" TS_AGENT="$FAILED_AGENT" TS_ERROR="$ERROR_SUMMARY" \
  TS_WORKING="$WORKING_FILE" TS_ROOT="$CASE_ROOT" python3 -c "
import json, os, sys, subprocess

task_file = os.environ['TS_FILE']
failed_agent = os.environ['TS_AGENT']
error_summary = os.environ['TS_ERROR']
working_file = os.environ['TS_WORKING']
case_root = os.environ['TS_ROOT']

with open(task_file) as f:
    data = json.load(f)

repo = data.get('repo', 'unknown')

# Read working memory for what was already tried
what_was_tried = []
if os.path.isfile(working_file):
    with open(working_file) as f:
        in_tried_section = False
        for line in f:
            line = line.rstrip()
            if '## What Was Tried' in line:
                in_tried_section = True
                continue
            if in_tried_section:
                if line.startswith('## '):
                    break
                if line.startswith('- '):
                    what_was_tried.append(line[2:].strip())

# Find files involved via git diff
files_involved = []
try:
    result = subprocess.run(
        ['git', 'diff', '--name-only', 'main'],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode == 0:
        files_involved = [f for f in result.stdout.strip().split('\n') if f]
except Exception:
    pass

# Classify failure
error_lower = error_summary.lower()
if any(w in error_lower for w in ('test', 'vitest', 'jest', 'assert', 'expect')):
    failure_class = 'test-failure'
    suggested_focus = 'Review failing test expectations. Check if the test needs updating or if the implementation has a logic error. Focus on the specific test file and the code path it exercises.'
elif any(w in error_lower for w in ('type', 'typescript', 'ts2', 'ts7')):
    failure_class = 'type-error'
    suggested_focus = 'Fix type errors first — they often cascade. Check import paths, generic constraints, and return types. Run tsc --noEmit to get the full list before making changes.'
elif any(w in error_lower for w in ('lint', 'eslint', 'prettier')):
    failure_class = 'lint-error'
    suggested_focus = 'Run the linter with --fix flag first. Remaining issues are usually import ordering or unused variables. Check the repo CLAUDE.md for lint-specific conventions.'
elif any(w in error_lower for w in ('build', 'compile', 'module', 'import', 'export', 'resolve')):
    failure_class = 'build-error'
    suggested_focus = 'Check import/export paths and ESM extensions. Verify the module is properly exported from package entry points. Build errors often cascade — fix the first one and re-run.'
elif any(w in error_lower for w in ('timeout', 'hang', 'stuck', 'doom')):
    failure_class = 'timeout-or-loop'
    suggested_focus = 'The previous approach hit a loop or timeout. Try a fundamentally different strategy instead of tweaking the same approach. Consider if there is a simpler solution.'
elif any(w in error_lower for w in ('no structured output', 'agent_result')):
    failure_class = 'agent-protocol-error'
    suggested_focus = 'The agent did not produce a structured AGENT_RESULT. This usually means it ran out of context or hit an unrecoverable error. Simplify the task scope for the retry.'
else:
    failure_class = 'unknown'
    suggested_focus = 'Review the error carefully. Check if a different approach would avoid the issue entirely. Read the working memory for what was already tried.'

# Determine if retry is viable
retry_viable = True
if failure_class == 'agent-protocol-error':
    retry_viable = True  # worth trying with narrower scope
if len(what_was_tried) >= 3:
    retry_viable = False  # too many attempts already — surface to human
    suggested_focus = 'Multiple approaches already tried. Surface to human for guidance rather than retrying.'

analysis = {
    'failureClass': failure_class,
    'failedAgent': failed_agent,
    'errorSummary': error_summary[:500],
    'filesInvolved': files_involved[:20],
    'whatWasTried': what_was_tried,
    'suggestedFocus': suggested_focus,
    'retryViable': retry_viable,
}

print(json.dumps(analysis, indent=2))
"
exit $?
