import { FEED_EVENT_TYPES, type FeedEventType } from '@tiklive/contracts';
import { startDataOverlay } from '../core/data-overlay.js';
import { readNumber } from '../core/params.js';
import { FeedPanel } from '../panels/feed.js';

const DEFAULT_TYPES: readonly FeedEventType[] = ['gift', 'follow'];
const params = new URLSearchParams(location.search);

/** ?types=gift,follow — unknown names are ignored; empty falls back to the defaults. */
function readTypes(): readonly FeedEventType[] {
  const types = (params.get('types') ?? '')
    .split(',')
    .map((t) => FEED_EVENT_TYPES.find((known) => known === t.trim()))
    .filter((t): t is FeedEventType => t !== undefined);
  return types.length > 0 ? types : DEFAULT_TYPES;
}

const panel = new FeedPanel({
  types: readTypes(),
  limit: readNumber('limit', 6, 1, 15),
  title: params.get('title')?.slice(0, 60) ?? undefined,
  showAlias: params.get('name') === 'alias',
});
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('feed', [panel]);
