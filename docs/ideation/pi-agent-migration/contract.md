# Pi Agent Migration Contract

**Created**: 2026-03-18
**Confidence Score**: 96/100
**Status**: Approved

## Problem Statement

The case harness executes agents via `claude --print` — a batch-mode, Claude-only, non-interactive subprocess. This creates three problems:

1. **No interactivity.** Users kick off a pipeline and wait 10+ minutes with no ability to steer, course-correct, or provide context. When an agent gets stuck, it fails and the user has to restart. The `--agent` flag should give users a conversational session with the case system where they can discuss, plan, or just let it execute.

2. **Model lock-in.** Agent execution is hardcoded to Claude. Different tasks benefit from different models — a reasoning model for review, a fast model for simple fixes, a local model for sensitive code. The harness should support any model provider.

3. **Reimplemented primitives.** The harness manually implements streaming (heartbeat timers), tool management (`.md` frontmatter parsing), output parsing (`AGENT_RESULT` delimiters), and session management (task JSON state). Pi provides all of these natively with a cleaner abstraction.

## Goals

1. **Interactive orchestrator via `--agent`**: `xcase --agent 1234` starts a Pi interactive session where the user can discuss, plan, and steer the pipeline. The orchestrator is a conversational agent with pipeline execution as one of its capabilities.

2. **Full Pi stack**: Replace `claude --print` entirely. The orchestrator and all sub-agents (implementer, verifier, reviewer, closer, retrospective) run as Pi sessions — interactive for the orchestrator, batch for sub-agents.

3. **Model flexibility**: Each agent role can be configured with a different model/provider. Configuration via `~/.config/case/config.json` or similar.

4. **Backward compatibility**: `xcase 1234` (no `--agent`) runs the same pipeline non-interactively. Evidence markers, task JSON, conventional commits, PR creation — all harness infrastructure stays.

5. **Incremental migration**: Each phase delivers standalone value. The harness continues working throughout the migration.

## Success Criteria

- [ ] `xcase --agent 1234` starts an interactive Pi session showing real-time tool calls, streaming output
- [ ] User can interject during execution ("try a different approach", "that test failure is expected")
- [ ] User can have a planning discussion before triggering the pipeline ("let's think about how to approach this")
- [ ] `xcase 1234` (no flag) runs the full pipeline non-interactively via Pi batch mode
- [ ] Sub-agents (implementer, verifier, etc.) run as Pi batch sessions, not `claude --print`
- [ ] Model can be configured per agent role (e.g., implementer uses Claude Opus, reviewer uses Gemini)
- [ ] All existing tests pass after migration
- [ ] Evidence markers (`.case-tested`, `.case-manual-tested`, `.case-reviewed`) still work
- [ ] Task JSON status transitions still work
- [ ] `AGENT_RESULT` contract still works (or replaced with Pi-native equivalent)
- [ ] `xcase --agent` without an issue number opens a general planning session

## Scope Boundaries

### In Scope

- Replace `agent-runner.ts` (`claude --print`) with Pi-based agent runner
- Interactive orchestrator session via `--agent` flag
- Per-agent model configuration
- Port agent `.md` prompts to Pi system prompts
- Port case-specific tools (mark-tested, task-status, bootstrap) as Pi TypeBox tools
- Streaming output in interactive mode (tool calls, decisions, results)
- User interjection via Pi's `steer()` / `followUp()` mechanism
- Batch mode (non-interactive) via Pi's `-p` / `--mode json` output

### Out of Scope

- Porting Claude Code skills to Pi extensions — deferred, use Pi's native tools instead
- IDE integrations (Pi is terminal-only, which matches xcase)
- Web UI for pipeline monitoring — separate project
- MCP server integration — Pi has extension-based MCP, defer to later
- Agent teams / parallel sub-agent execution — keep sequential for now
- Context compaction strategy — Pi has `session.compact()` with preservation hints, but optimizing this is separate work

### Future Considerations

- Port ideation skill to work within the Pi orchestrator session
- Port case hooks (pre-PR, post-PR) to Pi extension events (typed, in-process, more powerful than shell scripts)
- Pi extensions for domain-specific tools (WorkOS API testing, AuthKit verification)
- Parallel sub-agent execution via Pi's bash tool + process management
- Web UI using `pi-web-ui` components for remote pipeline monitoring
- Persistent agent memory across sessions (Pi's JSONL session tree enables branching for retry logic)
- Tool factory scoping — `createBashTool(repoPath)` to sandbox agents to their target repo
- Session branching for intelligent retry — branch at failure point instead of respawning with prepended context

## Execution Plan

### Dependency Graph

```
Phase 1: Pi Agent Runner (replace claude --print with Pi batch mode)
  └── Phase 2: Interactive Orchestrator (--agent flag, Pi interactive session)
        └── Phase 3: Model Configuration (per-agent model selection, config file)
```

### Execution Steps

**Strategy**: Sequential (each phase modifies the agent execution layer)

1. **Phase 1 — Pi Agent Runner** _(blocking)_

   New: `src/agent/pi-runner.ts`, `tool-sets.ts`, `prompt-loader.ts` + tests.
   Deleted: `src/agent-runner.ts`, `src/util/parse-frontmatter.ts`.
   Modified: `pipeline.ts`, all phase files (import path), `types.ts`, `package.json`.

   ```bash
   /case:from-ideation docs/ideation/pi-agent-migration
   ```

   After Phase 1, verify: `xcase --dry-run 1234` works identically to before.

2. **Phase 2 — Interactive Orchestrator** _(blocked by Phase 1)_

   New: `src/agent/orchestrator-session.ts`, `tools/pipeline-tool.ts`, `tools/issue-tool.ts`, `tools/task-tool.ts`, `tools/baseline-tool.ts` + tests.
   Modified: `src/index.ts` (--agent flag), `cli-orchestrator.ts` (extract dispatch logic).

   ```bash
   /case:from-ideation docs/ideation/pi-agent-migration
   ```

   After Phase 2, verify: `xcase --agent 1234` gives an interactive session with real-time streaming.

3. **Phase 3 — Model Configuration** _(blocked by Phase 1, parallel-safe with Phase 2)_

   New: `src/agent/config.ts`, `config.schema.json` + tests.
   Modified: `pi-runner.ts`, `orchestrator-session.ts`, `index.ts` (--model flag), `types.ts`.

   ```bash
   /case:from-ideation docs/ideation/pi-agent-migration
   ```

   After Phase 3, verify: configure reviewer to use a different model, confirm it uses the configured model.

Note: Phases 2 and 3 both depend on Phase 1 but don't depend on each other. They modify different files (Phase 2: orchestrator/tools, Phase 3: config/runner). Could be parallelized, but sequential is safer since Phase 3 modifies `pi-runner.ts` which Phase 2 also imports.

---

_This contract was approved on 2026-03-18._
