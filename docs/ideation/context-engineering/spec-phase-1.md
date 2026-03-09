# Implementation Spec: Context Engineering - Phase 1 (Foundation)

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

Phase 1 establishes the foundational patterns that Phases 2 and 3 build on. Three changes:

1. **Compaction-aware task templates** — add a 2-3 line "mission summary" block at the top of every task template. When LLMs compress older context during long sessions, the top of a document is most likely to survive. This is the cheapest, highest-impact change.

2. **Philosophy update** — add context engineering principles derived from the OpenDev paper to `docs/philosophy.md`. This provides the intellectual foundation for the other changes.

3. **CLAUDE.md ordering convention** — create a convention doc that describes how to structure CLAUDE.md files in target repos for optimal prompt caching (stable content first, volatile content last).

Pattern to follow: existing task templates in `tasks/templates/` and existing convention docs in `docs/conventions/`.

## Feedback Strategy

**Inner-loop command**: `bash scripts/check.sh`

**Playground**: None needed — these are markdown file changes. Validate by reading the output.

**Why this approach**: All changes are documentation/template changes. No code to test.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `docs/conventions/claude-md-ordering.md` | Convention for CLAUDE.md structure to optimize prompt caching |

### Modified Files

| File Path | Changes |
|-----------|---------|
| `tasks/templates/bug-fix.md` | Add mission summary block at top |
| `tasks/templates/cli-command.md` | Add mission summary block at top |
| `tasks/templates/authkit-framework.md` | Add mission summary block at top |
| `tasks/templates/cross-repo-update.md` | Add mission summary block at top |
| `docs/philosophy.md` | Add "Context Engineering" section with paper-derived principles |
| `tasks/README.md` | Document mission summary convention in task format spec |

## Implementation Details

### Task Template Mission Summary

**Pattern to follow**: `tasks/templates/bug-fix.md` (modify in place)

**Overview**: Every task template gets a 2-3 line fenced block at the very top, before the `# Title`. This block summarizes the mission in a way that survives context compaction.

The format:

```markdown
> **Mission**: {one-line what + why}
> **Repo**: {target repo path}
> **Done when**: {single most important acceptance criterion}

# Fix: {brief description}

## Objective
...
```

**Key decisions**:
- Use blockquote format (`>`) for visual distinction from the rest of the task
- Keep it to exactly 3 lines — enough to orient an agent, short enough to always survive compaction
- "Done when" is the single most critical acceptance criterion, not all of them

**Implementation steps**:
1. Add mission summary block to `tasks/templates/bug-fix.md`
2. Add mission summary block to `tasks/templates/cli-command.md`
3. Add mission summary block to `tasks/templates/authkit-framework.md`
4. Add mission summary block to `tasks/templates/cross-repo-update.md`
5. Update `tasks/README.md` Required Sections table to include Mission Summary
6. Update the example in `tasks/README.md` to show the mission summary

### Philosophy Update

**Pattern to follow**: existing sections in `docs/philosophy.md`

**Overview**: Add a "Context Engineering" section to `docs/philosophy.md` with principles derived from the OpenDev paper. These provide the rationale for the concrete changes in Phases 2 and 3.

Principles to add:
- **Context survives compaction when structured for it.** Put the most critical information at the top of any document an agent will read during a long session. Summaries first, details second.
- **Doom loops are a system failure, not an agent failure.** When an agent retries the same failing approach, the harness should break the cycle mechanically — not rely on the agent to self-correct.
- **Knowledge compounds across runs.** Each pipeline run should leave the harness smarter. Tactical learnings from completed tasks feed into future tasks targeting the same repo.
- **Stable instructions first, volatile details last.** LLM providers cache prompt prefixes. Structuring CLAUDE.md with stable rules at the top and temporary notes at the bottom maximizes cache hits.

**Implementation steps**:
1. Read current `docs/philosophy.md`
2. Add new "## Context Engineering" section after the existing "## Evolution" section
3. Add the 4 principles above in the same format as existing entries

### CLAUDE.md Ordering Convention

**Pattern to follow**: `docs/conventions/commits.md` (same structure: title, rationale, rules, examples)

**Overview**: New convention doc explaining how to structure CLAUDE.md files in target repos for prompt cache optimization. This is advisory — we document the pattern but apply it to target repos via separate tasks.

**Structure**:
1. **Rationale** — LLM providers cache prompt prefixes. CLAUDE.md is injected early in the system prompt. Stable content at the top = more cache hits.
2. **Ordering rules** — identity/purpose first, then rules/conventions, then architecture, then commands, then volatile content (known issues, temporary workarounds) last
3. **Example** — before/after of a CLAUDE.md showing the ordering
4. **Anti-patterns** — putting "Current Issues" or "TODO" at the top; mixing stable and volatile content

**Implementation steps**:
1. Create `docs/conventions/claude-md-ordering.md`
2. Write rationale, rules, example, and anti-patterns sections

## Validation Commands

```bash
# Verify all templates have mission summary
grep -l "Mission" tasks/templates/*.md | wc -l  # should equal number of templates

# Verify philosophy update
grep "Context Engineering" docs/philosophy.md

# Verify convention doc exists
test -f docs/conventions/claude-md-ordering.md && echo "OK"

# Verify check script still works
bash scripts/check.sh
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
