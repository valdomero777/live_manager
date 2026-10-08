import type { AssetKind } from '@tiklive/contracts';

export interface MediaType {
  readonly kind: AssetKind;
  readonly ext: string;
}

type Matcher = (b: Uint8Array) => boolean;

const ascii = (b: Uint8Array, offset: number, text: string): boolean =>
  [...text].every((ch, i) => b[offset + i] === ch.charCodeAt(0));

const bytes = (b: Uint8Array, offset: number, values: readonly number[]): boolean =>
  values.every((v, i) => b[offset + i] === v);

/** MPEG audio frame sync: 11 set bits (0xFFE). */
const isMpegFrame: Matcher = (b) => b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0;

/**
 * File type by content ("magic bytes"), never by the declared name or MIME (spec 16: uploads).
 * Order matters: RIFF covers both WAV and WebP.
 */
const SIGNATURES: readonly (readonly [Matcher, MediaType])[] = [
  [(b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE'), { kind: 'audio', ext: 'wav' }],
  [(b) => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP'), { kind: 'image', ext: 'webp' }],
  [(b) => ascii(b, 0, 'ID3') || isMpegFrame(b), { kind: 'audio', ext: 'mp3' }],
  [(b) => ascii(b, 0, 'OggS'), { kind: 'audio', ext: 'ogg' }],
  [(b) => ascii(b, 4, 'ftypM4A'), { kind: 'audio', ext: 'm4a' }],
  [
    (b) => bytes(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    { kind: 'image', ext: 'png' },
  ],
  [(b) => bytes(b, 0, [0xff, 0xd8, 0xff]), { kind: 'image', ext: 'jpg' }],
  [(b) => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'), { kind: 'image', ext: 'gif' }],
  [(b) => bytes(b, 0, [0x1a, 0x45, 0xdf, 0xa3]), { kind: 'video', ext: 'webm' }],
];

export function detectMediaType(content: Uint8Array): MediaType | undefined {
  return SIGNATURES.find(([matches]) => matches(content))?.[1];
}
