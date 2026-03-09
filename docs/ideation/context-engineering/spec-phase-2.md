# Implementation Spec: Context Engineering - Phase 2 (Agent Resilience)

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Phase 2 adds two mechanical safeguards against agent failure during task execution:

1. **Doom-loop detection hook** — a shell script hook that monitors Bash tool invocations for repeated identical failures. After N consecutive failures with the same exit code and similar output, the hook blocks execution and tells the agent to stop and document what's stuck. This is a PreToolUse hook on Bash commands.

2. **WIP commit convention** — update the implementer agent's instructions to commit after each logical step with a `wip:` prefix, enabling mid-task rollback without losing progress.

The doom-loop hook follows the same pattern as existing hooks (`pre-pr-check.sh`, `pre-push-check.sh`) — a shell script that reads JSON from stdin, checks conditions, and exits 0 (allow) or 2 (block with message).

## Feedback Strategy

**Inner-loop command**: `bash -n hooks/doom-loop-detect.sh && echo "syntax OK"`

**Playground**: Manual testing — simulate repeated failures by running the hook with crafted JSON inputs.

**Why this approach**: Hook scripts need syntax validation and manual input testing. No automated test infrastructure exists for hooks.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `hooks/doom-loop-detect.sh` | Detect repeated identical failures and block execution |

### Modified Files

| File Path | Changes |
|-----------|---------|
| `hooks/hooks.json` | Add doom-loop-detect.sh to PostToolUse Bash hooks |
| `agents/implementer.md` | Add WIP commit convention to workflow section |

## Implementation Details

### Doom-Loop Detection Hook

**Pattern to follow**: `hooks/pre-pr-check.sh` (same stdin JSON parsing, same exit code convention)

**Overview**: A PostToolUse hook on Bash commands that tracks consecutive failures. Uses a temp file (`.case-doom-loop-state`) to persist state across invocations within a single task session. The hook only activates when `.case-active` exists (same guard as other hooks).

**Detection logic**:
- After each Bash tool use, read the tool result from stdin JSON
- If the command failed (non-zero exit), extract a normalized fingerprint (command + exit code + first line of stderr)
- Compare to the previous failure fingerprint stored in `.case-doom-loop-state`
- If the same fingerprint repeats 3+ times consecutively, block with an actionable message
- If the command succeeded or the fingerprint changed, reset the counter

**Key decisions**:
- **Threshold of 3** — generous enough to allow legitimate retries (e.g., fixing a typo and re-running), strict enough to catch real doom loops. Can be tuned later.
- **PostToolUse not PreToolUse** — we need to see the result to know if it failed. PostToolUse fires after the tool completes.
- **Fingerprint uses command + exit code + first stderr line** — not the full output, which varies. This catches "same command, same error" patterns.
- **State file `.case-doom-loop-state`** — cleaned up by `post-pr-cleanup.sh` alongside other markers.
- **Only active during /case workflows** — guarded by `.case-active` marker, same as other hooks.

```bash
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
```

**Implementation steps**:
1. Create `hooks/doom-loop-detect.sh` with the script above
2. Run `bash -n hooks/doom-loop-detect.sh` to verify syntax
3. Add to `hooks/hooks.json` PostToolUse Bash hooks array
4. Add `.case-doom-loop-state` cleanup to `hooks/post-pr-cleanup.sh` (alongside existing `.case-reviewed` cleanup — note: `.case-reviewed` cleanup may also be missing from post-pr-cleanup.sh, add both)

### WIP Commit Convention in Implementer

**Pattern to follow**: existing "### 4. Record" section in `agents/implementer.md`

**Overview**: Add instructions to the implementer agent to commit after each logical step, not just at the end. WIP commits use a `wip:` prefix and are squashed before the final commit.

**Note**: The implementer now has a "### 0. Session Context" section (from the harness-improvements project), but the numbered workflow (1. Setup, 2. Implement, 3. Validate, 4. Record, 5. Output) is unchanged. Insert the new section between 3 and 4.

**What to add** (insert before the existing "### 4. Record" section, as a new "### 3b. Checkpoint" step):

```markdown
### 3b. Checkpoint (after each logical step)

After each meaningful implementation step (e.g., test written, root cause fixed, validation passing), create a WIP commit:

```bash
git add -A && git commit -m "wip: {what this step accomplished}"
```

WIP commits provide rollback points if a later step goes wrong. Before your final commit (step 4), squash all WIP commits into one clean conventional commit:

```bash
git reset --soft $(git merge-base HEAD main) && git add -A
```

Then create the final commit as usual.
```

**Key decisions**:
- `wip:` prefix makes it clear these are intermediate, not final
- Squash before final commit keeps git history clean
- `git reset --soft` preserves all changes while collapsing commits
- Adding as "3b" rather than renumbering to minimize diff

**Implementation steps**:
1. Read `agents/implementer.md`
2. Insert the checkpoint section between existing sections 3 (Validate) and 4 (Record)
3. Renumber section 4 to 4 (keeping "Record" name) — the new section is 3b

### Hooks.json Update

**Overview**: Add the doom-loop hook to the PostToolUse Bash hooks array.

**Implementation steps**:
1. Read `hooks/hooks.json`
2. Add `doom-loop-detect.sh` entry to PostToolUse Bash hooks

### Post-PR Cleanup Update

**Overview**: Add `.case-doom-loop-state` to the list of files cleaned up after PR creation.

**Implementation steps**:
1. Read `hooks/post-pr-cleanup.sh`
2. Add `rm -f .case-doom-loop-state` alongside existing marker cleanup

## Testing Requirements

### Manual Testing

- [ ] `bash -n hooks/doom-loop-detect.sh` passes (syntax check)
- [ ] Hook exits 0 when `.case-active` doesn't exist
- [ ] Hook exits 0 when command succeeds
- [ ] Hook exits 0 on first failure
- [ ] Hook exits 2 after 3 consecutive identical failures
- [ ] Hook resets counter when a different error occurs
- [ ] Hook resets counter when a command succeeds
- [ ] `.case-doom-loop-state` is cleaned up by post-pr-cleanup

## Validation Commands

```bash
# Syntax check
bash -n hooks/doom-loop-detect.sh

# Verify hooks.json is valid JSON
python3 -c "import json; json.load(open('hooks/hooks.json'))"

# Verify post-pr-cleanup includes new state file
grep "doom-loop-state" hooks/post-pr-cleanup.sh

# Verify implementer has checkpoint section
grep -c "Checkpoint" agents/implementer.md  # should be >= 1
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
