# Implementation Spec: Pi Agent Migration — Phase 1

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Replace `agent-runner.ts` (which spawns `claude --print` subprocesses) with a Pi-based agent runner. Sub-agents run as Pi batch sessions using `pi-agent-core`'s `Agent` class with `streamSimple`. The pipeline loop (`pipeline.ts`) is unchanged — only the spawning mechanism changes.

Agent `.md` files are converted to Pi system prompts. Tool restrictions currently in frontmatter (`tools: ['Read', 'Edit', 'Bash', ...]`) map to Pi tool arrays using `pi-coding-agent`'s built-in `codingTools` and `readOnlyTools` sets. The `AGENT_RESULT` contract stays — agents still end their response with the structured output block, parsed the same way.

Pi is added as a dependency (`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`). `claude --print` code is removed entirely.

## Feedback Strategy

**Inner-loop command**: `bun run typecheck && bun test`

**Playground**: Test suite + `xcase --dry-run` against a target repo

**Why this approach**: The migration is mostly plumbing — swapping one spawning mechanism for another. Type checking catches interface mismatches, and dry-run validates the pipeline still flows.

## File Changes

### New Files

| File Path                         | Purpose                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `src/agent/pi-runner.ts`          | Pi-based agent runner — replaces `agent-runner.ts`                                      |
| `src/agent/tool-sets.ts`          | Map agent role → Pi tool arrays (implementer gets write tools, reviewer gets read-only) |
| `src/agent/prompt-loader.ts`      | Load agent `.md` files and extract system prompt (strip frontmatter)                    |
| `src/__tests__/pi-runner.spec.ts` | Tests for the new runner                                                                |

### Modified Files

| File Path         | Changes                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `package.json`    | Add `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent` deps |
| `src/pipeline.ts` | Import from `agent/pi-runner.ts` instead of `agent-runner.ts`                                  |
| `src/phases/*.ts` | Update `spawnAgent` import path                                                                |
| `src/types.ts`    | Update `SpawnAgentOptions` — remove `claude --print`-specific fields, add Pi model config      |
| `src/notify.ts`   | Wire heartbeat to Pi agent events instead of `setInterval`                                     |

### Deleted Files

| File Path                       | Reason                                                        |
| ------------------------------- | ------------------------------------------------------------- |
| `src/agent-runner.ts`           | Replaced by `src/agent/pi-runner.ts`                          |
| `src/util/parse-frontmatter.ts` | Replaced by `src/agent/prompt-loader.ts` (simpler, Pi-native) |

## Implementation Details

### 1. Pi Agent Runner (`src/agent/pi-runner.ts`)

**Pattern to follow**: Current `src/agent-runner.ts` (same interface, different engine)

**Overview**: The core replacement. Creates a Pi `Agent` with the appropriate system prompt, tools, and model, runs it to completion, and returns the parsed `AGENT_RESULT`.

```typescript
import { Agent } from '@mariozechner/pi-agent-core';
import { streamSimple, getModel } from '@mariozechner/pi-ai';
import { getToolsForAgent } from './tool-sets.js';
import { loadSystemPrompt } from './prompt-loader.js';
import { parseAgentResult } from '../util/parse-agent-result.js';
import type { SpawnAgentOptions, SpawnAgentResult } from '../types.js';

export async function spawnAgent(options: SpawnAgentOptions): Promise<SpawnAgentResult> {
  const systemPrompt = await loadSystemPrompt(options.caseRoot, options.agentName);
  const tools = getToolsForAgent(options.agentName, options.cwd);
  const model = getModel(options.provider ?? 'anthropic', options.model ?? 'claude-sonnet-4-20250514');

  const agent = new Agent({
    initialState: { systemPrompt, model, tools },
    streamFn: streamSimple,
  });

  // Collect full response text
  let responseText = '';
  agent.subscribe((event) => {
    if (event.type === 'message_update' && event.event.type === 'text_delta') {
      responseText += event.event.delta;
    }
    // Fire heartbeat on tool execution events
    if (event.type === 'tool_execution_start' && options.onHeartbeat) {
      options.onHeartbeat(Date.now() - start);
    }
  });

  const start = Date.now();
  await agent.prompt(options.prompt);
  const durationMs = Date.now() - start;

  const result = parseAgentResult(responseText);
  return { raw: responseText, result, durationMs };
}
```

**Key decisions**:

- Use `Agent` from `pi-agent-core` (not the full `pi-coding-agent` session) — we don't need session persistence for sub-agents
- Model defaults to Claude Sonnet but is overridable via `SpawnAgentOptions`
- The `AGENT_RESULT` parsing stays unchanged — Pi agents produce text output, we parse it the same way
- Heartbeat fires on `tool_execution_start` events instead of a `setInterval` timer — more meaningful than "still running"
- Tools are scoped to the target repo via `createBashTool(cwd)` / `createReadTool(cwd)`

**Implementation steps**:

1. Install Pi packages: `bun add @mariozechner/pi-ai @mariozechner/pi-agent-core @mariozechner/pi-coding-agent`
2. Create `src/agent/pi-runner.ts` with the `spawnAgent` function
3. Subscribe to agent events for response collection and heartbeat
4. Call `parseAgentResult` on the collected text (same parser as today)
5. Handle errors — if the agent throws, return a failed `SpawnAgentResult`
6. Handle timeout — use `AbortController` with `setTimeout`, pass signal to agent

