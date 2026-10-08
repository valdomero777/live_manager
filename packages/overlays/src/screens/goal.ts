import { startDataOverlay } from '../core/data-overlay.js';
import { readNumber } from '../core/params.js';
import { GoalPanel } from '../panels/goal.js';

const params = new URLSearchParams(location.search);
const panel = new GoalPanel(
  readNumber('goalId', 1, 1, Number.MAX_SAFE_INTEGER),
  params.get('showNumbers') !== '0',
);
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('goal', [panel]);
