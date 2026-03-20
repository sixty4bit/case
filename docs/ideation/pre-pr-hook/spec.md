# Implementation Spec: Pre-PR Hook

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

Two hooks — a PreToolUse hook that intercepts `gh pr create` and a PostToolUse hook that cleans up marker files after success.

The PreToolUse hook uses a `matcher` for `Bash` tool calls. The hook script checks if the Bash command contains `gh pr create`. If it does AND `.case-active` exists in the working directory, it runs the verification checks. If `.case-active` doesn't exist, it passes through silently (non-case PRs are unaffected).

The marker file convention: the `/case` SKILL.md instructs agents to create marker files as they complete checklist steps. The hook then checks for these markers. This turns the soft checklist into a hard gate.

Marker files:

- `.case-active` — created by `/case` at workflow start. Signals that hooks should enforce.
- `.case-tested` — created after running tests/typecheck/lint/build.
- `.case-manual-tested` — created after playwright/example app testing.

All markers are plain files in the working directory. They're gitignored.

## Feedback Strategy

**Inner-loop command**: `bash hooks/pre-pr-check.sh --dry-run`

**Playground**: Create marker files manually, then run the hook script to verify it passes/blocks correctly.

**Why this approach**: Hook scripts are bash — test them directly.

## File Changes

### New Files

| File Path                  | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `hooks/hooks.json`         | Hook configuration — declares PreToolUse and PostToolUse hooks |
| `hooks/pre-pr-check.sh`    | PreToolUse script — runs checks before `gh pr create`          |
| `hooks/post-pr-cleanup.sh` | PostToolUse script — cleans up marker files after PR success   |

### Modified Files

| File Path              | Changes                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `skills/case/SKILL.md` | Add marker file creation to the workflow steps and pre-PR checklist |
| `.gitignore`           | Add `.case-active`, `.case-tested`, `.case-manual-tested`           |

## Implementation Details

### hooks/hooks.json

**Pattern to follow**: hookify plugin at `~/.claude/plugins/cache/claude-plugins-official/hookify/*/hooks/hooks.json`

**Overview**: Declares two hooks scoped to Bash tool calls.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/pre-pr-check.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/post-pr-cleanup.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### hooks/pre-pr-check.sh

**Overview**: Receives the tool input via stdin (JSON with the Bash command). Checks if it's a `gh pr create` command. If so, and `.case-active` exists, runs the verification checks. Exits 0 to allow, exits 2 to block (with message on stderr).

**Hook input format** (from Claude Code docs): The hook receives JSON on stdin with `tool_name` and `tool_input` fields. For Bash, `tool_input.command` contains the command string.

**Implementation steps**:

1. Read stdin JSON, extract the command string
2. Check if command contains `gh pr create` — if not, exit 0 (pass through)
3. Check if `.case-active` exists in the working directory — if not, exit 0 (non-case PR, pass through)
4. Check if `.case-active` is stale (>24h old) — if so, delete it and exit 0 with a warning
5. Run checks:
   - **Branch check**: `git branch --show-current` is not `main` or `master`
   - **Test evidence**: `.case-tested` file exists
   - **Manual testing**: `.case-manual-tested` file exists (or the change is docs/config only — check by looking at `git diff --name-only` for src/ files)
   - **PR body verification**: parse the command for `--body` argument, check it contains "verified", "tested", "verification", or "what was tested" (case-insensitive)
6. If any check fails: print remediation to stderr, exit 2 (block)
7. If all pass: exit 0 (allow)

**Error output format** (blocking):

```
CASE PRE-PR CHECK FAILED

[FAIL] Branch: currently on 'main' — create a feature branch first
  FIX: git checkout -b fix/your-change

[FAIL] Tests not verified — .case-tested marker missing
  FIX: Run tests, then create the marker: touch .case-tested

[FAIL] Manual testing not done — .case-manual-tested marker missing
  FIX: Test in the example app with playwright-cli, then: touch .case-manual-tested

[FAIL] PR body missing verification notes
  FIX: Add a "## Verification" section to your PR body describing what you tested

Resolve all failures above, then retry gh pr create.
```

**Key decisions**:

- Use `jq` for JSON parsing if available, fall back to `python3 -c` or grep
- The manual testing check is smart: if `git diff --name-only HEAD~1` only shows non-src files (docs, config, CI), skip the `.case-manual-tested` requirement
- Exit code 2 blocks the tool call in Claude Code hooks

### hooks/post-pr-cleanup.sh

**Overview**: After a successful `gh pr create`, cleans up all marker files.

**Implementation steps**:

1. Read stdin JSON, extract the command string
2. Check if command contains `gh pr create` — if not, exit 0
3. Delete `.case-active`, `.case-tested`, `.case-manual-tested` if they exist
4. Exit 0

### SKILL.md Updates

**Add `.case-active` creation to the issue workflows**:

In the GitHub issue workflow (step 4, after creating task file):

```
Create a `.case-active` marker: `touch .case-active`
```

In the Linear issue workflow (step 4, after creating task file):

```
Create a `.case-active` marker: `touch .case-active`
```

**Update the pre-PR checklist** to include marker creation:

After "Unit tests pass": add `then run: touch .case-tested`
After "Example app tested": add `then run: touch .case-manual-tested`

### .gitignore

Create or update `.gitignore` to include:

```
.case-active
.case-tested
.case-manual-tested
```

## Testing Requirements

- [ ] Hook passes through silently when command is not `gh pr create`
- [ ] Hook passes through silently when `.case-active` doesn't exist
- [ ] Hook blocks when on main branch (with remediation message)
- [ ] Hook blocks when `.case-tested` is missing (with remediation message)
- [ ] Hook blocks when `.case-manual-tested` is missing and src/ files changed (with remediation message)
- [ ] Hook passes when `.case-manual-tested` is missing but only docs/config changed
- [ ] Hook blocks when PR body has no verification section (with remediation message)
- [ ] Hook passes when all checks pass
- [ ] PostToolUse hook cleans up all marker files after `gh pr create`
- [ ] Stale `.case-active` (>24h) is auto-cleaned

## Validation Commands

```bash
# Test the hook script directly
echo '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title test --body test"}}' | bash hooks/pre-pr-check.sh
echo "Exit code: $?"

# Test with markers
touch .case-active .case-tested .case-manual-tested
git checkout -b test-hook-branch
echo '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title test --body \"## Verification\nTested the thing\""}}' | bash hooks/pre-pr-check.sh
echo "Exit code: $?"

# Test cleanup
echo '{"tool_name":"Bash","tool_input":{"command":"gh pr create --title test"}}' | bash hooks/post-pr-cleanup.sh
ls .case-active 2>/dev/null && echo "FAIL: marker not cleaned" || echo "OK: cleaned"

# Clean up test branch
git checkout main
git branch -D test-hook-branch
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
