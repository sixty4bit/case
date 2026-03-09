#!/usr/bin/env bash
# Doom-loop detection hook for case harness
# PostToolUse on Bash — detects repeated identical failures
# Only active when .case-active marker exists

set -uo pipefail

INPUT=$(cat)

# Only enforce during /case workflows
if [[ ! -f ".case-active" ]]; then
  exit 0
fi

# Detect failure from PostToolUse JSON.
# Claude Code PostToolUse payloads vary — tool_result or tool_output,
# and exit codes appear in multiple formats. Check all known patterns.
IS_FAILURE=$(echo "$INPUT" | python3 -c "
import sys, json, re

d = json.load(sys.stdin)

# Check both possible field names for the tool output
result = str(d.get('tool_result', '') or '')
output = str(d.get('tool_output', '') or '')
combined = result + output

# Only trust explicit non-zero exit code patterns.
# Do NOT match bare keywords like 'Error:' or 'Command failed' —
# those can appear in successful output (e.g. grep results, log lines).
exit_patterns = [
    r'exit code (\d+)',
    r'exited with code (\d+)',
    r'non-zero code[:\s]+(\d+)',
    r'exit status (\d+)',
]

for p in exit_patterns:
    m = re.search(p, combined, re.IGNORECASE)
    if m and m.group(1) != '0':
        print('1')
        sys.exit(0)

print('0')
" 2>/dev/null || echo "0")

# If command succeeded, reset state and allow
if [[ "$IS_FAILURE" == "0" ]]; then
  rm -f .case-doom-loop-state
  exit 0
fi

# Extract fingerprint: command + first line of output (truncated)
FINGERPRINT=$(echo "$INPUT" | python3 -c "
import sys, json, hashlib

d = json.load(sys.stdin)
cmd = d.get('tool_input', {}).get('command', '')

# Use whichever field has content
result = str(d.get('tool_result', '') or d.get('tool_output', '') or '')
lines = result.strip().split('\n')
first_line = lines[0][:200] if lines else ''

fp = f'{cmd}|{first_line}'
print(hashlib.sha256(fp.encode()).hexdigest()[:16])
" 2>/dev/null || echo "unknown")

STATE_FILE=".case-doom-loop-state"
THRESHOLD=3

# Read current state
PREV_FP=""
COUNT=0
if [[ -f "$STATE_FILE" ]]; then
  PREV_FP=$(head -1 "$STATE_FILE" 2>/dev/null || echo "")
  COUNT=$(tail -1 "$STATE_FILE" 2>/dev/null || echo "0")
fi

# Compare fingerprints
if [[ "$FINGERPRINT" == "$PREV_FP" ]]; then
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi

# Write updated state
printf '%s\n%d\n' "$FINGERPRINT" "$COUNT" > "$STATE_FILE"

# Check threshold
if [[ $COUNT -ge $THRESHOLD ]]; then
  {
    echo ""
    echo "DOOM LOOP DETECTED — same command has failed $COUNT times consecutively"
    echo ""
    echo "STOP retrying. Instead:"
    echo "  1. Document what's failing and why in the task Progress Log"
    echo "  2. Try a fundamentally different approach"
    echo "  3. If stuck, set status to 'active' (restart) and report the blocker"
    echo ""
    echo "Do NOT retry the same command again."
  } >&2
  exit 2
fi

exit 0
