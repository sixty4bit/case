import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentName, AgentResult, PipelineConfig } from '../types.js';

// Mock dependencies before importing the module under test
vi.mock('../agent-runner.js');
vi.mock('../context/assembler.js');
vi.mock('../context/prefetch.js');
vi.mock('../util/run-script.js');

const { runImplementPhase } = await import('../phases/implement.js');
const { spawnAgent } = await import('../agent-runner.js');
const { assemblePrompt } = await import('../context/assembler.js');
const { prefetchRepoContext } = await import('../context/prefetch.js');
const { runScript } = await import('../util/run-script.js');

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    mode: 'attended',
    taskJsonPath: '/case/tasks/active/cli-1.task.json',
    taskMdPath: '/case/tasks/active/cli-1.md',
    repoPath: '/repos/cli',
    repoName: 'cli',
    caseRoot: '/case',
    maxRetries: 1,
    dryRun: false,
    ...overrides,
  };
}

const completedResult: AgentResult = {
  status: 'completed',
  summary: 'Fixed the bug',
  artifacts: {
    commit: 'abc123',
    filesChanged: ['src/x.ts'],
    testsPassed: true,
    screenshotUrls: [],
    evidenceMarkers: ['.case-tested'],
    prUrl: null,
    prNumber: null,
  },
  error: null,
};

const failedResult: AgentResult = {
  status: 'failed',
  summary: '',
  artifacts: {
    commit: null,
    filesChanged: [],
    testsPassed: false,
    screenshotUrls: [],
    evidenceMarkers: [],
    prUrl: null,
    prNumber: null,
  },
  error: 'Tests failed: 3 failing',
};

// Mock TaskStore
function makeMockStore() {
  return {
    read: vi.fn().mockResolvedValue({
      id: 'cli-1',
      status: 'active',
      created: '2026-03-14T00:00:00Z',
      repo: 'cli',
      agents: {},
      tested: false,
      manualTested: false,
      prUrl: null,
      prNumber: null,
    }),
    readStatus: vi.fn().mockResolvedValue('active'),
    setStatus: vi.fn().mockResolvedValue(undefined),
    setAgentPhase: vi.fn().mockResolvedValue(undefined),
    setField: vi.fn().mockResolvedValue(undefined),
  };
}

describe('runImplementPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assemblePrompt).mockResolvedValue('assembled prompt');
    vi.mocked(prefetchRepoContext).mockResolvedValue({
      sessionJson: {},
      learnings: '',
      recentCommits: '',
      goldenPrinciples: '',
      workingMemory: null,
    });
  });

  it('success path -> nextPhase is verify', async () => {
    vi.mocked(spawnAgent).mockResolvedValue({
      raw: '',
      result: completedResult,
      durationMs: 1000,
    });

    const store = makeMockStore();
    const results = new Map<AgentName, AgentResult>();
    const output = await runImplementPhase(makeConfig(), store as any, results);

    expect(output.nextPhase).toBe('verify');
    expect(output.result.status).toBe('completed');
    expect(store.setStatus).toHaveBeenCalledWith('implementing');
    expect(store.setAgentPhase).toHaveBeenCalledWith('implementer', 'status', 'completed');
    expect(results.get('implementer')).toBe(completedResult);
  });

  it('failure with retryViable=true -> retries once', async () => {
    // First call fails, retry succeeds
    vi.mocked(spawnAgent)
      .mockResolvedValueOnce({ raw: '', result: failedResult, durationMs: 1000 })
      .mockResolvedValueOnce({ raw: '', result: completedResult, durationMs: 1000 });

    vi.mocked(runScript).mockResolvedValue({
      stdout: JSON.stringify({
        failureClass: 'test-failure',
        failedAgent: 'implementer',
        errorSummary: 'Tests failed',
        filesInvolved: ['src/x.ts'],
        whatWasTried: ['first approach'],
        suggestedFocus: 'Check test expectations',
        retryViable: true,
      }),
      stderr: '',
      exitCode: 0,
    });

    const store = makeMockStore();
    const results = new Map<AgentName, AgentResult>();
    const output = await runImplementPhase(makeConfig(), store as any, results);

    expect(output.nextPhase).toBe('verify');
    expect(spawnAgent).toHaveBeenCalledTimes(2);
    // Retry prompt should contain failure context
    const retryCall = vi.mocked(spawnAgent).mock.calls[1];
    expect(retryCall[0].prompt).toContain('RETRY CONTEXT');
    expect(retryCall[0].prompt).toContain('test-failure');
  });

  it('failure with retryViable=false -> abort', async () => {
    vi.mocked(spawnAgent).mockResolvedValue({
      raw: '',
      result: failedResult,
      durationMs: 1000,
    });

    vi.mocked(runScript).mockResolvedValue({
      stdout: JSON.stringify({
        failureClass: 'unknown',
        failedAgent: 'implementer',
        errorSummary: 'Too many attempts',
        filesInvolved: [],
        whatWasTried: ['a', 'b', 'c'],
        suggestedFocus: 'Surface to human',
        retryViable: false,
      }),
      stderr: '',
      exitCode: 0,
    });

    const store = makeMockStore();
    const results = new Map<AgentName, AgentResult>();
    const output = await runImplementPhase(makeConfig(), store as any, results);

    expect(output.nextPhase).toBe('abort');
    expect(spawnAgent).toHaveBeenCalledTimes(1); // No retry
  });

  it('retry fails -> abort', async () => {
    // Both attempts fail
    vi.mocked(spawnAgent)
      .mockResolvedValueOnce({ raw: '', result: failedResult, durationMs: 1000 })
      .mockResolvedValueOnce({ raw: '', result: failedResult, durationMs: 1000 });

    vi.mocked(runScript).mockResolvedValue({
      stdout: JSON.stringify({
        failureClass: 'test-failure',
        failedAgent: 'implementer',
        errorSummary: 'Tests failed',
        filesInvolved: [],
        whatWasTried: [],
        suggestedFocus: 'Try different approach',
        retryViable: true,
      }),
      stderr: '',
      exitCode: 0,
    });

    const store = makeMockStore();
    const results = new Map<AgentName, AgentResult>();
    const output = await runImplementPhase(makeConfig(), store as any, results);

    expect(output.nextPhase).toBe('abort');
    expect(spawnAgent).toHaveBeenCalledTimes(2);
  });

  it('dry-run mode -> no agents spawned', async () => {
    const store = makeMockStore();
    const results = new Map<AgentName, AgentResult>();
    const output = await runImplementPhase(makeConfig({ dryRun: true }), store as any, results);

    expect(output.nextPhase).toBe('verify');
    expect(output.result.summary).toContain('dry-run');
    expect(spawnAgent).not.toHaveBeenCalled();
  });

  it('task state updated correctly at each step', async () => {
    vi.mocked(spawnAgent).mockResolvedValue({
      raw: '',
      result: completedResult,
      durationMs: 1000,
    });

    const store = makeMockStore();
    await runImplementPhase(makeConfig(), store as any, new Map());

    // Should set implementing status first
    expect(store.setStatus).toHaveBeenCalledWith('implementing');
    // Should set agent phases
    expect(store.setAgentPhase).toHaveBeenCalledWith('implementer', 'status', 'running');
    expect(store.setAgentPhase).toHaveBeenCalledWith('implementer', 'started', 'now');
    expect(store.setAgentPhase).toHaveBeenCalledWith('implementer', 'status', 'completed');
    expect(store.setAgentPhase).toHaveBeenCalledWith('implementer', 'completed', 'now');
  });
});
