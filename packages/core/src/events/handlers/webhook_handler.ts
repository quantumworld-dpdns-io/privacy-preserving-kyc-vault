import type { WebhookDispatchedEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type WebhookEvent = WebhookDispatchedEvent;

const webhookHandlers: Record<string, EventHandler<WebhookEvent>> = {
  'webhook:dispatched': async (event: WebhookDispatchedEvent) => {
    const { webhookId, url, eventType, statusCode, duration, retryCount, success } = event.payload;
    if (!success) {
      console.error(`[WebhookHandler] Failed dispatch ${webhookId} to ${url} (event: ${eventType}) after ${retryCount} retries: HTTP ${statusCode} in ${duration}ms`);
    } else {
      console.log(`[WebhookHandler] Dispatched ${webhookId} to ${url}: HTTP ${statusCode} in ${duration}ms`);
    }
  },
};

export function getWebhookHandler(type: string): EventHandler<WebhookEvent> | undefined {
  return webhookHandlers[type];
}

export function getWebhookHandlerTypes(): string[] {
  return Object.keys(webhookHandlers);
}

export const handleWebhookEvent: EventHandler<WebhookEvent> = async (event) => {
  const handler = webhookHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
