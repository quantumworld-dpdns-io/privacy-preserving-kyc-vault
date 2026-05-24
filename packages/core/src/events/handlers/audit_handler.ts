import type { AuditLogCreatedEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type AuditEvent = AuditLogCreatedEvent;

const auditHandlers: Record<string, EventHandler<AuditEvent>> = {
  'audit:log:created': async (event: AuditLogCreatedEvent) => {
    const { logId, action, actorId, resource, resourceId, ipAddress } = event.payload;
    console.log(`[AuditHandler] Log ${logId}: ${action} on ${resource}:${resourceId} by ${actorId} from ${ipAddress}`);
  },
};

export function getAuditHandler(type: string): EventHandler<AuditEvent> | undefined {
  return auditHandlers[type];
}

export function getAuditHandlerTypes(): string[] {
  return Object.keys(auditHandlers);
}

export const handleAuditEvent: EventHandler<AuditEvent> = async (event) => {
  const handler = auditHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
