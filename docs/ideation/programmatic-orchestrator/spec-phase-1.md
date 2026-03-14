# Spec Phase 1: Foundation & Agent Runner

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Phase 1 creates the project scaffolding and foundational modules: type definitions, safe script execution, AGENT_RESULT parsing, task state management, and the agent runner that spawns Claude Code sessions via the SDK. After this phase, we can spawn a single agent, capture its structured output, and manage task state — the building blocks for the full pipeline.

All script invocations use `execFile` (via `node:child_process`) instead of `exec` to prevent shell injection. The orchestrator wraps existing bash scripts rather than reimplementing their logic.

## Feedback Strategy

**Inner-loop command**: `pnpm vitest run`

**Playground**: Test suite — most Phase 1 code is pure functions (parsing, state transitions) with clear inputs/outputs. Tests run in milliseconds.

## File Changes

### New Files

| File Path                                  | Purpose                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `package.json`                             | Project manifest with dependencies                           |
| `tsconfig.json`                            | TypeScript config (strict, ESM, ES2022)                      |
| `vitest.config.ts`                         | Test runner config                                           |
| `src/types.ts`                             | All shared type definitions                                  |
| `src/util/parse-agent-result.ts`           | Extract + validate AGENT_RESULT JSON from agent output       |
| `src/util/run-script.ts`                   | Safe script runner using execFile                            |
| `src/util/logger.ts`                       | Structured JSON-lines logger to stderr                       |
| `src/state/task-store.ts`                  | Read/write task.json via task-status.sh wrapper              |
| `src/state/transitions.ts`                 | Determine pipeline entry phase from task state               |
| `src/config.ts`                            | Load projects.json, resolve paths, build PipelineConfig      |
| `src/agent-runner.ts`                      | Spawn Claude Code via SDK, stream output, parse AGENT_RESULT |
| `src/__tests__/parse-agent-result.test.ts` | Tests for AGENT_RESULT parser                                |
| `src/__tests__/transitions.test.ts`        | Tests for entry phase determination                          |

## Implementation Details

See contract.md for full type definitions and implementation specifications.

## Validation Commands

```bash
pnpm tsc --noEmit
pnpm vitest run
```
