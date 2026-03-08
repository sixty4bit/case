#!/usr/bin/env bash
# Post-PR cleanup hook for case harness
# After successful gh pr create:
# 1. Moves task file from active/ to done/
# 2. Removes marker files

set -euo pipefail

CASE_REPO="/Users/nicknisi/Developer/case"

# Read hook input from stdin
INPUT=$(cat)

# Extract the command
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# Only act on gh pr create
if [[ "$COMMAND" != *"gh pr create"* ]]; then
  exit 0
fi

# Move task files from active/ to done/
if [[ -d "$CASE_REPO/tasks/active" && -d "$CASE_REPO/tasks/done" ]]; then
  for task_file in "$CASE_REPO/tasks/active"/*.md; do
    if [[ -f "$task_file" ]]; then
      mv "$task_file" "$CASE_REPO/tasks/done/"
    fi
  done
fi

# Clean up all marker files
rm -f .case-active .case-tested .case-manual-tested

exit 0
