import { startDataOverlay } from '../core/data-overlay.js';
import { TopStreakPanel } from '../panels/top-streak.js';

const params = new URLSearchParams(location.search);
const panel = new TopStreakPanel({
  title: params.get('title')?.slice(0, 60) ?? undefined,
  showAlias: params.get('name') === 'alias',
});
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('streak', [panel]);
