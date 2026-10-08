import type { Clock } from '../../domain/shared/time.js';
import type { Logger } from '../ports/logger.js';
import type { LiveSessionRecord, SessionRepository } from '../ports/session-repository.js';

export type SessionListener = (session: LiveSessionRecord | undefined) => void;

/** Tracks the active LiveSession; a new target or a stream end opens a new one. */
export class SessionService {
  private current: LiveSessionRecord | undefined;
  private readonly listeners = new Set<SessionListener>();

  constructor(
    private readonly repo: SessionRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Power loss or crash leaves sessions open; they are closed and a new one starts on demand. */
  async recoverAfterRestart(): Promise<void> {
    const closed = await this.repo.closeDangling(this.clock.now());
    if (closed > 0) this.logger.info({ closed }, 'closed dangling sessions');
  }

  /** Notified after a session starts (record) or ends (undefined). */
  onChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  active(): LiveSessionRecord | undefined {
    return this.current;
  }

  currentId(): number | undefined {
    return this.current?.id;
  }

  async ensureActive(tiktokUser: string): Promise<number> {
    if (this.current?.tiktokUser === tiktokUser) return this.current.id;
    if (this.current) await this.end();
    this.current = await this.repo.start(tiktokUser, this.clock.now());
    this.logger.info({ sessionId: this.current.id, tiktokUser }, 'session started');
    this.notify();
    return this.current.id;
  }

  async end(): Promise<void> {
    if (!this.current) return;
    await this.repo.end(this.current.id, this.clock.now());
    this.logger.info({ sessionId: this.current.id }, 'session ended');
    this.current = undefined;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.current));
  }
}
