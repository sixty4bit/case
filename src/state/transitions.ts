import type { PipelinePhase, TaskJson } from '../types.js';

/**
 * Determine which pipeline phase to enter based on current task state.
 * Encodes the re-entry semantics from SKILL.md Step 0.
 *
 * Resume status table:
 *   active              -> implement
 *   implementing        -> implement (if implementer not completed), verify (if completed)
 *   verifying           -> verify (if verifier not completed), review (if completed)
 *   reviewing           -> review (if reviewer not completed), close (if completed)
 *   closing             -> close
 *   pr-opened / merged  -> complete
 */
export function determineEntryPhase(task: TaskJson): PipelinePhase {
  switch (task.status) {
    case 'active':
      return 'implement';

    case 'implementing': {
      const impl = task.agents.implementer;
      if (impl?.status === 'completed') return 'verify';
      return 'implement';
    }

    case 'verifying': {
      const ver = task.agents.verifier;
      if (ver?.status === 'completed') return 'review';
      return 'verify';
    }

    case 'reviewing': {
      const rev = task.agents.reviewer;
      if (rev?.status === 'completed') return 'close';
      return 'review';
    }

    case 'closing':
      return 'close';

    case 'pr-opened':
    case 'merged':
      return 'complete';

    default:
      // Fallback for unknown states
      return 'implement';
  }
}
