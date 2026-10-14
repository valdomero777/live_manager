import type { Readable } from 'node:stream';
import type { TtsVoiceInfo } from '@tiklive/contracts';
import { MsEdgeTTS, OUTPUT_FORMAT, type Voice } from 'msedge-tts';
import {
  SpeechSynthesisError,
  type SpeechSynthesizer,
  type SynthesisRequest,
} from '../../application/ports/speech-synthesizer.js';

const CONNECTION_TIMEOUT_MS = 5_000;
const SYNTHESIS_TIMEOUT_MS = 10_000;
/** About ten minutes of 48 kbit/s MP3: far more than 500 characters of speech. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Edge voice ShortName: "es-MX-DaliaNeural", "en-US-AvaMultilingualNeural". */
const SHORT_NAME = /^[a-z]{2,3}(-[A-Za-z0-9]+)+Neural$/;

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** The library puts the text inside its SSML template as is: viewer text must not add tags. */
export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);
}

function signed(value: number, unit: string): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}${unit}`;
}

/** Our rate/pitch are multipliers (1 = normal); SSML wants relative offsets. */
export function prosody(request: Pick<SynthesisRequest, 'rate' | 'pitch'>) {
  return {
    rate: signed(((request.rate ?? 1) - 1) * 100, '%'),
    pitch: signed(((request.pitch ?? 1) - 1) * 50, 'Hz'),
  };
}

/** "Microsoft Dalia Online (Natural) - Spanish (Mexico)" -> "Dalia". */
function displayName(voice: Voice): string {
  const fromFriendly = /^Microsoft (.+?) Online/.exec(voice.FriendlyName)?.[1];
  const fromShort = voice.ShortName.split('-')
    .at(-1)
    ?.replace(/Neural$/, '');
  return fromFriendly ?? fromShort ?? voice.ShortName;
}

function toInfo(voice: Voice): TtsVoiceInfo | undefined {
  const gender = voice.Gender.toLowerCase();
  if (gender !== 'female' && gender !== 'male') return undefined;
  if (!SHORT_NAME.test(voice.ShortName) || voice.Status === 'Deprecated') return undefined;
  return { name: voice.ShortName, displayName: displayName(voice), locale: voice.Locale, gender };
}

function collect(stream: Readable, timeoutMs: number, maxBytes: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const fail = (error: Error) => {
      clearTimeout(timer);
      stream.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('timeout')), timeoutMs);
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) fail(new Error('audio too large'));
      else chunks.push(chunk);
    });
    stream.once('error', fail);
    stream.once('end', () => {
      clearTimeout(timer);
      if (size === 0) reject(new Error('no audio received'));
      else resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * Microsoft Edge "Read Aloud" neural voices through msedge-tts (no key needed). The service is
 * unofficial: it can change without notice, so every failure becomes a SpeechSynthesisError and
 * the audio screen falls back to the browser voice. Viewer text leaves the LAN to Microsoft.
 */
export class EdgeSpeechSynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly timeoutMs = SYNTHESIS_TIMEOUT_MS,
    private readonly maxBytes = MAX_AUDIO_BYTES,
  ) {}

  async listVoices(): Promise<TtsVoiceInfo[]> {
    try {
      const voices = await new MsEdgeTTS().getVoices();
      return voices.map(toInfo).filter((v): v is TtsVoiceInfo => v !== undefined);
    } catch (error) {
      throw new SpeechSynthesisError('No se pudo leer el catálogo de voces de Edge', {
        cause: error,
      });
    }
  }

  async synthesize(request: SynthesisRequest): Promise<Uint8Array> {
    const tts = new MsEdgeTTS({
      connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
      synthesisTimeoutMs: this.timeoutMs,
    });
    try {
      await tts.setMetadata(request.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(request.text), prosody(request));
      return await collect(audioStream, this.timeoutMs, this.maxBytes);
    } catch (error) {
      throw new SpeechSynthesisError('La voz de Edge no respondió', { cause: error });
    } finally {
      tts.close();
    }
  }
}
