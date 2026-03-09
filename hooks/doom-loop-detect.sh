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

# Parse tool result from PostToolUse JSON
# PostToolUse provides: tool_name, tool_input, tool_result
EXIT_CODE=$(echo "$INPUT" | python3 -c "
import sys, json, re
d = json.load(sys.stdin)
result = d.get('tool_result', '')
# Look for exit code pattern in bash output
m = re.search(r'exit code (\d+)', str(result))
print(m.group(1) if m else '0')
" 2>/dev/null || echo "0")

# If command succeeded, reset state and allow
if [[ "$EXIT_CODE" == "0" ]]; then
  rm -f .case-doom-loop-state
  exit 0
fi

# Extract fingerprint: command + exit code + first stderr line
FINGERPRINT=$(echo "$INPUT" | python3 -c "
import sys, json, hashlib
d = json.load(sys.stdin)
cmd = d.get('tool_input', {}).get('command', '')
result = str(d.get('tool_result', ''))
lines = result.strip().split('\n')
first_err = lines[0][:200] if lines else ''
fp = f'{cmd}|{first_err}'
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
