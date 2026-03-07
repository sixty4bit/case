# Convention: Pull Requests

## PR Structure

- **One concern per PR**. Don't mix features with refactors or unrelated fixes.
- **Small PRs preferred**. Easier to review, less risk per merge.
- **Title**: Short, imperative, follows conventional commit format when possible.
- **Description**: Explain the **why**. Link to relevant issues or context.

## Required Checks Before Merge

Every PR must pass these checks (where the repo has them configured):

| Check | cli | authkit-nextjs | authkit-session | authkit-tanstack-start | skills |
|-------|-----|---------------|-----------------|----------------------|--------|
| Tests | `pnpm test` | `pnpm test` | `pnpm test` | `vitest run` | `pnpm test` |
| Types | `pnpm typecheck` | `pnpm typecheck` | `pnpm run typecheck` | `pnpm run typecheck` | -- |
| Lint | `pnpm lint` (oxlint) | `pnpm run lint` (eslint) | -- | -- | `pnpm lint` (oxlint) |
| Format | `pnpm format` (oxfmt) | `pnpm prettier` | `pnpm run prettier` | `pnpm run prettier` | `pnpm format` (oxfmt) |
| Build | `pnpm build` | `pnpm run build` | `pnpm run build` | `pnpm build` | -- |

Run these locally before pushing. Some repos have no CI workflows configured; local verification is the gate.

## Changelog Considerations

- Conventional commit messages drive release-please changelogs (CLI repo).
- Use clear, user-facing language in commit subjects -- they become changelog entries.
- `feat:` and `fix:` commits appear in changelogs. `chore:` and `refactor:` do not.
- Breaking changes (`feat!:`, `fix!:`) get a dedicated section in the changelog.

## PR Checklist

Before requesting review:

1. All checks listed above pass locally
2. New public API surfaces have test coverage
3. No files with secrets or credentials committed
4. Commit messages follow conventional commits format
5. If the change is user-facing, the commit subject reads well as a changelog entry
6. If adding a new file, verify it's under the size guidance (~300 lines, see [code-style.md](code-style.md))

## Merging

- Squash-and-merge for single-concern PRs (keeps history clean).
- Merge commit if the PR contains multiple meaningful commits worth preserving.
- Delete the branch after merge.
