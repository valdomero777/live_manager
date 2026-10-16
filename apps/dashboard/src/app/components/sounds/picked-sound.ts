import type { Asset, Sound, SoundOrigin } from '@tiklive/contracts';

/** A sound chosen in the picker, wherever it comes from: MyInstants, Freesound or the library. */
export interface PickedSound {
  readonly id: string;
  readonly title: string;
  readonly audioUrl: string;
  readonly pageUrl: string;
  readonly source: SoundOrigin;
  /** Only for the library: the uploaded asset's id, which rule actions store. */
  readonly assetId?: number;
}

export function pickedFromSound(sound: Sound): PickedSound {
  const { id, title, audioUrl, pageUrl, source } = sound;
  return { id, title, audioUrl, pageUrl, source };
}

/** Library sounds are served by this server, so the URL doubles as the "page". */
export function pickedFromAsset(asset: Asset): PickedSound {
  return {
    id: String(asset.id),
    title: asset.originalName,
    audioUrl: asset.url,
    pageUrl: asset.url,
    source: 'library',
    assetId: asset.id,
  };
}
