import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { buildPipelineConfig } from './config.js';
import { runPipeline } from './pipeline.js';
import { createLogger } from './util/logger.js';
import type { PipelineMode } from './types.js';

const log = createLogger();

async function main() {
  const { values } = parseArgs({
    options: {
      task: { type: 'string', short: 't' },
      mode: { type: 'string', short: 'm' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  if (!values.task) {
    process.stderr.write('Error: --task <path> is required\n');
    printUsage();
    process.exit(1);
  }

  if (!existsSync(values.task)) {
    process.stderr.write(`Error: task file not found: ${values.task}\n`);
    process.exit(1);
  }

  const mode = values.mode as PipelineMode | undefined;
  if (mode && mode !== 'attended' && mode !== 'unattended') {
    process.stderr.write(`Error: --mode must be "attended" or "unattended"\n`);
    process.exit(1);
  }

  try {
    const config = await buildPipelineConfig({
      taskJsonPath: values.task,
      mode,
      dryRun: values['dry-run'],
    });

    await runPipeline(config);
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('pipeline crashed', { error: msg });
    process.stderr.write(`Fatal: ${msg}\n`);
    process.exit(1);
  }
}

function printUsage() {
  process.stdout.write(`
Usage: npx tsx src/index.ts --task <path> [options]

Options:
  --task, -t <path>     Path to .task.json file (required)
  --mode, -m <mode>     attended | unattended (default: attended)
  --dry-run             Log phase transitions without spawning agents
  --help, -h            Show this help
`);
}

main();
