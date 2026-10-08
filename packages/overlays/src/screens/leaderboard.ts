import { MAX_LEADERBOARD_LIMIT, METRICS, SCOPES } from '@tiklive/contracts';
import { startDataOverlay } from '../core/data-overlay.js';
import { readChoice, readNumber } from '../core/params.js';
import { LeaderboardPanel } from '../panels/leaderboard.js';

const params = new URLSearchParams(location.search);
const panel = new LeaderboardPanel({
  metric: readChoice('metric', METRICS, 'diamonds'),
  scope: readChoice('scope', SCOPES, 'session'),
  limit: readNumber('limit', 5, 1, MAX_LEADERBOARD_LIMIT),
  title: params.get('title')?.slice(0, 60) ?? undefined,
  showAlias: params.get('name') === 'alias',
});
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('leaderboard', [panel]);
