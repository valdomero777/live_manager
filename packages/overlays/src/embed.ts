/** What the admin panel reuses to play the live audio inside its own page. */
export {
  AudioActionRunner,
  BrowserSpeech,
  ServerSpeech,
  WebAudioPlayer,
  describeError,
} from './audio/engine.js';
export type { AudioActionAck } from './audio/engine.js';
export { ScreenSocket, type ConnectionState } from './core/ws-client.js';
