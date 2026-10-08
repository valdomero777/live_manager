export interface LiveSessionRecord {
  readonly id: number;
  readonly tiktokUser: string;
  readonly startedAt: number;
  readonly endedAt?: number;
}

export interface SessionRepository {
  start(tiktokUser: string, startedAt: number): Promise<LiveSessionRecord>;
  end(sessionId: number, endedAt: number): Promise<void>;
  /** Closes sessions left open by a crash or power loss. */
  closeDangling(endedAt: number): Promise<number>;
}
