import type { AuthStatus } from '@tiklive/contracts';
import type { Clock } from '../../domain/shared/time.js';
import type { ConfigStore, PasswordHasher, SecretGenerator } from '../ports/config-store.js';
import type { Logger } from '../ports/logger.js';

export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_MAX_MS = 12 * 60 * 60_000;
export const MAX_FAILED_LOGINS = 5;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60_000;

export type AuthErrorCode =
  'invalid_password' | 'locked' | 'invalid_code' | 'already_set' | 'no_password';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}

interface Session {
  readonly createdAt: number;
  lastSeen: number;
}

interface AuthDeps {
  readonly store: ConfigStore;
  /** ADMIN_PASSWORD_HASH from the environment; a hash saved from the UI takes precedence. */
  readonly envPasswordHash: string | undefined;
  readonly hasher: PasswordHasher;
  readonly secrets: SecretGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * Dashboard authentication (RNF-07): one admin password (argon2id), opaque session tokens with
 * idle and absolute expiry, and a per-IP lockout after repeated failures. The first password is
 * created with a one-time setup code shown only in the server console.
 */
export class AuthService {
  private readonly sessions = new Map<string, Session>();
  private readonly failures = new Map<string, number[]>();
  private setupCode: string | undefined;

  constructor(private readonly deps: AuthDeps) {}

  hasPassword(): boolean {
    return this.passwordHash() !== undefined;
  }

  /** Creates (once) the setup code for a fresh install; undefined when a password exists. */
  prepareSetup(): string | undefined {
    if (this.hasPassword()) return undefined;
    this.setupCode ??= this.deps.secrets.code();
    return this.setupCode;
  }

  status(token: string | undefined): AuthStatus {
    return { authenticated: this.validate(token), setupRequired: !this.hasPassword() };
  }

  async setup(code: string, password: string): Promise<string> {
    if (this.hasPassword()) throw new AuthError('already_set');
    if (!this.setupCode || code.trim().toUpperCase() !== this.setupCode)
      throw new AuthError('invalid_code');
    await this.savePassword(password);
    this.setupCode = undefined;
    this.deps.logger.info({}, 'admin password created');
    return this.newSession();
  }

  async login(password: string, ip: string): Promise<string> {
    const hash = this.passwordHash();
    if (!hash) throw new AuthError('no_password');
    if (this.isLocked(ip)) throw new AuthError('locked');
    if (!(await this.deps.hasher.verify(hash, password))) {
      this.recordFailure(ip);
      this.deps.logger.warn({ ip }, 'failed dashboard login');
      throw new AuthError('invalid_password');
    }
    this.failures.delete(ip);
    return this.newSession();
  }

  /** Valid and not expired; each successful check slides the idle timeout. */
  validate(token: string | undefined): boolean {
    if (!token) return false;
    const session = this.sessions.get(token);
    if (!session) return false;
    const now = this.deps.clock.now();
    if (now - session.lastSeen > SESSION_IDLE_MS || now - session.createdAt > SESSION_MAX_MS) {
      this.sessions.delete(token);
      return false;
    }
    session.lastSeen = now;
    return true;
  }

  logout(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }

  /** Changing the password signs out every other session. */
  async changePassword(current: string, next: string): Promise<string> {
    const hash = this.passwordHash();
    if (!hash || !(await this.deps.hasher.verify(hash, current))) {
      throw new AuthError('invalid_password');
    }
    await this.savePassword(next);
    this.sessions.clear();
    this.deps.logger.info({}, 'admin password changed');
    return this.newSession();
  }

  private passwordHash(): string | undefined {
    return this.deps.store.read().adminPasswordHash ?? this.deps.envPasswordHash;
  }

  private async savePassword(password: string): Promise<void> {
    const adminPasswordHash = await this.deps.hasher.hash(password);
    this.deps.store.write({ ...this.deps.store.read(), adminPasswordHash });
  }

  private newSession(): string {
    const token = this.deps.secrets.token();
    const now = this.deps.clock.now();
    this.sessions.set(token, { createdAt: now, lastSeen: now });
    return token;
  }

  private recentFailures(ip: string): number[] {
    const now = this.deps.clock.now();
    return (this.failures.get(ip) ?? []).filter((t) => now - t < FAILED_LOGIN_WINDOW_MS);
  }

  private isLocked(ip: string): boolean {
    return this.recentFailures(ip).length >= MAX_FAILED_LOGINS;
  }

  private recordFailure(ip: string): void {
    this.failures.set(ip, [...this.recentFailures(ip), this.deps.clock.now()]);
  }
}
