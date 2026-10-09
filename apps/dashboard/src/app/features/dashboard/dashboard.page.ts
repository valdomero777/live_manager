import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideActivity,
  LucideArrowRight,
  LucideCircleAlert,
  LucideCrown,
  LucideDynamicIcon,
  LucideEye,
  LucideGem,
  LucideGift,
  LucideHeart,
  LucideSparkles,
  LucideUserPlus,
  LucideWorkflow,
} from '@lucide/angular';
import type { StatsSnapshot } from '@tiklive/contracts';
import { ActivityChart, ACTIVITY_SERIES } from '../../components/analytics/activity-chart';
import { AnalyticsCard } from '../../components/analytics/analytics-card';
import { ChartContainer } from '../../components/analytics/chart-container';
import { MetricCard, formatMetric } from '../../components/analytics/metric-card';
import { LiveSessionCard } from '../../components/dashboard/live-session-card';
import { RecentAutomations } from '../../components/dashboard/recent-automations';
import { EventFeed } from '../../components/live/event-feed';
import { activityPerMinute, toFeedItem } from '../../components/live/event-format';
import { PageHeader } from '../../components/shared/page-header';
import { UI_ALERT } from '../../components/ui/alert';
import { UiButton } from '../../components/ui/button';
import { AdminSocketService } from '../../core/admin-socket.service';
import { ApiClient } from '../../core/api-client';
import { RulesStore } from '../../core/rules.store';
import { EVENT_LABELS } from '../../lib/labels';

const STATS_POLL_MS = 5_000;
const CLOCK_MS = 15_000;
const FEED_ITEMS = 60;
const CHART_MINUTES = 15;

/**
 * Operational overview during a LIVE: connection, the numbers that matter, what is happening
 * right now and what the automations did about it. Only real data from /stats and /ws/admin.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    PageHeader,
    LiveSessionCard,
    MetricCard,
    AnalyticsCard,
    ChartContainer,
    ActivityChart,
    EventFeed,
    RecentAutomations,
    UiButton,
    ...UI_ALERT,
    LucideArrowRight,
    LucideCircleAlert,
    LucideDynamicIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  templateUrl: './dashboard.page.html',
})
export class DashboardPage {
  private readonly api = inject(ApiClient);
  protected readonly socket = inject(AdminSocketService);
  protected readonly rules = inject(RulesStore);

  protected readonly icons = {
    viewers: LucideEye,
    likes: LucideHeart,
    diamonds: LucideGem,
    followers: LucideUserPlus,
    activity: LucideActivity,
    workflow: LucideWorkflow,
    gift: LucideGift,
    crown: LucideCrown,
    sparkles: LucideSparkles,
  };
  protected readonly eventLabels = EVENT_LABELS;
  protected readonly chartSeries = ACTIVITY_SERIES;
  protected readonly formatMetric = formatMetric;

  protected readonly stats = signal<StatsSnapshot | undefined>(undefined);
  protected readonly statsLoading = signal(true);
  protected readonly statsError = signal(false);
  protected readonly now = signal(Date.now());

  /** Stats describe the current session; without one there is nothing to show yet. */
  protected readonly hasSession = computed(() => this.stats()?.sessionId != null);
  protected readonly feed = computed(() =>
    this.socket.events().slice(0, FEED_ITEMS).map(toFeedItem),
  );
  protected readonly activity = computed(() =>
    activityPerMinute(this.socket.events(), this.now(), CHART_MINUTES),
  );
  protected readonly quietChart = computed(() =>
    this.activity().every((b) => b.gifts + b.likes + b.comments + b.social === 0),
  );

  /** A /stats request is in flight: the next tick waits instead of racing it. */
  private statsInFlight = false;

  constructor() {
    void this.loadStats();
    void this.rules.load().catch(() => undefined);
    // Hidden tabs neither poll nor redraw; coming back refreshes at once.
    const poll = setInterval(() => {
      if (!document.hidden) void this.loadStats();
    }, STATS_POLL_MS);
    const clock = setInterval(() => {
      if (!document.hidden) this.now.set(Date.now());
    }, CLOCK_MS);
    const onVisible = () => {
      if (!document.hidden) void this.loadStats();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  protected metric(value: number | undefined): number | null {
    return this.hasSession() && value !== undefined ? value : null;
  }

  private async loadStats(): Promise<void> {
    if (this.statsInFlight) return;
    this.statsInFlight = true;
    try {
      this.stats.set(await this.api.get<StatsSnapshot>('/stats'));
      this.statsError.set(false);
    } catch {
      this.statsError.set(true);
    } finally {
      this.statsInFlight = false;
      this.statsLoading.set(false);
      this.now.set(Date.now());
    }
  }
}
