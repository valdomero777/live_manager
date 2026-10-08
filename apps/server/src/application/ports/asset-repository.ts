import type { AssetKind } from '@tiklive/contracts';

export type { AssetKind };

export interface AssetRecord {
  readonly id: number;
  readonly kind: AssetKind;
  /** Content-hashed name on disk and in the /media/ URL. */
  readonly filename: string;
  readonly sha256: string;
  readonly originalName: string;
  readonly sizeBytes: number;
  readonly durationMs?: number;
  readonly createdAt: number;
}

export interface AssetRepository {
  listAll(): Promise<AssetRecord[]>;
  findById(id: number): Promise<AssetRecord | undefined>;
  findBySha(sha256: string): Promise<AssetRecord | undefined>;
  create(asset: Omit<AssetRecord, 'id'>): Promise<AssetRecord>;
  delete(id: number): Promise<boolean>;
}

/** Where asset files live (outside the web root of the app code; served under /media/). */
export interface AssetStorage {
  write(filename: string, content: Uint8Array): Promise<void>;
  remove(filename: string): Promise<void>;
}
