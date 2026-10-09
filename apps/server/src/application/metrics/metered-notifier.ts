import type { AdminMessageType, AdminPayload } from '@tiklive/contracts';
import type { AdminNotifier } from '../ports/admin-notifier.js';
import type { MetricsRegistry } from './metrics-registry.js';

/**
 * Counts what already flows through the admin channel (accepted events, rule results, connector
 * state) and forwards it unchanged, so no other module needs to know about metrics.
 */
export function meterNotifier(
  inner: AdminNotifier,
  registry: MetricsRegistry,
  connectorState: { current: string },
): AdminNotifier {
  const received = registry.counter('events_received_total', 'Accepted events by type');
  const rules = registry.counter('rule_executions_total', 'Rule outcomes by rule and result');
  const reconnects = registry.counter(
    'connector_reconnects_total',
    'Times the connector entered the reconnecting state',
  );
  return {
    publish<T extends AdminMessageType>(type: T, payload: AdminPayload<T>): void {
      if (type === 'event.received') {
        received.inc({ type: (payload as AdminPayload<'event.received'>).type });
      } else if (type === 'rule.executed') {
        const { ruleId, result } = payload as AdminPayload<'rule.executed'>;
        rules.inc({ ruleId, result });
      } else if (type === 'connector.status') {
        const { state } = payload as AdminPayload<'connector.status'>;
        if (state === 'reconnecting' && connectorState.current !== 'reconnecting') reconnects.inc();
        connectorState.current = state;
      }
      inner.publish(type, payload);
    },
  };
}
