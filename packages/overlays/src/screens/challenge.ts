import { startDataOverlay } from '../core/data-overlay.js';
import { readNumber } from '../core/params.js';
import { ChallengePanel } from '../panels/challenge.js';

const params = new URLSearchParams(location.search);
const panel = new ChallengePanel({
  goalId: readNumber('goalId', 1, 1, Number.MAX_SAFE_INTEGER),
  showNumbers: params.get('showNumbers') !== '0',
  reward: params.get('reward')?.slice(0, 100) ?? '',
});
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('challenge', [panel]);
