#!/usr/bin/env bash
# Post-PR cleanup hook for case harness
# Removes marker files after successful gh pr create

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract the command
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# Only act on gh pr create
if [[ "$COMMAND" != *"gh pr create"* ]]; then
  exit 0
fi

# Clean up all marker files
rm -f .case-active .case-tested .case-manual-tested

exit 0
