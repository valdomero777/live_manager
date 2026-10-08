const SAMPLE_RATE = 44_100;

/** Two-tone chime (E6 then A6) with exponential decay, 16-bit mono PCM WAV. */
export function generateDing(): Buffer {
  const seconds = 0.6;
  const samples = Math.floor(SAMPLE_RATE * seconds);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    const freq = t < 0.12 ? 1318.5 : 1760;
    const envelope = Math.exp(-6 * (t < 0.12 ? t : t - 0.12));
    pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * t) * envelope * 0.5 * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
