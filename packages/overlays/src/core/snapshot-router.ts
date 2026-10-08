import type { ScreenServerMessage } from '@tiklive/contracts';

export type SnapshotMessage = Extract<
  ScreenServerMessage,
  { type: 'leaderboard.snapshot' | 'goal.progress' | 'stats.snapshot' }
>;

/** Same naming as the server's channelOf(): "leaderboard:diamonds:session", "goal:3", "stats". */
export function channelOfMessage(message: ScreenServerMessage): string | undefined {
  switch (message.type) {
    case 'leaderboard.snapshot':
      return `leaderboard:${message.payload.metric}:${message.payload.scope}`;
    case 'goal.progress':
      return `goal:${message.payload.goalId}`;
    case 'stats.snapshot':
      return 'stats';
    default:
      return undefined;
  }
}

type Listener = (message: SnapshotMessage) => void;

/**
 * Delivers snapshots to the panels listening on their channel and drops any snapshot older than
 * the last one applied (out-of-order delivery). reset() runs on reconnect, since a restarted
 * server starts its sequence again.
 */
export class SnapshotRouter {
  private readonly listeners = new Map<string, Listener[]>();
  private readonly lastSeq = new Map<string, number>();

  on(channel: string, listener: Listener): void {
    this.listeners.set(channel, [...(this.listeners.get(channel) ?? []), listener]);
  }

  route(message: ScreenServerMessage): void {
    const channel = channelOfMessage(message);
    if (channel === undefined) return;
    const snapshot = message as SnapshotMessage;
    const seq = snapshot.payload.seq;
    if (seq <= (this.lastSeq.get(channel) ?? 0)) return;
    this.lastSeq.set(channel, seq);
    this.listeners.get(channel)?.forEach((l) => l(snapshot));
  }

  reset(): void {
    this.lastSeq.clear();
  }
}
