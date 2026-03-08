#!/usr/bin/env bash
# Block git push to main/master when .case-active
# Only enforced during /case workflows

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# Only intercept git push
if [[ "$COMMAND" != *"git push"* ]]; then
  exit 0
fi

# Only enforce when /case is active
if [[ ! -f ".case-active" ]]; then
  exit 0
fi

# Check if pushing to main/master
if echo "$COMMAND" | grep -qE "git push.*(origin\s+)?(main|master)\b"; then
  {
    echo ""
    echo "CASE PUSH CHECK FAILED"
    echo ""
    echo "[FAIL] Pushing directly to main/master is not allowed"
    echo "  FIX: Push your feature branch and open a PR instead:"
    echo "  git push -u origin $(git branch --show-current)"
    echo "  gh pr create"
  } >&2
  exit 2
fi

# Also block if currently on main/master and pushing without specifying a different branch
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
  # Allow if explicitly pushing a different branch (e.g., git push -u origin fix/thing)
  PUSH_TARGET=$(echo "$COMMAND" | python3 -c "
import sys, re
cmd = sys.stdin.read().strip()
# Extract what comes after 'origin' (if anything)
m = re.search(r'origin\s+(\S+)', cmd)
if m:
    print(m.group(1))
else:
    print('')
" 2>/dev/null || echo "")

  # Block if no target specified or target is main/master
  if [[ -z "$PUSH_TARGET" || "$PUSH_TARGET" == "main" || "$PUSH_TARGET" == "master" ]]; then
    {
      echo ""
      echo "CASE PUSH CHECK FAILED"
      echo ""
      echo "[FAIL] Currently on '$BRANCH' — pushing would update main directly"
      echo "  FIX: Create a feature branch first:"
      echo "  git checkout -b fix/your-change"
      echo "  git push -u origin fix/your-change"
      echo "  gh pr create"
    } >&2
    exit 2
  fi
fi

exit 0
