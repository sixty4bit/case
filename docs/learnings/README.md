# Repo Learnings

Tactical knowledge accumulated by the retrospective agent across pipeline runs. Each file corresponds to a repo in `projects.json`.

## How it works

1. After every `/case` pipeline run, the retrospective agent analyzes what happened
2. If it discovers tactical knowledge specific to a repo, it appends to that repo's learnings file
3. The implementer agent reads the relevant learnings file during setup, before writing code
4. If the same issue appears 3+ times in a learnings file, the retrospective escalates it to a convention or golden principle

## Format

Each entry is a dated bullet point with context:

```markdown
- **2026-03-08** — `src/middleware.ts`: Mock `next/headers` as a module, not individual exports. Individual mocks cause type errors in strict mode. (from task authkit-nextjs-1-issue-53)
```

## Rules

- Agents append entries — never edit or remove existing ones
- Entries must reference the source task
- Keep entries to 1-2 lines — tactical, not narrative
- If an entry is later proven wrong, append a correction entry rather than deleting
