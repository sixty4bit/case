# Implementation Spec: Pi Agent Migration — Phase 2

**Contract**: ./contract.md
**Estimated Effort**: XL

## Technical Approach

Add the `--agent` flag to `xcase` that starts an interactive Pi session. The orchestrator becomes a conversational agent — the user can discuss, plan, ask questions, or trigger pipeline execution. This is the flagship feature of the migration.

The orchestrator session uses `pi-coding-agent`'s `createAgentSession` for full session management (persistence, compaction, TUI). The pipeline itself becomes a tool the orchestrator agent can invoke, not the only thing it does. When the user says "run the pipeline on issue 1234," the orchestrator calls the pipeline tool. When the user says "let's discuss how to approach this," it's just a conversation.

Sub-agents are spawned by the orchestrator as Pi batch sessions (using Phase 1's `spawnAgent`). The user sees real-time streaming of tool calls and decisions. Pi's `steer()` and `followUp()` mechanisms allow interjection.

## Feedback Strategy

**Inner-loop command**: `bun run typecheck && bun test`

**Playground**: Interactive testing — run `xcase --agent` and verify the conversation loop, pipeline triggering, and steering work.

**Why this approach**: This phase is heavily interactive. Automated tests cover the tool definitions and session setup, but the real validation is using `--agent` and confirming the experience works.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `src/agent/orchestrator-session.ts` | Interactive Pi session for the orchestrator — system prompt, tools, session management |
| `src/agent/tools/pipeline-tool.ts` | Pi tool that runs the case pipeline (the orchestrator invokes this) |
| `src/agent/tools/issue-tool.ts` | Pi tool for fetching issues (GitHub, Linear) |
| `src/agent/tools/task-tool.ts` | Pi tool for creating/resuming tasks |
| `src/agent/tools/baseline-tool.ts` | Pi tool for running bootstrap.sh |
| `src/__tests__/orchestrator-session.spec.ts` | Tests for session setup, tool registration |

### Modified Files

| File Path | Changes |
|---|---|
| `src/index.ts` | Add `--agent` flag, route to `startOrchestratorSession()` |
| `src/entry/cli-orchestrator.ts` | Extract pipeline dispatch logic into reusable function that the Pi tool calls |

## Implementation Details

### 1. Orchestrator Session (`src/agent/orchestrator-session.ts`)

**Overview**: The main entry point for `--agent` mode. Creates an interactive Pi session with the case orchestrator's system prompt and tools.

```typescript
import {
  createAgentSession, InteractiveMode, SessionManager, AuthStorage, ModelRegistry,
  DefaultResourceLoader, SettingsManager, getAgentDir,
} from "@mariozechner/pi-coding-agent";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { createPipelineTool } from "./tools/pipeline-tool.js";
import { createIssueTool } from "./tools/issue-tool.js";
import { createTaskTool } from "./tools/task-tool.js";
import { createBaselineTool } from "./tools/baseline-tool.js";

export async function startOrchestratorSession(options: {
  caseRoot: string;
  argument?: string;
  mode: "attended";
}): Promise<void> {
  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);
  const agentDir = getAgentDir();
  const cwd = process.cwd();

  // System prompt customization goes through the ResourceLoader
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: SettingsManager.create(cwd, agentDir),
    appendSystemPrompt: buildOrchestratorSystemPrompt(options.caseRoot),
  });
  await resourceLoader.reload();

  const { session, extensionsResult } = await createAgentSession({
    cwd,
    agentDir,
    sessionManager: SessionManager.create(cwd),
    authStorage,
    modelRegistry,
    resourceLoader,
    customTools: [
      createPipelineTool(options.caseRoot),
      createIssueTool(options.caseRoot),
      createTaskTool(options.caseRoot),
      createBaselineTool(options.caseRoot),
    ] as ToolDefinition[],
  });

  // If an argument was provided, prompt with it as the opening message
  if (options.argument) {
    await session.prompt(`Work on issue: ${options.argument}`);
  }

  // Start Pi's interactive TUI — blocks until session ends
  const interactive = new InteractiveMode({ session, extensionsResult });
  await interactive.run();
}
```

**Key decisions**:
- Use `createAgentSession` (Layer 3) for full session persistence and built-in coding tools
- Use `InteractiveMode` for Pi's TUI — it handles the conversation loop, input, rendering, and keybindings
- System prompt is customized via `DefaultResourceLoader({ appendSystemPrompt })` — there is no `systemPromptAppend` option on `createAgentSession` directly
- Custom tools are case-specific: pipeline, issue fetching, task management, baseline. They use the `ToolDefinition` type (not `AgentTool`) — `ToolDefinition.execute` has an extra `ctx: ExtensionContext` parameter
- The orchestrator also gets Pi's default coding tools (read, write, edit, bash) for ad-hoc exploration
- If an argument is provided, it becomes the opening prompt — the agent starts working immediately
- If no argument, the session opens for freeform conversation

**Implementation steps**:
1. Create the session factory function
2. Set up `DefaultResourceLoader` with `appendSystemPrompt` for case-specific context (AGENTS.md + golden principles, trimmed for token efficiency)
3. Register custom tools as `ToolDefinition[]`
4. Handle the argument → opening prompt mapping
5. Create `InteractiveMode` and call `run()` to hand off to Pi's TUI

### 2. Pipeline Tool (`src/agent/tools/pipeline-tool.ts`)

**Overview**: A Pi tool the orchestrator calls to run the case pipeline. This is where the existing `runPipeline()` function connects to the interactive session.

```typescript
import { Type } from "@sinclair/typebox";
import type { ToolDefinition, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import { runPipeline } from "../../pipeline.js";
import { buildPipelineConfig } from "../../config.js";

const pipelineParams = Type.Object({
  taskJsonPath: Type.String({ description: "Path to the .task.json file" }),
  mode: Type.Optional(Type.String({ description: "attended or unattended" })),
  dryRun: Type.Optional(Type.Boolean({ description: "Skip agent spawning" })),
});

export function createPipelineTool(caseRoot: string): ToolDefinition<typeof pipelineParams> {
  return {
    name: "run_pipeline",
    label: "Pipeline",
    description: "Run the case agent pipeline (implement → verify → review → close → retrospective) for a task",
    promptSnippet: "Run the case pipeline for a task file",
    parameters: pipelineParams,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const config = await buildPipelineConfig({
        taskJsonPath: params.taskJsonPath,
        mode: (params.mode as "attended" | "unattended") ?? "attended",
        dryRun: params.dryRun ?? false,
      });

      // Stream progress updates to the orchestrator via AgentToolResult shape
      config.onAgentHeartbeat = (elapsedMs) => {
        onUpdate?.({
          content: [{ type: "text", text: `... still running (${Math.floor(elapsedMs / 1000)}s)\n` }],
          details: { taskJsonPath: params.taskJsonPath },
        });
      };

      await runPipeline(config);

      return {
        content: [{ type: "text", text: "Pipeline completed successfully." }],
        details: { taskJsonPath: params.taskJsonPath },
      };
    },
  };
}
```

**Key decisions**:
- Tools use `ToolDefinition` (from `pi-coding-agent`), not `AgentTool` (from `pi-agent-core`). `ToolDefinition.execute` has an extra `ctx: ExtensionContext` parameter and supports `promptSnippet`/`promptGuidelines` for system prompt integration
- The pipeline runs in-process (not a subprocess) — the orchestrator's Pi session calls `runPipeline()` directly
- Sub-agents within the pipeline are still spawned as separate Pi batch sessions (Phase 1's `spawnAgent`)
- `onUpdate` streams progress via `AgentToolResult` shape: `{ content: [...], details: ... }` — not a bare content block
- The `signal` (AbortController) could be used to cancel the pipeline if the user steers away

### 3. Issue Tool (`src/agent/tools/issue-tool.ts`)

**Overview**: Lets the orchestrator fetch issue context from GitHub or Linear.

```typescript
import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

const issueParams = Type.Object({
  source: Type.Union([Type.Literal("github"), Type.Literal("linear"), Type.Literal("freeform")]),
  identifier: Type.String({ description: "Issue number, Linear ID, or freeform text" }),
  repoRemote: Type.Optional(Type.String({ description: "Git remote URL for GitHub issues" })),
});

export function createIssueTool(caseRoot: string): ToolDefinition<typeof issueParams> {
  return {
    name: "fetch_issue",
    label: "Issue",
    description: "Fetch issue details from GitHub, Linear, or create from freeform text",
    promptSnippet: "Fetch issue details from GitHub or Linear",
    parameters: issueParams,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const context = await fetchIssue(params.source, params.identifier, params.repoRemote);
      return {
        content: [{ type: "text", text: `**${context.title}**\n\n${context.body}` }],
        details: context,
      };
    },
  };
}
```

### 4. Task and Baseline Tools

Similar pattern — wrap existing `createTask()` and `bootstrap.sh` execution as Pi tools. The orchestrator decides when to call them based on the conversation.

### 5. CLI Routing (`src/index.ts`)

**Overview**: Add `--agent` flag. When set, route to `startOrchestratorSession()` instead of `runCliOrchestrator()`.

```typescript
// In parseArgs options:
agent: { type: 'boolean' },

// In routing:
if (values.agent) {
  await startOrchestratorSession({
    caseRoot,
    argument: argument || undefined,
    mode: 'attended',
  });
} else {
  await runCliOrchestrator({ ... });
}
```

**Key decisions**:
- `--agent` is always attended mode (interactive by definition)
- `--agent` without an argument opens a freeform session
- `--agent 1234` opens a session and immediately prompts with the issue
- `--agent` is mutually exclusive with `--task` (use `--task` for legacy batch)

### 6. Orchestrator System Prompt

**Overview**: The system prompt that makes the Pi session act as the case orchestrator. Loaded from a new file or built programmatically.

The prompt should:
- Explain the case harness and pipeline
- Describe available tools (pipeline, issue, task, baseline)
- Explain when to run the pipeline vs have a discussion
- Include golden principles and project context
- Be concise — Pi's philosophy is minimal system prompts (~200 tokens base, we add case context on top)

**Key decisions**:
- Keep it under 1000 tokens (Pi's base is ~200, we add ~800 of case context)
- Reference external docs by tool (the agent can `read` files) rather than inlining everything
- The prompt should make it natural to both discuss AND execute

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `src/__tests__/orchestrator-session.spec.ts` | Session creation, tool registration, argument handling |
| `src/__tests__/pipeline-tool.spec.ts` | Pipeline tool execution, progress streaming, error handling |

**Key test cases**:
- Session creates with all custom tools registered
- Pipeline tool calls `runPipeline` with correct config
- Issue tool returns normalized `IssueContext`
- `--agent` flag routes to session, not batch orchestrator

### Manual Testing

- [ ] `xcase --agent` — opens interactive session, can have a conversation
- [ ] `xcase --agent 1234` — opens session and immediately starts working on issue
- [ ] Interjection: while agent is working, type a message — it receives it via steer/followUp
- [ ] Pipeline completion: agent runs full pipeline, reports result in conversation
- [ ] Planning mode: discuss an approach before triggering pipeline execution

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| Pi not installed | `startOrchestratorSession` checks for package, prints install instructions |
| No API key | Pi's `AuthStorage` prompts interactively (built-in behavior) |
| Pipeline fails during session | Error surfaces in the conversation — agent can explain and suggest next steps |
| User interrupt (Ctrl+C) | Pi handles gracefully — session is saved, can be resumed |
| Session persistence fails | Fall back to in-memory session with warning |

## Validation Commands

```bash
bun run typecheck
bun test
xcase --agent           # freeform session
xcase --agent 1234      # issue-directed session
xcase 1234              # verify batch mode still works
```

## Open Items

- [ ] How much of Pi's TUI do we use vs customize? Pi's default TUI may be sufficient initially.
- [ ] Should the orchestrator session persist between `xcase --agent` invocations? Pi's `SessionManager.continueRecent()` enables this.
- [ ] How does `steer()` interact with a running pipeline? The pipeline runs synchronously — steering may need to be queued as a `followUp()` until the current phase completes.
