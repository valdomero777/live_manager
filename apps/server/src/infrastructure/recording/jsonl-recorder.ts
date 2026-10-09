import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import type { RawLiveEvent } from '@tiklive/contracts';
import type { Logger } from '../../application/ports/logger.js';

/**
 * Appends every raw event to a JSONL file, one per line, in the format `simulate replay` reads.
 * It exists to capture a real live for regression tests of the message mapping (R-01). It never
 * throws into the event path: a disk error stops the recording and is logged once.
 */
export class JsonlRecorder {
  private stream: WriteStream | undefined;

  constructor(
    path: string,
    private readonly logger: Logger,
  ) {
    mkdirSync(dirname(path), { recursive: true });
    this.stream = createWriteStream(path, { flags: 'a' });
    this.stream.on('error', (error) => {
      this.logger.error({ path, err: error.message }, 'recording stopped');
      this.stream = undefined;
    });
  }

  write(raw: RawLiveEvent): void {
    this.stream?.write(`${JSON.stringify(raw)}\n`);
  }

  close(): Promise<void> {
    const stream = this.stream;
    this.stream = undefined;
    return stream ? new Promise((resolve) => stream.end(resolve)) : Promise.resolve();
  }
}
