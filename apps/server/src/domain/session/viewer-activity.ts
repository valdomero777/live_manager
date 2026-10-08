import type { LiveEvent } from '@tiklive/contracts';

/** Per-viewer facts derived from the session's event history, as seen by one event. */
export interface ViewerActivitySnapshot {
  readonly likesBefore: number;
  readonly likesAfter: number;
  /** True when this event is the viewer's first gift or comment in the session. */
  readonly isFirstInteraction: boolean;
}

const EMPTY: ViewerActivitySnapshot = { likesBefore: 0, likesAfter: 0, isFirstInteraction: false };
const INTERACTION_TYPES: ReadonlySet<LiveEvent['type']> = new Set(['gift', 'comment']);

interface ViewerState {
  likes: number;
  hasInteracted: boolean;
}

/** In-memory accumulator of viewer activity, reset whenever the session changes. */
export class ViewerActivityTracker {
  private sessionId: number | undefined;
  private readonly viewers = new Map<string, ViewerState>();

  record(event: LiveEvent): ViewerActivitySnapshot {
    this.switchSession(event.sessionId);
    if (!('viewer' in event)) return EMPTY;

    const state = this.stateFor(event.viewer.tiktokUserId);
    const likesBefore = state.likes;
    if (event.type === 'like') state.likes += event.likeDelta;

    const isInteraction = INTERACTION_TYPES.has(event.type);
    const isFirstInteraction = isInteraction && !state.hasInteracted;
    if (isInteraction) state.hasInteracted = true;

    return { likesBefore, likesAfter: state.likes, isFirstInteraction };
  }

  private switchSession(sessionId: number): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId;
    this.viewers.clear();
  }

  private stateFor(viewerId: string): ViewerState {
    let state = this.viewers.get(viewerId);
    if (!state) {
      state = { likes: 0, hasInteracted: false };
      this.viewers.set(viewerId, state);
    }
    return state;
  }
}
