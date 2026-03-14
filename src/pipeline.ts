import { resolve } from 'node:path';
import type { AgentName, AgentResult, PipelineConfig, PipelinePhase } from './types.js';
import { TaskStore } from './state/task-store.js';
import { determineEntryPhase } from './state/transitions.js';
import { createNotifier, type Notifier } from './notify.js';
import { runImplementPhase } from './phases/implement.js';
import { runVerifyPhase } from './phases/verify.js';
import { runReviewPhase } from './phases/review.js';
import { runClosePhase } from './phases/close.js';
import { runRetrospectivePhase } from './phases/retrospective.js';
import { runScript } from './util/run-script.js';
import { createLogger } from './util/logger.js';

const log = createLogger();

/**
 * Core pipeline loop — while/switch replacing SKILL.md Steps 4-9.
 *
 * Each case calls the corresponding phase module and handles success/failure
 * branching based on the pipeline mode (attended/unattended).
 */
export async function runPipeline(config: PipelineConfig): Promise<void> {
  const store = new TaskStore(config.taskJsonPath, config.caseRoot);
  const notifier = createNotifier(config.mode);
  const previousResults = new Map<AgentName, AgentResult>();

  const task = await store.read();
  let currentPhase: PipelinePhase = determineEntryPhase(task);
  let outcome: 'completed' | 'failed' = 'completed';
  let failedAgent: AgentName | undefined;

  log.info('pipeline started', { phase: currentPhase, mode: config.mode, task: task.id });

  while (currentPhase !== 'complete' && currentPhase !== 'abort') {
    log.phase(currentPhase, 'entering');

    switch (currentPhase) {
      case 'implement': {
        const output = await runImplementPhase(config, store, previousResults);
        if (output.nextPhase === 'abort') {
          const choice = await handleFailure(notifier, config, 'implementer', output.result, [
            'Retry with guidance',
            'Abort',
          ]);
          if (choice === 'Retry with guidance') {
            // Re-enter implement phase (the retry already happened inside the phase,
            // this is a user-guided re-run)
            currentPhase = 'implement';
          } else {
            failedAgent = 'implementer';
            outcome = 'failed';
            currentPhase = 'retrospective';
          }
        } else {
          currentPhase = output.nextPhase;
        }
        break;
      }

      case 'verify': {
        const output = await runVerifyPhase(config, store, previousResults);
        if (output.nextPhase === 'abort') {
          const choice = await handleFailure(notifier, config, 'verifier', output.result, [
            'Re-implement and re-verify',
            'Skip verification',
            'Abort',
          ]);
          if (choice === 'Re-implement and re-verify') {
            currentPhase = 'implement';
          } else if (choice === 'Skip verification') {
            currentPhase = 'review';
          } else {
            failedAgent = 'verifier';
            outcome = 'failed';
            currentPhase = 'retrospective';
          }
        } else {
          currentPhase = output.nextPhase;
        }
        break;
      }

      case 'review': {
        const output = await runReviewPhase(config, store, previousResults);
        if (output.nextPhase === 'abort') {
          const choice = await handleFailure(notifier, config, 'reviewer', output.result, [
            'Re-implement and re-review',
            'Override and continue',
            'Abort',
          ]);
          if (choice === 'Re-implement and re-review') {
            currentPhase = 'implement';
          } else if (choice === 'Override and continue') {
            currentPhase = 'close';
          } else {
            failedAgent = 'reviewer';
            outcome = 'failed';
            currentPhase = 'retrospective';
          }
        } else {
          currentPhase = output.nextPhase;
        }
        break;
      }

      case 'close': {
        const output = await runClosePhase(config, store, previousResults);
        if (output.nextPhase === 'abort') {
          const choice = await handleFailure(notifier, config, 'closer', output.result, [
            'Retry',
            'Abort',
          ]);
          if (choice === 'Retry') {
            currentPhase = 'close';
          } else {
            failedAgent = 'closer';
            outcome = 'failed';
            currentPhase = 'retrospective';
          }
        } else {
          // Success — report PR URL
          const prUrl = output.result.artifacts.prUrl;
          if (prUrl) {
            notifier.send(`PR created: ${prUrl}`);
          }
          currentPhase = output.nextPhase;
        }
        break;
      }

      case 'retrospective': {
        await runRetrospectivePhase(config, store, previousResults, outcome, failedAgent);
        currentPhase = outcome === 'completed' ? 'complete' : 'abort';
        break;
      }
    }
  }

  // Log the run
  const logRunScript = resolve(config.caseRoot, 'scripts/log-run.sh');
  const logArgs = [logRunScript, config.taskJsonPath, outcome];
  if (failedAgent) logArgs.push(failedAgent);
  await runScript('bash', logArgs);

  log.info('pipeline finished', { outcome, failedAgent });

  if (outcome === 'failed') {
    notifier.send(`Pipeline failed at ${failedAgent ?? 'unknown'} phase.`);
  } else {
    notifier.send('Pipeline completed successfully.');
  }
}

async function handleFailure(
  notifier: Notifier,
  config: PipelineConfig,
  agent: AgentName,
  result: AgentResult,
  options: string[],
): Promise<string> {
  const errorMsg = result.error ?? result.summary ?? 'unknown error';
  const prompt = `${agent} failed: ${errorMsg}`;

  return notifier.askUser(prompt, options);
}
