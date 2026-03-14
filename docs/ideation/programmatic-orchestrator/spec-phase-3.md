# Spec Phase 3: Pipeline Runner & Integration

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Phase 3 wires everything together: the pipeline runner (core loop), notification system, CLI entry point, schema update, and skill integration. The pipeline runner is a `while` loop with a `switch` statement — each case calls the corresponding phase module from Phase 2 and handles success/failure branching based on the pipeline mode (attended/unattended).

## Feedback Strategy

**Inner-loop command**: `pnpm vitest run`

**Playground**: Test suite with mock phases — test the pipeline loop branching, notification logic, and CLI argument parsing.

## File Changes

### New Files

| File Path                        | Purpose                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| `src/pipeline.ts`                | Core pipeline loop — while/switch replacing SKILL.md Steps 4-9           |
| `src/notify.ts`                  | Notification system — attended (readline) vs unattended (auto-abort)     |
| `src/index.ts`                   | CLI entry point — argument parsing, config building, pipeline invocation |
| `src/__tests__/pipeline.test.ts` | Tests for pipeline flow control                                          |

### Modified Files

| File Path                | Changes                                        |
| ------------------------ | ---------------------------------------------- |
| `tasks/task.schema.json` | Add `mode` field                               |
| `skills/case/SKILL.md`   | Add orchestrator dispatch section after Step 3 |

## Validation Commands

```bash
pnpm tsc --noEmit
pnpm vitest run
npx tsx src/index.ts --task tasks/active/<task>.task.json --dry-run
```
