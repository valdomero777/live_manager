import type { RawLiveEvent } from '@tiklive/contracts';
import {
  ControlEvent,
  TikTokLiveConnection,
  UserOfflineError,
  WebcastEvent,
} from 'tiktok-live-connector';
import {
  ConnectFailure,
  type LiveEventSource,
  type Unsubscribe,
} from '../../application/ports/live-event-source.js';
import type { Logger } from '../../application/ports/logger.js';
import type { Clock } from '../../domain/shared/time.js';
import type { ConnectFailureKind } from '../../domain/connector/connector-state.js';
import {
  mapChat,
  mapGift,
  mapLike,
  mapRoomUser,
  mapSocial,
  type ChatMessageLike,
  type GiftMessageLike,
  type LikeMessageLike,
  type RoomUserMessageLike,
  type SocialMessageLike,
} from './tiktok-message-mapper.js';

export interface TikTokAdapterOptions {
  /** Optional Euler Stream key; not required for basic use (verify limits in the README). */
  readonly signApiKey?: string;
}

/**
 * tiktok-live-connector types its emitter via typed-emitter's CJS default export, which does not
 * resolve under NodeNext. This narrow view restores the two methods we use.
 */
interface ConnectionEmitter {
  on(event: string, handler: (...args: never[]) => void): unknown;
  removeAllListeners(): unknown;
}

const emitterOf = (c: TikTokLiveConnection) => c as unknown as ConnectionEmitter;

const PROTOCOL_ERROR_NAMES = new Set([
  'SignAPIError',
  'SignatureRateLimitError',
  'SignatureMissingTokensError',
  'InvalidResponseError',
  'InvalidResponseCompositeError',
  'SchemaDecodeError',
  'InvalidSchemaNameError',
  'PremiumFeatureError',
]);

export function classifyConnectError(error: unknown): ConnectFailureKind {
  if (error instanceof UserOfflineError) return 'host_offline';
  const name = error instanceof Error ? error.constructor.name : '';
  if (PROTOCOL_ERROR_NAMES.has(name)) return 'protocol';
  return 'network';
}

/**
 * The only module that knows tiktok-live-connector (ADR 0002). One connection per start();
 * the ConnectorSupervisor decides when to try again.
 */
export class TikTokLiveConnectorAdapter implements LiveEventSource {
  private connection: TikTokLiveConnection | undefined;
  private stopping = false;
  private readonly eventHandlers = new Set<(event: RawLiveEvent) => void>();
  private readonly disconnectHandlers = new Set<(reason: string) => void>();

  constructor(
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly options: TikTokAdapterOptions = {},
  ) {}

  async start(target: string): Promise<void> {
    await this.stop();
    this.stopping = false;
    const connection = new TikTokLiveConnection(target, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      ...(this.options.signApiKey ? { signApiKey: this.options.signApiKey } : {}),
    });
    this.wire(connection);
    this.connection = connection;
    try {
      const state = await connection.connect();
      this.logger.info({ target, roomId: state.roomId }, 'tiktok connected');
    } catch (error) {
      this.connection = undefined;
      emitterOf(connection).removeAllListeners();
      throw new ConnectFailure(classifyConnectError(error), describe(error));
    }
  }

  async stop(): Promise<void> {
    const connection = this.connection;
    if (!connection) return;
    this.stopping = true;
    this.connection = undefined;
    try {
      await connection.disconnect();
    } finally {
      emitterOf(connection).removeAllListeners();
    }
  }

  onEvent(handler: (event: RawLiveEvent) => void): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onDisconnect(handler: (reason: string) => void): Unsubscribe {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  private wire(connection: TikTokLiveConnection): void {
    const c = emitterOf(connection);
    const now = () => this.clock.now();
    c.on(WebcastEvent.CHAT, (m: ChatMessageLike) => this.emit(mapChat(m, now())));
    c.on(WebcastEvent.GIFT, (m: GiftMessageLike) => this.emit(mapGift(m, now())));
    c.on(WebcastEvent.LIKE, (m: LikeMessageLike) => this.emit(mapLike(m, now())));
    c.on(WebcastEvent.FOLLOW, (m: SocialMessageLike) => this.emit(mapSocial('follow', m, now())));
    c.on(WebcastEvent.SHARE, (m: SocialMessageLike) => this.emit(mapSocial('share', m, now())));
    c.on(WebcastEvent.MEMBER, (m: SocialMessageLike) => this.emit(mapSocial('join', m, now())));
    c.on(WebcastEvent.ROOM_USER, (m: RoomUserMessageLike) => this.emit(mapRoomUser(m, now())));
    c.on(WebcastEvent.STREAM_END, () => this.emit({ kind: 'streamEnd', occurredAt: now() }));
    c.on(ControlEvent.ERROR, (err: unknown) =>
      this.logger.warn({ err: describe(err) }, 'tiktok error'),
    );
    c.on(ControlEvent.DISCONNECTED, (info: { code: number; reason?: string }) =>
      this.handleDisconnected(info.code, info.reason),
    );
  }

  private handleDisconnected(code: number, reason: string | undefined): void {
    if (this.stopping || !this.connection) return;
    this.connection = undefined;
    const text = `disconnected (${code}${reason ? `: ${reason}` : ''})`;
    for (const handler of this.disconnectHandlers) handler(text);
  }

  /** Mapping errors are contained: a bad message is counted and skipped, never thrown. */
  private emit(event: RawLiveEvent | null): void {
    if (!event) {
      this.logger.debug({}, 'tiktok message skipped by mapper');
      return;
    }
    for (const handler of this.eventHandlers) handler(event);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error);
}
