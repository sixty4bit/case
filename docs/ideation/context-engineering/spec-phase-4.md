# Implementation Spec: Context Engineering - Phase 4 (README Update)

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

Phase 4 is a comprehensive README update that reflects all changes from Phases 1-3, plus any pre-existing changes that haven't been documented yet. This requires reading the current README, comparing it against the actual state of the repo, and updating all sections.

This is a documentation-only phase — no code changes.

## Feedback Strategy

**Inner-loop command**: None

**Playground**: None — README is markdown. Visual review.

**Why this approach**: Documentation review is best done by reading, not by automated tests.

## File Changes

### Modified Files

| File Path   | Changes                                              |
| ----------- | ---------------------------------------------------- |
| `README.md` | Comprehensive update to reflect all new capabilities |

## Implementation Details

### README Audit and Update

**Pattern to follow**: existing README structure (keep the same sections, update content)

**Overview**: Read the current README alongside the actual repo state. Update all sections that are stale or incomplete. This includes changes from BOTH the harness-improvements project (uncommitted) AND the context-engineering project (phases 1-3).

**Audit checklist** — compare README against reality for each section:

1. **"How It Works" section**:
   - The pipeline now has **6 agents** (implementer, verifier, reviewer, closer, retrospective) — was described as "five-agent pipeline"
   - The mermaid diagram needs updating: add reviewer between verifier and closer
   - Add reviewer to the pipeline flow description

2. **"The Five Agents" table** → rename to "The Six Agents" or "The Agents":
   - Add reviewer agent row (responsibility: review diff against golden principles, never does: edit code/commit/run tests)
   - Retrospective now "applies" improvements directly (not just "suggests") — update "Responsibility" and "Never does" columns
   - Retrospective now maintains learnings files — add to "Responsibility"

3. **"Self-Improvement" section**:
   - The mermaid diagram shows retrospective as "Suggest" → "Engineer reviews + applies"
   - This is outdated — retrospective now applies improvements directly AND maintains per-repo learnings
   - Update the diagram to show: retrospective reads progress log → applies fixes to harness docs/scripts/agents → updates repo learnings

4. **"What's in the Harness" tree**:
   - Add `agents/reviewer.md` to agents section
   - Add `hooks/doom-loop-detect.sh` to hooks section
   - Add `docs/learnings/` directory
   - Add `docs/conventions/entropy-management.md`
   - Add `docs/conventions/claude-md-ordering.md`
   - Add `scripts/session-start.sh`
   - Add `scripts/parse-test-output.sh`
   - Add `scripts/mark-reviewed.sh`
   - Add `scripts/entropy-scan.sh`
   - Verify all other entries are still accurate

5. **"Enforcement" table**:
   - Add doom-loop detection hook entry
   - Add review evidence gate (`pre-pr-check.sh` now checks `.case-reviewed`)
   - Verify existing hook descriptions are accurate
   - Add `mark-reviewed.sh` to evidence markers section

6. **"Verification Tools" section**:
   - Add structured test output (JSON reporter + parse-test-output.sh)
   - Add session-start.sh as a context tool
   - Add reviewer agent as a verification tool

7. **"Philosophy" section**:
   - Add mention of context engineering principles

8. **"Task Tracking" section**:
   - Mission summary is now part of task templates — mention this
   - Task lifecycle may need updating if reviewer agent changes the flow

9. **New section: "Entropy Management"**:
   - Reference the convention doc and entropy-scan.sh
   - Describe /loop integration for continuous scanning

10. **General review**:
    - Read every section and verify claims against actual files
    - Check for any capabilities added since the last README update that aren't documented
    - Look for stale references (wrong paths, renamed files, removed features)
    - Ensure the pipeline flow description matches the actual agent dispatch order

**Implementation steps**:

1. Read `README.md` thoroughly
2. Read actual files referenced by README (agents/, hooks/, scripts/, docs/)
3. Compare and identify all discrepancies
4. Make updates section by section
5. Re-read the updated README for coherence

**Key decisions**:

- Preserve the existing structure — don't reorganize, just update
- Keep the same voice and detail level
- Update mermaid diagrams to match reality
- When in doubt about whether something changed, check the actual file

## Validation Commands

```bash
# Verify README exists and is non-empty
test -s README.md && echo "OK"

# Verify context-engineering items are mentioned
grep "doom-loop" README.md && echo "OK: doom-loop mentioned"
grep "learnings" README.md && echo "OK: learnings mentioned"
grep -i "context engineering" README.md && echo "OK: context engineering mentioned"

# Verify harness-improvements items are mentioned
grep "reviewer" README.md && echo "OK: reviewer mentioned"
grep "session-start" README.md && echo "OK: session-start mentioned"
grep "entropy" README.md && echo "OK: entropy management mentioned"
grep "parse-test-output\|structured test" README.md && echo "OK: structured test output mentioned"
grep "mark-reviewed" README.md && echo "OK: mark-reviewed mentioned"

# Verify agent count matches reality
ls agents/*.md | wc -l  # should be 5 (implementer, verifier, reviewer, closer, retrospective)
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
