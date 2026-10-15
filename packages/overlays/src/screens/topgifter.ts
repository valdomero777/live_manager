import { METRICS, SCOPES } from '@tiklive/contracts';
import { startDataOverlay } from '../core/data-overlay.js';
import { readChoice } from '../core/params.js';
import { TopGifterPanel } from '../panels/top-gifter.js';

const params = new URLSearchParams(location.search);
const panel = new TopGifterPanel({
  metric: readChoice('metric', METRICS, 'diamonds'),
  scope: readChoice('scope', SCOPES, 'session'),
  title: params.get('title')?.slice(0, 60) ?? undefined,
  showAlias: params.get('name') === 'alias',
});
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('topgifter', [panel]);
