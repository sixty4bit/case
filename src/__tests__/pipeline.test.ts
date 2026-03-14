import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { AgentResult, PipelineConfig, TaskJson } from '../types.js';

// Create mock functions for all dependencies
const mockRunImplementPhase = mock();
const mockRunVerifyPhase = mock();
const mockRunReviewPhase = mock();
const mockRunClosePhase = mock();
const mockRunRetrospectivePhase = mock();
const mockRunScript = mock();
const mockWriteRunMetrics = mock();
const mockGetCurrentPromptVersions = mock();
const mockFindPriorRunId = mock();

// Mock store instance
const mockStoreRead = mock();
const mockStoreSetStatus = mock();
const mockStoreSetAgentPhase = mock();
const mockStoreSetField = mock();
const MockTaskStore = mock(() => ({
  read: mockStoreRead,
  readStatus: mock(),
  setStatus: mockStoreSetStatus,
  setAgentPhase: mockStoreSetAgentPhase,
  setField: mockStoreSetField,
}));

// Mock notifier
const mockNotifierSend = mock();
const mockNotifierAskUser = mock();
const mockCreateNotifier = mock(() => ({
  send: mockNotifierSend,
  askUser: mockNotifierAskUser,
}));

// Wire up module mocks
mock.module('../phases/implement.js', () => ({ runImplementPhase: mockRunImplementPhase }));
mock.module('../phases/verify.js', () => ({ runVerifyPhase: mockRunVerifyPhase }));
mock.module('../phases/review.js', () => ({ runReviewPhase: mockRunReviewPhase }));
mock.module('../phases/close.js', () => ({ runClosePhase: mockRunClosePhase }));
mock.module('../phases/retrospective.js', () => ({ runRetrospectivePhase: mockRunRetrospectivePhase }));
mock.module('../state/task-store.js', () => ({ TaskStore: MockTaskStore }));
mock.module('../notify.js', () => ({ createNotifier: mockCreateNotifier }));
mock.module('../util/run-script.js', () => ({ runScript: mockRunScript }));
mock.module('../metrics/writer.js', () => ({ writeRunMetrics: mockWriteRunMetrics }));
mock.module('../versioning/prompt-tracker.js', () => ({
  getCurrentPromptVersions: mockGetCurrentPromptVersions,
  findPriorRunId: mockFindPriorRunId,
}));

const { runPipeline } = await import('../pipeline.js');

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
  summary: 'Done',
  artifacts: {
    commit: 'abc',
    filesChanged: [],
    testsPassed: true,
    screenshotUrls: [],
    evidenceMarkers: [],
    prUrl: null,
    prNumber: null,
  },
  error: null,
};

const prResult: AgentResult = {
  ...completedResult,
  summary: 'PR created',
  artifacts: { ...completedResult.artifacts, prUrl: 'https://github.com/workos/cli/pull/42', prNumber: 42 },
};

const failedResult: AgentResult = {
  status: 'failed',
  summary: 'Failed',
  artifacts: {
    commit: null,
    filesChanged: [],
    testsPassed: false,
    screenshotUrls: [],
    evidenceMarkers: [],
    prUrl: null,
    prNumber: null,
  },
  error: 'Something went wrong',
};

const mockTask: TaskJson = {
  id: 'cli-1',
  status: 'active',
  created: '2026-03-14T00:00:00Z',
  repo: 'cli',
  agents: {},
  tested: false,
  manualTested: false,
  prUrl: null,
  prNumber: null,
};

