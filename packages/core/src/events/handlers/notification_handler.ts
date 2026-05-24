import type { NotificationSentEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type NotificationEvent = NotificationSentEvent;

const notificationHandlers: Record<string, EventHandler<NotificationEvent>> = {
  'notification:sent': async (event: NotificationSentEvent) => {
    const { notificationId, userId, channel, templateName, status, errorMessage } = event.payload;
    if (status === 'failed') {
      console.error(`[NotificationHandler] Failed notification ${notificationId} to ${userId} via ${channel}: ${errorMessage}`);
    } else {
      console.log(`[NotificationHandler] Sent notification ${notificationId} to ${userId} via ${channel} (template: ${templateName}): ${status}`);
    }
  },
};

export function getNotificationHandler(type: string): EventHandler<NotificationEvent> | undefined {
  return notificationHandlers[type];
}

export function getNotificationHandlerTypes(): string[] {
  return Object.keys(notificationHandlers);
}

export const handleNotificationEvent: EventHandler<NotificationEvent> = async (event) => {
  const handler = notificationHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
