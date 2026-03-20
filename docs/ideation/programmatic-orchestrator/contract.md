# Programmatic Orchestrator Contract

**Created**: 2026-03-14
**Confidence Score**: 95/100
**Status**: Draft

## Problem Statement

The Case harness defines its 6-agent pipeline (orchestrator -> implementer -> verifier -> reviewer -> closer -> retrospective) as ~400 lines of prose in `skills/case/SKILL.md`. Claude Code interprets this prose as a flowchart at runtime. This works but creates four problems:

1. **Flow control is non-deterministic.** "If reviewer finds criticals, loop back to implementer" is a sentence the model reads and hopefully follows. It's not an `if/else` a runtime executes. The model can misinterpret, skip steps, or apply the wrong branch.
2. **Retry caps are reactive.** The doom-loop hook fires after 3 _identical_ failures. A programmatic orchestrator caps retries proactively as a loop condition _before_ they happen.
3. **Re-entry depends on model interpretation.** When a pipeline is interrupted mid-run and resumed, the model must read a status table and determine where to pick up. A TypeScript function reads `task.status` and returns the next phase deterministically.
4. **No persistent process.** Can't receive webhooks, Slack triggers, or CI failure notifications. Every run starts fresh.

## Goals

1. **Deterministic pipeline flow control** — Replace SKILL.md Steps 0-9 with a TypeScript `while` loop and `switch` statement. Each phase transition is an `if/else`, not an LLM interpretation.
2. **Hard-capped retries** — Implement phase max 1 intelligent retry. Verify/review/close phases: 0 retries, surface to user (attended) or abort (unattended).
3. **Role-specific context assembly** — Each agent receives only the context it needs, assembled deterministically before spawning. No LLM decisions in context gathering.
4. **Attended and unattended modes** — Task-level `mode` field. Attended = human prompted on failure. Unattended = auto-abort + notification.
5. **Preserve existing primitives** — Agent `.md` prompts, hooks, scripts, and learnings files remain unchanged. The orchestrator wraps them, doesn't replace them.

## Success Criteria

- [ ] Pipeline runs end-to-end via `npx tsx src/index.ts --task <path>` producing a PR
- [ ] All hooks (pre-commit, pre-push, pre-PR, doom-loop) still fire inside agent sessions
- [ ] Evidence markers (.case-tested, .case-manual-tested, .case-reviewed) are created correctly
- [ ] Task JSON status transitions are valid (enforced by existing task-status.sh)
- [ ] Run log entry appended to docs/run-log.jsonl on completion
- [ ] Re-entry works: interrupt pipeline, re-run, resumes at correct phase
- [ ] Unattended mode auto-aborts on failure without human prompt
- [ ] AGENT_RESULT JSON is reliably parsed from agent output
- [ ] Context assembly gives each agent role-appropriate context (not everything)
- [ ] Unit tests pass for AGENT_RESULT parser and state transition logic

## Scope Boundaries

### In Scope

- TypeScript orchestrator with CLI entry point
- Pipeline flow control replacing SKILL.md Steps 4-9 (implement -> retrospective)
- Agent spawning via Claude Code SDK (`@anthropic-ai/claude-code-sdk`)
- AGENT_RESULT parsing from agent output streams
- State management wrapping existing `task-status.sh`
- Per-role context assembly
- Attended vs unattended modes
- Task schema `mode` field addition
- Unit tests for parser and transitions
- Dry-run mode for testing without agent spawning

### Out of Scope

- Steps 0-3 (issue parsing, task creation, branch setup) — remain in SKILL.md skill for now
- Webhook/Slack entry points — Wave 5
- Parallel agent execution — Wave 5
- Database for state (SQLite) — only needed at scale
- Multi-model review — deferred
- Proactive work finding — Wave 5

### Future Considerations

- Webhook entry points (GitHub, Slack, CI failure triggers)
- Parallel pipeline execution (multiple tasks simultaneously)
- SQLite state store replacing flat files
- Metrics dashboard from run-log.jsonl

## Execution Plan

### Dependency Graph

```
Phase 1: Foundation & Agent Runner
  +-- Phase 2: Context Assembly & Pipeline Phases
        +-- Phase 3: Pipeline Runner & Integration
```

### Execution Steps

**Strategy**: Sequential

1. **Phase 1 — Foundation & Agent Runner** _(blocking)_

   ```
   /execute-spec docs/ideation/programmatic-orchestrator/spec-phase-1.md
   ```

2. **Phase 2 — Context Assembly & Pipeline Phases** _(blocked by Phase 1)_

   ```
   /execute-spec docs/ideation/programmatic-orchestrator/spec-phase-2.md
   ```

3. **Phase 3 — Pipeline Runner & Integration** _(blocked by Phase 2)_
   ```
   /execute-spec docs/ideation/programmatic-orchestrator/spec-phase-3.md
   ```
