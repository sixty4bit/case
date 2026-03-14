# Spec Phase 2: Context Assembly & Pipeline Phases

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Phase 2 builds the context assembly system and all five pipeline phase modules. Each phase module follows the same pattern: assemble context -> spawn agent -> parse result -> update task state -> return the next phase. The context assembler reads agent `.md` templates and builds role-specific context payloads deterministically.

Pattern to follow: each phase mirrors its corresponding step in `skills/case/SKILL.md` (Steps 4-9), translated from prose instructions to TypeScript function calls.

## Feedback Strategy

**Inner-loop command**: `pnpm vitest run`

**Playground**: Test suite — phase modules are mostly orchestration logic. Mock the agent runner for fast iteration.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `src/context/assembler.ts` | Per-role context assembly |
| `src/context/prefetch.ts` | Deterministic repo context gathering |
| `src/phases/implement.ts` | Step 4 + 4b: spawn implementer, intelligent retry |
| `src/phases/verify.ts` | Step 5: spawn verifier |
| `src/phases/review.ts` | Step 6: spawn reviewer |
| `src/phases/close.ts` | Step 7: spawn closer |
| `src/phases/retrospective.ts` | Step 9: spawn retrospective in background |
| `src/__tests__/assembler.test.ts` | Tests for context assembly |
| `src/__tests__/implement-phase.test.ts` | Tests for implementer phase logic |

## Validation Commands

```bash
pnpm tsc --noEmit
pnpm vitest run
```