**Feedback loop**:

- **Playground**: `bun test -- --filter pi-runner`
- **Check command**: `bun run typecheck && bun test`

### 2. Tool Sets (`src/agent/tool-sets.ts`)

**Pattern to follow**: Pi's `codingTools` and `readOnlyTools` arrays from `@mariozechner/pi-coding-agent`

**Overview**: Maps agent roles to Pi tool arrays. Implementer gets full write access, reviewer/verifier get read-only + bash.

```typescript
import { createReadTool, createWriteTool, createEditTool, createBashTool } from '@mariozechner/pi-coding-agent';
import type { AgentTool } from '@mariozechner/pi-agent-core';

export function getToolsForAgent(agentName: string, cwd: string): AgentTool[] {
  const read = createReadTool(cwd);
  const write = createWriteTool(cwd);
  const edit = createEditTool(cwd);
  const bash = createBashTool(cwd);

  switch (agentName) {
    case 'implementer':
      return [read, write, edit, bash];
    case 'verifier':
    case 'reviewer':
    case 'closer':
      return [read, bash]; // read-only + bash for scripts
    case 'retrospective':
      return [read, write, edit, bash]; // can edit harness docs
    default:
      return [read, bash];
  }
}
```

**Key decisions**:

- Use `createBashTool(cwd)` to scope bash execution to the target repo directory
- Reviewer/verifier/closer get `bash` because they run scripts (mark-tested.sh, gh pr create, etc.)
- No `grep`/`find` tools initially — agents use `bash` for that (Pi's default approach)

### 3. Prompt Loader (`src/agent/prompt-loader.ts`)

**Overview**: Load agent `.md` files, strip YAML frontmatter, return the markdown body as the system prompt.

```typescript
export async function loadSystemPrompt(caseRoot: string, agentName: string): Promise<string> {
  const mdPath = resolve(caseRoot, `agents/${agentName}.md`);
  const raw = await Bun.file(mdPath).text();

  // Strip YAML frontmatter (between --- delimiters)
  const stripped = raw.replace(/^---[\s\S]*?---\n*/, '');
  return stripped.trim();
}
```

**Key decisions**:

- Frontmatter is stripped entirely — Pi doesn't use it. Tool configuration now lives in `tool-sets.ts`, model configuration in the runner.
- The markdown body IS the system prompt — same content, just delivered differently.

### 4. Update Types (`src/types.ts`)

**Overview**: Modify `SpawnAgentOptions` to support Pi model configuration.

```typescript
export interface SpawnAgentOptions {
  prompt: string;
  cwd: string;
  agentName: AgentName | 'retrospective';
  caseRoot: string;
  timeout?: number;
  /** Model provider (default: "anthropic") */
  provider?: string;
  /** Model ID (default: "claude-sonnet-4-20250514") */
  model?: string;
  onHeartbeat?: (elapsedMs: number) => void;
}
```

Remove `background` field (no longer applicable — Pi sessions are always in-process).

### 5. Update Pipeline Imports

**Overview**: Mechanical change — update imports in `pipeline.ts` and all phase files to use `src/agent/pi-runner.ts`.

## Testing Requirements

### Unit Tests

| Test File                         | Coverage                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `src/__tests__/pi-runner.spec.ts` | Agent creation, response collection, AGENT_RESULT parsing, timeout, error handling |

**Key test cases**:

- Agent completes with valid AGENT_RESULT → parsed correctly
- Agent produces no AGENT_RESULT delimiters → treated as failure
- Agent exceeds timeout → AbortController fires, returns error
- Heartbeat callback fires on tool execution events
- Tools are correctly scoped to cwd

### Manual Testing

- [ ] `xcase --dry-run 1234` from a target repo — pipeline flows end-to-end
- [ ] Run with a real issue (non-dry-run) — implementer produces a commit
- [ ] Verify evidence markers still work (`.case-tested`, `.case-manual-tested`)
- [ ] Verify task JSON status transitions still work

## Error Handling

| Error Scenario                     | Handling Strategy                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Pi package not installed           | Fail fast with "Run: bun add @mariozechner/pi-ai @mariozechner/pi-agent-core"    |
| No API key for configured provider | Fail with "Set {PROVIDER}\_API_KEY in environment or ~/.config/case/credentials" |
| Agent timeout                      | AbortController signal, return failed SpawnAgentResult                           |
| Model not found                    | Pi's `getModel` throws — catch and wrap with helpful message                     |
| Tool execution error               | Pi handles internally, surfaces in agent response                                |

## Validation Commands

```bash
bun run typecheck
bun test
xcase --dry-run 1234  # from a target repo
```

## Open Items

- [ ] Verify Pi's `createBashTool` supports the timeout parameter we need (10 min default)
- [ ] Determine if Pi's `Agent` supports `AbortController` for hard timeout (research confirms yes)
- [ ] Test Pi's token counting — do we still need our own metrics collector, or can we use `getSessionStats()`?
