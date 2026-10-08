import { channelOf } from '@tiklive/contracts';
import type { OverlayPanel } from '../panels/panel.js';
import { readCommonParams } from './params.js';
import { SnapshotRouter } from './snapshot-router.js';
import { applyTheme } from './theme.js';
import { ScreenSocket } from './ws-client.js';

export interface DataOverlay {
  readonly socket: ScreenSocket;
  readonly router: SnapshotRouter;
}

/**
 * Wires panels to one WebSocket: subscribes to their channels, routes snapshots and shows a
 * connection badge only with ?debug=1. One socket per page, whatever the number of panels.
 */
export function startDataOverlay(screenId: string, panels: readonly OverlayPanel[]): DataOverlay {
  applyTheme();
  const params = readCommonParams();
  const debug = document.querySelector<HTMLElement>('#debug');
  const showDebug = (text: string) => {
    if (!params.debug || !debug) return;
    debug.hidden = false;
    debug.textContent = text;
  };
  params.warnings.forEach(showDebug);

  const router = new SnapshotRouter();
  for (const panel of panels) {
    router.on(channelOf(panel.subscription), (message) => panel.update(message));
  }
  const socket = new ScreenSocket({
    screenId,
    key: params.key,
    subscriptions: panels.map((p) => p.subscription),
    onState: (state) => {
      if (state === 'open') router.reset();
      showDebug(`ws: ${state}`);
    },
    onMessage: (message) => router.route(message),
  });
  socket.connect();
  return { socket, router };
}
