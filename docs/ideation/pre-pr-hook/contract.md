# Pre-PR Hook Contract

**Created**: 2026-03-08
**Confidence Score**: 98/100
**Status**: Approved

## Problem Statement

The `/case` skill has a pre-PR checklist that agents consistently skip. The checklist is loaded at the start of the session but by the time the agent finishes 50+ tool calls of implementation work, the instructions are buried in context. Moving the checklist to the end of the SKILL.md and using stronger language hasn't worked — the agent acknowledges the rules when asked but doesn't follow them unprompted.

This is a structural problem, not a knowledge problem. Instructions alone can't enforce behavior across a long context window. Mechanical enforcement is needed — the same principle the OpenAI harness engineering team used with custom linters that block violations.

## Goals

1. **Agent cannot run `gh pr create` without passing checks when `/case` is active** — a PreToolUse hook intercepts Bash commands matching `gh pr create`, checks for a `.case-active` marker (created by `/case` at workflow start), and runs verification. If checks fail, the hook blocks execution and tells the agent what's missing.
2. **Scoped to /case only** — the hook passes through silently when `.case-active` doesn't exist, so normal (non-case) PR creation is unaffected.
3. **Automatic cleanup** — a PostToolUse hook deletes `.case-active` after `gh pr create` succeeds. Stale markers (>24h) are auto-cleaned.
4. **Checks are specific and verifiable** — not "did you test?" but "is there evidence of testing?"
5. **Hook lives in the case plugin** — travels with the plugin, only active when case is installed.

## Success Criteria

- [ ] `/case` skill creates `.case-active` marker when starting an issue-based workflow
- [ ] PreToolUse hook intercepts `gh pr create` Bash calls
- [ ] Hook passes through silently when `.case-active` doesn't exist (non-case PRs unaffected)
- [ ] Check: current branch is not main/master — blocks with "create a feature branch first"
- [ ] Check: tests were run — looks for `.case-tested` marker that the SKILL.md checklist tells agents to create after running tests
- [ ] Check: PR body contains verification notes — parses the `--body` argument for a "Verification" or "tested" section
- [ ] Check: manual testing evidence — looks for `.case-manual-tested` marker that the SKILL.md checklist tells agents to create after playwright testing
- [ ] Hook output includes remediation instructions — tells the agent exactly what to do to pass
- [ ] Hook does not block when all checks pass — transparent when everything is in order
- [ ] PostToolUse hook deletes `.case-active`, `.case-tested`, `.case-manual-tested` after successful `gh pr create`
- [ ] Stale `.case-active` markers (>24h old) are auto-cleaned by the PreToolUse hook

## Scope Boundaries

### In Scope

- PreToolUse hook script that intercepts `gh pr create` (only when `.case-active` exists)
- PostToolUse hook script that cleans up marker files after successful PR creation
- Check logic for: branch name, test evidence marker, PR body verification notes, manual testing marker
- Remediation messages in hook output
- Plugin-level hook configuration
- Marker file convention (`.case-active`, `.case-tested`, `.case-manual-tested`)
- Update SKILL.md to create markers at each checklist step
- Update SKILL.md to create `.case-active` at workflow start

### Out of Scope

- Modifying the global ~/.claude/settings.json hooks — plugin-scoped only
- Blocking other git commands (push, commit) — only `gh pr create`
- Running the actual tests from the hook — too slow, just verify they were run
- Screenshot/video verification — no reliable way to check this mechanically yet

### Future Considerations

- Hook that moves the task file to done/ after PR creation
- Hook that verifies security audit was run for auth-related changes
- Integration with CI to verify checks on the remote side too

## Execution Plan

**Strategy**: Single spec, no phasing needed.

```bash
/execute-spec docs/ideation/pre-pr-hook/spec.md
```
