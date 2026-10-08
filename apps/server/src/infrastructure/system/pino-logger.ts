import pino, { type Logger as PinoInstance } from 'pino';
import type { LogFields, Logger } from '../../application/ports/logger.js';

/** Never log secrets; comment text is only logged at debug level by callers. */
const REDACT = ['password', 'key', 'token', '*.password', '*.key', '*.token', 'req.headers.cookie'];

class PinoLogger implements Logger {
  constructor(private readonly pino: PinoInstance) {}

  debug(fields: LogFields, msg: string): void {
    this.pino.debug(fields, msg);
  }
  info(fields: LogFields, msg: string): void {
    this.pino.info(fields, msg);
  }
  warn(fields: LogFields, msg: string): void {
    this.pino.warn(fields, msg);
  }
  error(fields: LogFields, msg: string): void {
    this.pino.error(fields, msg);
  }
  child(fields: LogFields): Logger {
    return new PinoLogger(this.pino.child(fields));
  }
}

export function createPinoInstance(level: string): PinoInstance {
  return pino({ level, redact: REDACT, timestamp: pino.stdTimeFunctions.epochTime });
}

export function createLogger(instance: PinoInstance): Logger {
  return new PinoLogger(instance);
}
