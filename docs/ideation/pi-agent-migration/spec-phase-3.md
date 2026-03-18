# Implementation Spec: Pi Agent Migration — Phase 3

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Add per-agent model configuration. Each agent role (implementer, verifier, reviewer, closer, retrospective) can use a different model/provider. Configuration lives in `~/.config/case/config.json`. This enables using reasoning models for review, fast models for simple tasks, and local models for sensitive code.

Pi's `getModel(provider, modelId)` already supports 20+ providers with a one-line switch. The implementation is mostly plumbing: read config → pass to `spawnAgent` → Pi uses it.

## Feedback Strategy

**Inner-loop command**: `bun run typecheck && bun test`

**Playground**: Run pipeline with different model configs, verify the correct model is used per agent.

**Why this approach**: Config loading and model routing are pure logic. Tests are the fastest feedback.

## File Changes

### New Files

| File Path                            | Purpose                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `src/agent/config.ts`                | Load and validate model configuration from `~/.config/case/config.json` |
| `config.schema.json`                 | JSON Schema for the config file                                         |
| `src/__tests__/agent-config.spec.ts` | Tests for config loading, defaults, validation                          |

### Modified Files

| File Path                           | Changes                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `src/agent/pi-runner.ts`            | Read model config for the agent role, pass provider/model to `getModel()` |
| `src/agent/orchestrator-session.ts` | Read orchestrator model config                                            |
| `src/types.ts`                      | Add `AgentModelConfig` interface                                          |
| `src/entry/cli-orchestrator.ts`     | Pass `--model` override if provided via CLI                               |
| `src/index.ts`                      | Add `--model` flag for one-off model override                             |

## Implementation Details

### 1. Config File (`~/.config/case/config.json`)

**Overview**: User-editable JSON file specifying model per agent role.

```json
{
  "$schema": "https://raw.githubusercontent.com/workos/case/main/config.schema.json",
  "models": {
    "default": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "implementer": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "reviewer": {
      "provider": "google",
      "model": "gemini-2.5-pro"
    },
    "verifier": null,
    "closer": null,
    "retrospective": {
      "provider": "anthropic",
      "model": "claude-haiku-4-5-20251001"
    }
  }
}
```

- `default` is used when a role has no specific config or is `null`
- Each role can override provider + model independently
- Missing config file → all defaults (Claude Sonnet)

### 2. Config Loader (`src/agent/config.ts`)

```typescript
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { AgentModelConfig } from '../types.js';

const CONFIG_PATH = resolve(homedir(), '.config/case/config.json');

interface CaseConfig {
  models?: {
    default?: AgentModelConfig;
    implementer?: AgentModelConfig | null;
    reviewer?: AgentModelConfig | null;
    verifier?: AgentModelConfig | null;
    closer?: AgentModelConfig | null;
    retrospective?: AgentModelConfig | null;
  };
}

const DEFAULT_MODEL: AgentModelConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
};

export async function loadConfig(): Promise<CaseConfig> {
  try {
    const raw = await Bun.file(CONFIG_PATH).text();
    return JSON.parse(raw) as CaseConfig;
  } catch {
    return {};
  }
}

export async function getModelForAgent(agentName: string): Promise<AgentModelConfig> {
  const config = await loadConfig();
  const models = config.models ?? {};

  // Role-specific config (null means "use default")
  const roleConfig = models[agentName as keyof typeof models];
  if (roleConfig && roleConfig !== null) return roleConfig as AgentModelConfig;

  // Fall back to default
  return (models.default as AgentModelConfig) ?? DEFAULT_MODEL;
}
```

**Key decisions**:

- Config is loaded per `spawnAgent` call (not cached) — supports changing config between runs without restart
- `null` for a role explicitly means "use default" (vs missing key, which also means default)
- No validation beyond JSON parsing — invalid provider/model will surface as Pi errors with clear messages
- Config path follows XDG convention (`~/.config/case/`)

### 3. Wire into Pi Runner (`src/agent/pi-runner.ts`)

```typescript
import { getModelForAgent } from './config.js';
// Note: Phase 1 already uses ModelRegistry.find() (plain strings, no as-any casts)
// instead of getModel() from pi-ai (which requires string literal types).

export async function spawnAgent(options: SpawnAgentOptions): Promise<SpawnAgentResult> {
  // CLI --model flag overrides config file
  const modelConfig = options.model
    ? { provider: options.provider ?? 'anthropic', model: options.model }
    : await getModelForAgent(options.agentName);

  const model = registry.find(modelConfig.provider, modelConfig.model);
  if (!model) {
    throw new Error(`Model not found: ${modelConfig.provider}/${modelConfig.model}`);
  }
  // ... rest unchanged
}
```

### 4. CLI `--model` Flag (`src/index.ts`)

Add a one-off override for quick testing:

```bash
xcase --model claude-opus-4-5 1234          # use Opus for this run
xcase --model gemini-2.5-pro --agent 1234   # use Gemini in interactive mode
```

This overrides the config file for ALL agents in the run. For per-agent control, use the config file.

### 5. Types (`src/types.ts`)

```typescript
export interface AgentModelConfig {
  provider: string;
  model: string;
}
```

## Testing Requirements

### Unit Tests

| Test File                            | Coverage                                                             |
| ------------------------------------ | -------------------------------------------------------------------- |
| `src/__tests__/agent-config.spec.ts` | Config loading, missing file, role fallback, null role, CLI override |

**Key test cases**:

- Missing config file → all defaults
- Role has specific config → uses it
- Role is `null` → falls back to default
- `--model` CLI flag → overrides everything
- Invalid JSON in config file → falls back to defaults with warning

### Manual Testing

- [ ] Create `~/.config/case/config.json` with a different model for reviewer
- [ ] Run `xcase --dry-run 1234` — verify the reviewer phase would use the configured model (check log output)
- [ ] Run `xcase --model claude-opus-4-5 --dry-run 1234` — verify all agents use Opus
- [ ] Delete config file, run again — verify defaults work

## Error Handling

| Error Scenario                          | Handling Strategy                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Config file missing                     | Use all defaults, no error                                                     |
| Config file invalid JSON                | Log warning, use all defaults                                                  |
| Invalid provider name                   | Pi's `getModel` throws — surface error with "Check ~/.config/case/config.json" |
| Invalid model ID                        | Pi's `getModel` throws — surface error with model listing from Pi's registry   |
| API key missing for configured provider | Pi prompts for key (interactive) or fails with clear message (batch)           |

## Validation Commands

```bash
bun run typecheck
bun test

# Test with config
mkdir -p ~/.config/case
echo '{"models":{"default":{"provider":"anthropic","model":"claude-sonnet-4-20250514"}}}' > ~/.config/case/config.json
xcase --dry-run 1234

# Test with CLI override
xcase --model claude-opus-4-5 --dry-run 1234
```

## Open Items

- [ ] Should the orchestrator session (--agent) also respect the config file, or always use the default model?
- [ ] Should we validate provider API keys upfront (before pipeline starts) or let Pi handle it lazily?
- [ ] Pi's model registry may have different ID formats than what users expect — document the mapping
