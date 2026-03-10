# CLI Learnings

Tactical knowledge from completed tasks. Read by agents before working in this repo.

<!-- Retrospective agent appends entries below. Do not edit existing entries. -->

### 2026-03-09 — auto-env-after-login (cli-1)
- `staging-api.ts` has `fetchStagingCredentials(accessToken)` — reusable for any flow needing staging env setup
- `config-store.ts` `saveConfig()` accepts `EnvironmentConfig` — use for programmatic env creation
- `login.ts` OAuth flow already requests `staging-environment:credentials:read` scope — no scope changes needed for staging API calls post-login
- Non-fatal wrapping pattern: wrap side-effect calls in try/catch returning boolean, print hint on failure — used successfully in `provisionStagingEnvironment()`
- CLI-only changes (no frontend UI) can skip Playwright verification — verifier code review + test execution is sufficient
