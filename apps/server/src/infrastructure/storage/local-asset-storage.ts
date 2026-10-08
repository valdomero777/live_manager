import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { AssetStorage } from '../../application/ports/asset-repository.js';

/** Asset files in ASSETS_DIR. Names are server-generated hashes; basename() blocks traversal. */
export class LocalAssetStorage implements AssetStorage {
  constructor(private readonly dir: string) {}

  async write(filename: string, content: Uint8Array): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const target = this.path(filename);
    const temp = `${target}.tmp`;
    await writeFile(temp, content);
    await rename(temp, target);
  }

  async remove(filename: string): Promise<void> {
    await rm(this.path(filename), { force: true });
  }

  private path(filename: string): string {
    return join(this.dir, basename(filename));
  }
}
