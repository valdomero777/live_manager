import { RotatorConfigSchema, type RotatorConfig, type RotatorPanel } from '@tiklive/contracts';
import { startDataOverlay } from '../core/data-overlay.js';
import { readCommonParams } from '../core/params.js';
import { GoalPanel } from '../panels/goal.js';
import { LeaderboardPanel } from '../panels/leaderboard.js';
import type { OverlayPanel } from '../panels/panel.js';
import { StatsPanel } from '../panels/stats.js';

const ROTATOR_ID = /^[a-z0-9_-]{1,32}$/;
const RETRY_MS = 5_000;

const stage = document.querySelector<HTMLElement>('#stage');

function createPanel(config: RotatorPanel): OverlayPanel {
  switch (config.type) {
    case 'leaderboard':
      return new LeaderboardPanel({ ...config, showAlias: false });
    case 'goal':
      return new GoalPanel(config.goalId, true);
    case 'stats':
      return new StatsPanel(config.fields, 'column');
  }
}

async function loadConfig(id: string, key: string): Promise<RotatorConfig> {
  const res = await fetch(`/overlay-data/rotators/${id}?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return RotatorConfigSchema.parse(await res.json());
}

/**
 * One URL cycling several panels (RF-17): a single WebSocket and a single DOM tree; switching
 * only toggles a CSS class, so the page never reloads (spec 11).
 */
function rotate(config: RotatorConfig, panels: readonly OverlayPanel[]): void {
  let index = 0;
  const show = () => {
    panels.forEach((p, i) => p.element.classList.toggle('rotator__panel--active', i === index));
    const duration = config.panels[index]?.durationMs ?? 10_000;
    index = (index + 1) % panels.length;
    if (panels.length > 1) window.setTimeout(show, duration);
  };
  show();
}

async function start(): Promise<void> {
  const params = readCommonParams();
  const raw = new URLSearchParams(location.search).get('config') ?? 'main';
  const id = ROTATOR_ID.test(raw) ? raw : 'main';
  const config = await loadConfig(id, params.key);
  stage?.setAttribute('data-transition', config.transition);
  const panels = config.panels.map(createPanel);
  for (const panel of panels) {
    panel.element.classList.add('rotator__panel');
    stage?.append(panel.element);
  }
  startDataOverlay('rotator', panels);
  rotate(config, panels);
}

function startWithRetry(): void {
  start().catch((error: unknown) => {
    console.warn('[tiklive] rotator config failed, retrying', error);
    window.setTimeout(startWithRetry, RETRY_MS);
  });
}

startWithRetry();
