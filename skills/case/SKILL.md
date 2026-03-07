---
name: case
description: WorkOS OSS harness — cross-repo orchestration, conventions, playbooks, and task dispatch. Use when working across WorkOS open source repos or when you need harness context.
---

# Case — WorkOS OSS Harness

You are operating within the Case harness for WorkOS open source projects.
Humans steer. Agents execute. When agents struggle, fix the harness.

## Always Load

Read these first for landscape and rules:
- `../../AGENTS.md` — project landscape, navigation, task dispatch overview
- `../../docs/golden-principles.md` — invariants to follow across all repos

## Task Routing

Based on the user's request, load the relevant context:

| If the task involves... | Read... |
| --- | --- |
| The WorkOS CLI | `../../docs/architecture/cli.md` and `../../docs/playbooks/add-cli-command.md` |
| New AuthKit framework integration | `../../docs/architecture/authkit-framework.md` and `../../docs/playbooks/add-authkit-framework.md` |
| Session management (authkit-session) | `../../docs/architecture/authkit-session.md` |
| Skills plugin | `../../docs/architecture/skills-plugin.md` |
| Bug fix in any repo | `../../docs/playbooks/fix-bug.md` |
| Cross-repo change | `../../docs/playbooks/cross-repo-update.md` |
| Commit conventions | `../../docs/conventions/commits.md` |
| Testing standards | `../../docs/conventions/testing.md` |
| PR structure / review | `../../docs/conventions/pull-requests.md` |
| Code style / formatting | `../../docs/conventions/code-style.md` |

## Project Manifest

Full repo metadata (paths, commands, remotes): `../../projects.json`

## Task Dispatch

To create a task for async agent execution:

1. Choose template from `../../tasks/templates/`
2. Fill in `{placeholder}` fields
3. Save to `../../tasks/active/{repo}-{n}-{slug}.md`

Available templates:
- `../../tasks/templates/cli-command.md` — add a CLI command
- `../../tasks/templates/authkit-framework.md` — new AuthKit framework integration
- `../../tasks/templates/bug-fix.md` — fix a bug in any repo
- `../../tasks/templates/cross-repo-update.md` — coordinated cross-repo change

Format spec: `../../tasks/README.md`

## Working in a Target Repo

Before making changes in any target repo:

1. Read that repo's `CLAUDE.md` or `CLAUDE.local.md` for project-specific instructions
2. Run `../../scripts/bootstrap.sh {repo-name}` to verify readiness
3. Follow the repo's PR checklist before opening a PR
4. Run `../../scripts/check.sh --repo {repo-name}` to verify conventions

## Improving the Harness

When an agent struggles or produces poor output, the fix goes into case/, not the code:

- Missing pattern? Add to `../../docs/architecture/`
- Unclear convention? Update `../../docs/conventions/`
- Recurring task? Add a playbook in `../../docs/playbooks/` and template in `../../tasks/templates/`
- Agent violation? Add to `../../docs/golden-principles.md` and `../../scripts/check.sh`
- Wrong approach? Update the relevant `CLAUDE.md` in the target repo
