import type { AnalyticsEventTriggeredEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type AnalyticsEvent = AnalyticsEventTriggeredEvent;

const analyticsHandlers: Record<string, EventHandler<AnalyticsEvent>> = {
  'analytics:event:triggered': async (event: AnalyticsEventTriggeredEvent) => {
    const { eventName, category, dimensions, metrics, sampled } = event.payload;
    console.log(`[AnalyticsHandler] Event ${eventName} (${category}): dims=${JSON.stringify(dimensions)}, metrics=${JSON.stringify(metrics)}${sampled ? ' (sampled)' : ''}`);
  },
};

export function getAnalyticsHandler(type: string): EventHandler<AnalyticsEvent> | undefined {
  return analyticsHandlers[type];
}

export function getAnalyticsHandlerTypes(): string[] {
  return Object.keys(analyticsHandlers);
}

export const handleAnalyticsEvent: EventHandler<AnalyticsEvent> = async (event) => {
  const handler = analyticsHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
