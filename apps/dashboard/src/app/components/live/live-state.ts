import type { ConnectorStatus } from '@tiklive/contracts';

/** What the streamer needs to know about the TikTok connection, in product terms. */
export type LiveState =
  'unknown' | 'disconnected' | 'connecting' | 'connected' | 'live' | 'reconnecting' | 'error';

export type LiveTone = 'neutral' | 'info' | 'success' | 'live' | 'warning' | 'danger';

export interface LiveStateView {
  readonly state: LiveState;
  readonly label: string;
  readonly hint: string;
  readonly tone: LiveTone;
  /** Animated dot: something is happening right now. */
  readonly pulse: boolean;
}

const VIEWS: Readonly<Record<LiveState, Omit<LiveStateView, 'state' | 'hint'>>> = {
  unknown: { label: 'Comprobando…', tone: 'neutral', pulse: false },
  disconnected: { label: 'Desconectado', tone: 'neutral', pulse: false },
  connecting: { label: 'Conectando', tone: 'info', pulse: true },
  connected: { label: 'Conectado', tone: 'success', pulse: false },
  live: { label: 'LIVE', tone: 'live', pulse: true },
  reconnecting: { label: 'Reconectando', tone: 'warning', pulse: true },
  error: { label: 'Error', tone: 'danger', pulse: false },
};

function stateOf(status: ConnectorStatus | undefined): LiveState {
  switch (status?.state) {
    case undefined:
      return 'unknown';
    case 'connecting':
      return 'connecting';
    case 'waiting_host':
      return 'connected';
    case 'connected':
      return 'live';
    case 'reconnecting':
      return 'reconnecting';
    case 'stopped':
      // A failure stops the connector; a manual disconnect ends in idle (lastError is kept).
      return status.lastError ? 'error' : 'disconnected';
    default:
      return 'disconnected';
  }
}

type HintFn = (target: string, status: ConnectorStatus | undefined) => string;

const HINTS: Readonly<Record<LiveState, HintFn>> = {
  unknown: () => 'Leyendo el estado del conector',
  disconnected: (t) => (t ? `Último usuario: ${t}` : 'Sin cuenta conectada'),
  connecting: (t) => (t ? `Conectando con ${t}…` : 'Abriendo la conexión…'),
  connected: () => 'Esperando a que inicies el live',
  live: (t) => (t ? `Recibiendo eventos de ${t}` : 'Recibiendo eventos'),
  reconnecting: (_, s) => (s?.lastError ? `Reintentando · ${s.lastError}` : 'Reintentando…'),
  error: (_, s) => s?.lastError ?? 'La conexión se detuvo',
};

function hintOf(state: LiveState, status: ConnectorStatus | undefined): string {
  return HINTS[state](status?.target ? `@${status.target}` : '', status);
}

/** Maps the connector's technical state to the six states the UI shows. */
export function liveStateOf(status: ConnectorStatus | undefined): LiveStateView {
  const state = stateOf(status);
  return { state, hint: hintOf(state, status), ...VIEWS[state] };
}
