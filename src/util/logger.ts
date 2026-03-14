export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  phase(phase: string, status: string, data?: Record<string, unknown>): void;
}

/**
 * Structured JSON-lines logger writing to stderr.
 * Stdout is reserved for pipeline output.
 */
export function createLogger(): Logger {
  function emit(level: string, message: string, extra?: Record<string, unknown>) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...extra,
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  return {
    info(message, data) {
      emit('info', message, data);
    },
    error(message, data) {
      emit('error', message, data);
    },
    phase(phase, status, data) {
      emit('info', `phase:${phase}`, { phase, status, ...data });
    },
  };
}
