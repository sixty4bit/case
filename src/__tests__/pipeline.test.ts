import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentResult, PipelineConfig, TaskJson } from '../types.js';

// Mock all phase modules and dependencies
vi.mock('../phases/implement.js');
vi.mock('../phases/verify.js');
vi.mock('../phases/review.js');
vi.mock('../phases/close.js');
vi.mock('../phases/retrospective.js');
vi.mock('../state/task-store.js');
vi.mock('../notify.js');
vi.mock('../util/run-script.js');
vi.mock('../metrics/writer.js');
vi.mock('../versioning/prompt-tracker.js');

const { runPipeline } = await import('../pipeline.js');
const { runImplementPhase } = await import('../phases/implement.js');
const { runVerifyPhase } = await import('../phases/verify.js');
const { runReviewPhase } = await import('../phases/review.js');
const { runClosePhase } = await import('../phases/close.js');
const { runRetrospectivePhase } = await import('../phases/retrospective.js');
const { TaskStore } = await import('../state/task-store.js');
const { createNotifier } = await import('../notify.js');
const { runScript } = await import('../util/run-script.js');
const { writeRunMetrics } = await import('../metrics/writer.js');
const { getCurrentPromptVersions, findPriorRunId } = await import('../versioning/prompt-tracker.js');

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
  let mockNotifier: { send: ReturnType<typeof vi.fn>; askUser: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock TaskStore
    const mockStore = {
      read: vi.fn().mockResolvedValue(mockTask),
      readStatus: vi.fn().mockResolvedValue('active'),
      setStatus: vi.fn().mockResolvedValue(undefined),
      setAgentPhase: vi.fn().mockResolvedValue(undefined),
      setField: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(TaskStore).mockImplementation(() => mockStore as any);

    // Mock notifier
    mockNotifier = { send: vi.fn(), askUser: vi.fn() };
    vi.mocked(createNotifier).mockReturnValue(mockNotifier);

    // Mock log-run.sh
    vi.mocked(runScript).mockResolvedValue({ stdout: 'OK', stderr: '', exitCode: 0 });

    // Mock metrics and versioning
    vi.mocked(writeRunMetrics).mockResolvedValue(undefined);
    vi.mocked(getCurrentPromptVersions).mockResolvedValue({});
    vi.mocked(findPriorRunId).mockResolvedValue(null);

    // Default: retrospective does nothing
    vi.mocked(runRetrospectivePhase).mockResolvedValue(undefined);
  });

  it('happy path: implement -> verify -> review -> close -> retrospective -> complete', async () => {
    vi.mocked(runImplementPhase).mockResolvedValue({ result: completedResult, nextPhase: 'verify' });
    vi.mocked(runVerifyPhase).mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    vi.mocked(runReviewPhase).mockResolvedValue({ result: completedResult, nextPhase: 'close' });
    vi.mocked(runClosePhase).mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig());

    expect(runImplementPhase).toHaveBeenCalledTimes(1);
    expect(runVerifyPhase).toHaveBeenCalledTimes(1);
    expect(runReviewPhase).toHaveBeenCalledTimes(1);
    expect(runClosePhase).toHaveBeenCalledTimes(1);
    expect(runRetrospectivePhase).toHaveBeenCalledTimes(1);
    expect(runRetrospectivePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'completed',
      undefined,
    );
    expect(mockNotifier.send).toHaveBeenCalledWith(expect.stringContaining('PR created'));
    expect(mockNotifier.send).toHaveBeenCalledWith('Pipeline completed successfully.');
  });

  it('implement failure, attended mode, user chooses Abort', async () => {
    vi.mocked(runImplementPhase).mockResolvedValue({ result: failedResult, nextPhase: 'abort' });
    mockNotifier.askUser.mockResolvedValue('Abort');

    await runPipeline(makeConfig());

    expect(runRetrospectivePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'failed',
      'implementer',
    );
    expect(mockNotifier.send).toHaveBeenCalledWith(expect.stringContaining('failed'));
  });

  it('implement failure, unattended mode -> auto-abort', async () => {
    vi.mocked(runImplementPhase).mockResolvedValue({ result: failedResult, nextPhase: 'abort' });
    // Unattended notifier auto-selects last option ("Abort")
    mockNotifier.askUser.mockResolvedValue('Abort');

    await runPipeline(makeConfig({ mode: 'unattended' }));

    expect(runRetrospectivePhase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'failed',
      'implementer',
    );
  });

  it('review critical findings, attended, user overrides -> close', async () => {
    vi.mocked(runImplementPhase).mockResolvedValue({ result: completedResult, nextPhase: 'verify' });
    vi.mocked(runVerifyPhase).mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    vi.mocked(runReviewPhase).mockResolvedValue({ result: failedResult, nextPhase: 'abort' });
    vi.mocked(runClosePhase).mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });
    mockNotifier.askUser.mockResolvedValue('Override and continue');

    await runPipeline(makeConfig());

    expect(runClosePhase).toHaveBeenCalledTimes(1);
    expect(runRetrospectivePhase).toHaveBeenCalledWith(
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
    vi.mocked(TaskStore).mockImplementation(
      () =>
        ({
          read: vi.fn().mockResolvedValue(verifyingTask),
          readStatus: vi.fn().mockResolvedValue('verifying'),
          setStatus: vi.fn().mockResolvedValue(undefined),
          setAgentPhase: vi.fn().mockResolvedValue(undefined),
          setField: vi.fn().mockResolvedValue(undefined),
        }) as any,
    );

    vi.mocked(runVerifyPhase).mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    vi.mocked(runReviewPhase).mockResolvedValue({ result: completedResult, nextPhase: 'close' });
    vi.mocked(runClosePhase).mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig());

    // Should NOT have called implement phase — started at verify
    expect(runImplementPhase).not.toHaveBeenCalled();
    expect(runVerifyPhase).toHaveBeenCalledTimes(1);
  });

  it('dry-run mode -> all phases pass with dry-run results', async () => {
    const dryResult = {
      result: { ...completedResult, summary: '[dry-run] skipped' },
      nextPhase: 'verify' as const,
    };
    vi.mocked(runImplementPhase).mockResolvedValue({ ...dryResult, nextPhase: 'verify' });
    vi.mocked(runVerifyPhase).mockResolvedValue({ ...dryResult, nextPhase: 'review' });
    vi.mocked(runReviewPhase).mockResolvedValue({ ...dryResult, nextPhase: 'close' });
    vi.mocked(runClosePhase).mockResolvedValue({ ...dryResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig({ dryRun: true }));

    expect(runImplementPhase).toHaveBeenCalledTimes(1);
    expect(runRetrospectivePhase).toHaveBeenCalledTimes(1);
  });

  it('log-run.sh is called at the end with outcome', async () => {
    vi.mocked(runImplementPhase).mockResolvedValue({ result: completedResult, nextPhase: 'verify' });
    vi.mocked(runVerifyPhase).mockResolvedValue({ result: completedResult, nextPhase: 'review' });
    vi.mocked(runReviewPhase).mockResolvedValue({ result: completedResult, nextPhase: 'close' });
    vi.mocked(runClosePhase).mockResolvedValue({ result: prResult, nextPhase: 'retrospective' });

    await runPipeline(makeConfig());

    expect(runScript).toHaveBeenCalledWith('bash', [
      '/case/scripts/log-run.sh',
      '/case/tasks/active/cli-1.task.json',
      'completed',
    ]);
  });
});
