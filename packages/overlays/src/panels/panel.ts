import type { Subscription } from '@tiklive/contracts';
import type { SnapshotMessage } from '../core/snapshot-router.js';

/**
 * A self-contained view over one data channel. Standalone overlays mount one; the rotator
 * mounts several in a single DOM and toggles visibility, so adding a panel never touches it.
 */
export interface OverlayPanel {
  readonly element: HTMLElement;
  readonly subscription: Subscription;
  update(message: SnapshotMessage): void;
  /** Releases timers; the element is removed by the caller. */
  unmount(): void;
}
