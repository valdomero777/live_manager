import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RawLiveEventSchema, simulatedViewer, type RawLiveEvent } from '@tiklive/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../../application/ports/logger.js';
import { JsonlRecorder } from './jsonl-recorder.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const raw = (n: number): RawLiveEvent =>
  RawLiveEventSchema.parse({
    kind: 'comment',
    occurredAt: 1_000 + n,
    viewer: simulatedViewer('ana'),
    text: `hola ${n}`,
  });

describe('JsonlRecorder', () => {
  it('writes one parseable RawLiveEvent per line, in the format replay reads, and appends', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiklive-rec-'));
    dirs.push(dir);
    const path = join(dir, 'nested', 'live.jsonl');

    const first = new JsonlRecorder(path, silentLogger);
    first.write(raw(1));
    first.write(raw(2));
    await first.close();
    const second = new JsonlRecorder(path, silentLogger);
    second.write(raw(3));
    await second.close();

    const lines = readFileSync(path, 'utf8').trim().split('\n');
    const events = lines.map((line) => RawLiveEventSchema.parse(JSON.parse(line)));
    expect(events.map((e) => e.occurredAt)).toEqual([1_001, 1_002, 1_003]);
  });

  it('ignores writes after close', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiklive-rec-'));
    dirs.push(dir);
    const path = join(dir, 'live.jsonl');
    const recorder = new JsonlRecorder(path, silentLogger);
    await recorder.close();
    expect(() => recorder.write(raw(1))).not.toThrow();
  });
});
