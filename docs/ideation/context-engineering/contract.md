# Context Engineering Improvements Contract

**Created**: 2026-03-08
**Confidence Score**: 96/100
**Status**: Approved

## Problem Statement

Agents operating through the case harness lose effectiveness on long-running tasks due to context window pressure, instruction decay, and lack of accumulated knowledge across runs. When context gets compacted mid-task, critical information from task files can be lost. When agents get stuck, they burn tokens retrying the same failing approach with no circuit-breaker. And each task starts from zero — the harness has no structured way to carry tactical knowledge from completed tasks into future ones.

These problems were identified by analyzing the OpenDev technical report (arxiv:2603.05344), which documents engineering patterns for terminal-native coding agents. Several patterns directly address weaknesses in the current case harness.

## Goals

1. **Survive context compaction** — task files structured so critical info persists when LLMs compress older context
2. **Break doom loops** — mechanical enforcement (hook) that detects repeated failures and forces agents to stop rather than burn tokens
3. **Enable mid-task rollback** — WIP commits after each logical step so agents (or humans) can revert to a known-good state
4. **Accumulate tactical knowledge** — per-repo learnings files that the retrospective agent populates, making each run benefit from previous runs
5. **Escalate through the retrospective** — retrospective agent scans for repeated violations and strengthens relevant convention docs
6. **Optimize for prompt caching** — convention for CLAUDE.md ordering that maximizes API-level cache hits across agent sessions
7. **Document all changes** — README reflects the new capabilities

## Success Criteria

- [ ] All task templates have a mission summary block at the top (lines 1-5)
- [ ] A doom-loop detection hook exists and blocks agents after N repeated failures
- [ ] Implementer agent instructions include WIP commit convention
- [ ] `docs/learnings/` directory exists with empty per-repo files
- [ ] Retrospective agent instructions include learnings-file maintenance
- [ ] Retrospective agent instructions include violation escalation
- [ ] Convention doc exists for CLAUDE.md ordering (stable-first, volatile-last)
- [ ] README.md accurately reflects all new capabilities and files
- [ ] `philosophy.md` updated with context engineering principles from the paper
- [ ] All existing tests and checks still pass (`scripts/check.sh`)

## Scope Boundaries

### In Scope

- Restructure task templates with compaction-aware mission summary
- Create doom-loop detection hook (shell script + hooks.json update)
- Add WIP commit convention to implementer agent prompt
- Create `docs/learnings/` with empty per-repo files
- Extend retrospective agent to maintain learnings files and escalate violations
- Create `docs/conventions/claude-md-ordering.md`
- Update `docs/philosophy.md` with paper-derived principles
- Comprehensive README update (including pre-existing undocumented changes)

### Out of Scope

- Updating target repos' CLAUDE.md files — convention doc only, apply via separate tasks
- Multi-model routing or tool registry changes — Claude Code's responsibility
- LSP integration — out of scope for the harness
- Safety approval persistence — Claude Code handles this
- Changes to the /case skill orchestrator logic

### Future Considerations

- Doom-loop hook could report metrics (failure counts per task) for trend analysis
- Learnings files could be auto-injected into agent context when dispatching to that repo
- Prompt cache optimization could be enforced via a `check.sh` rule that validates CLAUDE.md ordering

## Execution Plan

### Dependency Graph

```
Phase 1: Foundation (templates, philosophy, convention) ──┐
Phase 2: Agent Resilience (doom-loop hook, WIP commits)    ├── Phase 4: README Update
Phase 3: Knowledge Accumulation (learnings, retrospective) ──┘
```

Phases 1-3 are independent. Phase 4 depends on all of them.

### Execution Steps

**Strategy**: Hybrid (Phases 1-3 parallel, then Phase 4 sequential)

1. **Phases 1, 2 & 3** — parallel first wave _(independent)_

   Start one Claude Code session, enter delegate mode (Shift+Tab), paste the agent team prompt below.

2. **Phase 4** — README Update _(blocked by Phases 1-3)_
   ```
   /execute-spec docs/ideation/context-engineering/spec-phase-4.md
   ```

### Agent Team Prompt

```
Implement 3 independent phases of the context-engineering project in parallel.
Each phase modifies different files with no overlap. Create an agent team with
3 teammates, each assigned one phase.

Spawn 3 teammates with plan approval required. Each teammate should:
1. Read their assigned spec file
2. Explore the codebase for relevant patterns (especially agents/, hooks/, docs/, tasks/)
3. Plan their implementation approach and wait for approval
4. Implement following spec and codebase patterns
5. Run validation commands from their spec after implementation

Teammates:

1. "Foundation" — docs/ideation/context-engineering/spec-phase-1.md
   Task template mission summaries, philosophy update, CLAUDE.md ordering convention.
   Touches: tasks/templates/*.md, docs/philosophy.md, docs/conventions/claude-md-ordering.md, tasks/README.md

2. "Agent Resilience" — docs/ideation/context-engineering/spec-phase-2.md
   Doom-loop detection hook and WIP commit convention in implementer.
   Touches: hooks/doom-loop-detect.sh, hooks/hooks.json, hooks/post-pr-cleanup.sh, agents/implementer.md

3. "Knowledge Accumulation" — docs/ideation/context-engineering/spec-phase-3.md
   Per-repo learnings files and retrospective agent updates.
   Touches: docs/learnings/*.md, agents/retrospective.md, agents/implementer.md, AGENTS.md

Coordinate on agents/implementer.md — both teammates 2 and 3 modify it.
Teammate 2 adds the WIP checkpoint section (between sections 3 and 4).
Teammate 3 adds a learnings file read to the setup section (step 6).
Only one teammate should modify implementer.md at a time.
```

---

_This contract was generated from analysis of the OpenDev technical report (arxiv:2603.05344) applied to the case harness._
