import type { AdminMessageType, AdminPayload } from '@tiklive/contracts';
import { describe, expect, it } from 'vitest';
import type { AdminNotifier } from '../ports/admin-notifier.js';
import { meterNotifier } from './metered-notifier.js';
import { MetricsRegistry } from './metrics-registry.js';

describe('MetricsRegistry', () => {
  it('renders counters with sorted, escaped labels', () => {
    const registry = new MetricsRegistry();
    const received = registry.counter('events_received_total', 'Accepted events');
    received.inc({ type: 'gift' });
    received.inc({ type: 'gift' }, 2);
    received.inc({ type: 'say "hi"\n' });

    const text = registry.render();

    expect(text).toContain('# TYPE events_received_total counter');
    expect(text).toContain('events_received_total{type="gift"} 3');
    expect(text).toContain('events_received_total{type="say \\"hi\\"\\n"} 1');
  });

  it('reads gauges at scrape time', () => {
    const registry = new MetricsRegistry();
    let depth = 1;
    registry.gauge('action_queue_depth', 'Queue', () => [
      { labels: { screen: 'audio' }, value: depth },
    ]);
    expect(registry.render()).toContain('action_queue_depth{screen="audio"} 1');
    depth = 4;
    expect(registry.render()).toContain('action_queue_depth{screen="audio"} 4');
  });

  it('renders cumulative histogram buckets, sum and count', () => {
    const registry = new MetricsRegistry();
    const h = registry.histogram('action_latency_ms', 'Latency', [100, 1000]);
    for (const v of [50, 500, 5000]) h.observe(v, { type: 'speak' });

    const text = registry.render();

    expect(text).toContain('action_latency_ms_bucket{le="100",type="speak"} 1');
    expect(text).toContain('action_latency_ms_bucket{le="1000",type="speak"} 2');
    expect(text).toContain('action_latency_ms_bucket{le="+Inf",type="speak"} 3');
    expect(text).toContain('action_latency_ms_sum{type="speak"} 5550');
    expect(text).toContain('action_latency_ms_count{type="speak"} 3');
  });

  it('rejects registering the same name twice', () => {
    const registry = new MetricsRegistry();
    registry.counter('x_total', 'x');
    expect(() => registry.counter('x_total', 'x')).toThrow(/already registered/);
  });
});

describe('meterNotifier', () => {
  it('counts events, rule results and reconnects, and still forwards everything', () => {
    const registry = new MetricsRegistry();
    const forwarded: string[] = [];
    const inner: AdminNotifier = { publish: (type) => void forwarded.push(type) };
    const state = { current: 'idle' };
    const notifier = meterNotifier(inner, registry, state);
    const publish = <T extends AdminMessageType>(type: T, payload: unknown) =>
      notifier.publish(type, payload as AdminPayload<T>);

    publish('event.received', { type: 'gift' });
    publish('rule.executed', { ruleId: 3, eventId: 'e', result: 'limited' });
    publish('connector.status', { state: 'reconnecting', attempt: 1 });
    publish('connector.status', { state: 'reconnecting', attempt: 2 });
    publish('connector.status', { state: 'connected', attempt: 0 });
    publish('connector.status', { state: 'reconnecting', attempt: 1 });

    const text = registry.render();
    expect(text).toContain('events_received_total{type="gift"} 1');
    expect(text).toContain('rule_executions_total{result="limited",ruleId="3"} 1');
    expect(text).toContain('connector_reconnects_total 2');
    expect(state.current).toBe('reconnecting');
    expect(forwarded).toHaveLength(6);
  });
});
