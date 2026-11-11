import { startDataOverlay } from '../core/data-overlay.js';
import { readChoice, readNumber } from '../core/params.js';
import { GiftGuidePanel } from '../panels/gift-guide.js';

const params = new URLSearchParams(location.search);
const panel = new GiftGuidePanel({
  layout: readChoice('layout', ['column', 'row'] as const, 'column'),
  speed: readNumber('speed', 30, 0, 300),
  title: params.get('title')?.slice(0, 60) ?? 'Regalos y reacciones',
});
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('giftguide', [panel]);
