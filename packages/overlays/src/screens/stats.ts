import { STATS_FIELDS, type StatsField } from '@tiklive/contracts';
import { startDataOverlay } from '../core/data-overlay.js';
import { readChoice } from '../core/params.js';
import { StatsPanel } from '../panels/stats.js';

const DEFAULT_FIELDS: readonly StatsField[] = ['viewers', 'likes', 'diamonds'];

/** ?fields=viewers,likes,duration — unknown names are ignored; empty falls back to defaults. */
function readFields(): readonly StatsField[] {
  const raw = new URLSearchParams(location.search).get('fields');
  const fields = (raw ?? '')
    .split(',')
    .map((f) => STATS_FIELDS.find((known) => known === f.trim()))
    .filter((f): f is StatsField => f !== undefined);
  return fields.length > 0 ? fields : DEFAULT_FIELDS;
}

const panel = new StatsPanel(readFields(), readChoice('layout', ['row', 'column'] as const, 'row'));
document.querySelector('#stage')?.append(panel.element);
startDataOverlay('stats', [panel]);
