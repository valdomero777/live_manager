import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../../application/ports/config-store.js';

/** argon2id with the library defaults (memory-hard; tuned for interactive logins). */
export class Argon2Hasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