describe('runPipeline', () => {
  beforeEach(() => {
    mockRunImplementPhase.mockReset();
    mockRunVerifyPhase.mockReset();
    mockRunReviewPhase.mockReset();
    mockRunClosePhase.mockReset();
    mockRunRetrospectivePhase.mockReset();
    mockRunScript.mockReset();
    mockWriteRunMetrics.mockReset();
    mockGetCurrentPromptVersions.mockReset();
    mockFindPriorRunId.mockReset();
    mockStoreRead.mockReset();
    mockStoreSetStatus.mockReset();
    mockStoreSetAgentPhase.mockReset();
    mockStoreSetField.mockReset();
    mockNotifierSend.mockReset();
    mockNotifierAskUser.mockReset();

    // Default mocks
    mockStoreRead.mockResolvedValue(mockTask);
    mockRunScript.mockResolvedValue({ stdout: 'OK', stderr: '', exitCode: 0 });
    mockWriteRunMetrics.mockResolvedValue(undefined);
    mockGetCurrentPromptVersions.mockResolvedValue({});
    mockFindPriorRunId.mockResolvedValue(null);
    mockRunRetrospectivePhase.mockResolvedValue(undefined);
  });

  it('happy path: implement -> verify -> review -> close -> retrospective -> complete', async () => {
    mockRunImplementPhase.mockResolvedValue({ result: completedResult, nextPhase: 'verify' });
    mockRunVerifyPhase.mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    mockRunReviewPhase.mockResolvedValue({ result: completedResult, nextPhase: 'close' });
    mockRunClosePhase.mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig());

    expect(mockRunImplementPhase).toHaveBeenCalledTimes(1);
    expect(mockRunVerifyPhase).toHaveBeenCalledTimes(1);
    expect(mockRunReviewPhase).toHaveBeenCalledTimes(1);
    expect(mockRunClosePhase).toHaveBeenCalledTimes(1);
    expect(mockRunRetrospectivePhase).toHaveBeenCalledTimes(1);
    expect(mockRunRetrospectivePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'completed',
      undefined,
    );
    expect(mockNotifierSend).toHaveBeenCalledWith(expect.stringContaining('PR created'));
    expect(mockNotifierSend).toHaveBeenCalledWith('Pipeline completed successfully.');
  });

  it('implement failure, attended mode, user chooses Abort', async () => {
    mockRunImplementPhase.mockResolvedValue({ result: failedResult, nextPhase: 'abort' });
    mockNotifierAskUser.mockResolvedValue('Abort');

    await runPipeline(makeConfig());

    expect(mockRunRetrospectivePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'failed',
      'implementer',
    );
    expect(mockNotifierSend).toHaveBeenCalledWith(expect.stringContaining('failed'));
  });

  it('implement failure, unattended mode -> auto-abort', async () => {
    mockRunImplementPhase.mockResolvedValue({ result: failedResult, nextPhase: 'abort' });
    mockNotifierAskUser.mockResolvedValue('Abort');

    await runPipeline(makeConfig({ mode: 'unattended' }));

    expect(mockRunRetrospectivePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'failed',
      'implementer',
    );
  });

  it('review critical findings, attended, user overrides -> close', async () => {
    mockRunImplementPhase.mockResolvedValue({ result: completedResult, nextPhase: 'verify' });
    mockRunVerifyPhase.mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    mockRunReviewPhase.mockResolvedValue({ result: failedResult, nextPhase: 'abort' });
    mockRunClosePhase.mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });
    mockNotifierAskUser.mockResolvedValue('Override and continue');

    await runPipeline(makeConfig());

    expect(mockRunClosePhase).toHaveBeenCalledTimes(1);
    expect(mockRunRetrospectivePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'completed',
      undefined,
    );
  });

  it('re-entry from verifying status -> starts at verify phase', async () => {
    const verifyingTask = {
      ...mockTask,
      status: 'verifying' as const,
      agents: { verifier: { started: null, completed: null, status: 'running' as const } },
    };
    mockStoreRead.mockResolvedValue(verifyingTask);

    mockRunVerifyPhase.mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    mockRunReviewPhase.mockResolvedValue({ result: completedResult, nextPhase: 'close' });
    mockRunClosePhase.mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig());

    expect(mockRunImplementPhase).not.toHaveBeenCalled();
    expect(mockRunVerifyPhase).toHaveBeenCalledTimes(1);
  });

  it('dry-run mode -> all phases pass with dry-run results', async () => {
    const dryResult = {
      result: { ...completedResult, summary: '[dry-run] skipped' },
      nextPhase: 'verify' as const,
    };
    mockRunImplementPhase.mockResolvedValue({ ...dryResult, nextPhase: 'verify' });
    mockRunVerifyPhase.mockResolvedValue({ ...dryResult, nextPhase: 'review' });
    mockRunReviewPhase.mockResolvedValue({ ...dryResult, nextPhase: 'close' });
    mockRunClosePhase.mockResolvedValue({ ...dryResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig({ dryRun: true }));

    expect(mockRunImplementPhase).toHaveBeenCalledTimes(1);
    expect(mockRunRetrospectivePhase).toHaveBeenCalledTimes(1);
  });

  it('log-run.sh is called at the end with outcome', async () => {
    mockRunImplementPhase.mockResolvedValue({ result: completedResult, nextPhase: 'verify' });
    mockRunVerifyPhase.mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    mockRunReviewPhase.mockResolvedValue({ result: completedResult, nextPhase: 'close' });
    mockRunClosePhase.mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig());

    expect(mockRunScript).toHaveBeenCalledWith('bash', [
      '/case/scripts/log-run.sh',
      '/case/tasks/active/cli-1.task.json',
      'completed',
    ]);
  });
});
