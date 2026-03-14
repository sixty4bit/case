import { createInterface } from 'node:readline';
import type { PipelineMode } from './types.js';

export interface Notifier {
  send(message: string): void;
  askUser(prompt: string, options: string[]): Promise<string>;
}

/**
 * Attended mode: prompts human via readline.
 * Unattended mode: auto-selects the last option (by convention, the safe default / "Abort").
 */
export function createNotifier(mode: PipelineMode): Notifier {
  if (mode === 'unattended') {
    return {
      send(message) {
        process.stdout.write(`[unattended] ${message}\n`);
      },
      async askUser(_prompt, options) {
        const choice = options[options.length - 1];
        process.stdout.write(`[unattended] Auto-selecting: ${choice}\n`);
        return choice;
      },
    };
  }

  return {
    send(message) {
      process.stdout.write(`${message}\n`);
    },
    async askUser(prompt, options) {
      process.stdout.write(`\n${prompt}\n`);
      options.forEach((opt, i) => {
        process.stdout.write(`  ${i + 1}. ${opt}\n`);
      });

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await new Promise<string>((resolve) => {
          rl.question('Choose (number): ', resolve);
        });
        const idx = parseInt(answer, 10) - 1;
        if (idx >= 0 && idx < options.length) {
          return options[idx];
        }
        // Invalid input defaults to last option (safe default)
        return options[options.length - 1];
      } finally {
        rl.close();
      }
    },
  };
}
