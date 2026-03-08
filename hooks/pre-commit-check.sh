#!/usr/bin/env bash
# Enforce conventional commit format when .case-active
# Only enforced during /case workflows

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

# Only intercept git commit
if [[ "$COMMAND" != *"git commit"* ]]; then
  exit 0
fi

# Only enforce when /case is active
if [[ ! -f ".case-active" ]]; then
  exit 0
fi

# Skip if it's a merge commit or amend
if echo "$COMMAND" | grep -qE "(--amend|merge)"; then
  exit 0
fi

# Extract the commit message from -m flag
COMMIT_MSG=$(echo "$COMMAND" | python3 -c "
import sys, re
cmd = sys.stdin.read()
# Match -m followed by quoted string or heredoc
m = re.search(r'-m\s+\"(.*?)\"', cmd, re.DOTALL)
if not m:
    m = re.search(r\"-m\s+'(.*?)'\", cmd, re.DOTALL)
if not m:
    # Heredoc pattern: -m \"\$(cat <<'EOF' ... EOF)\"
    m = re.search(r'EOF\n(.*?)\n.*?EOF', cmd, re.DOTALL)
if m:
    # Get first line only
    print(m.group(1).strip().split('\n')[0])
else:
    print('')
" 2>/dev/null || echo "")

# If we couldn't extract the message, pass through (don't block on parse failure)
if [[ -z "$COMMIT_MSG" ]]; then
  exit 0
fi

# Check conventional commit format: type(scope): description or type: description or type!: description
if ! echo "$COMMIT_MSG" | grep -qE "^(feat|fix|docs|refactor|test|chore|ci|perf|style|build|revert)(\(.+\))?\!?:"; then
  {
    echo ""
    echo "CASE COMMIT CHECK FAILED"
    echo ""
    echo "[FAIL] Commit message doesn't follow conventional commit format"
    echo "  Got: $COMMIT_MSG"
    echo "  Expected: type(scope): description"
    echo "  Types: feat, fix, docs, refactor, test, chore, ci, perf, style, build, revert"
    echo "  Examples:"
    echo "    fix(session): handle expired cookies gracefully"
    echo "    feat(cli): add widgets list command"
    echo "    fix!: breaking change to session API"
  } >&2
  exit 2
fi

exit 0
