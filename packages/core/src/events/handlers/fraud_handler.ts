import type { FraudAlertTriggeredEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type FraudEvent = FraudAlertTriggeredEvent;

const fraudHandlers: Record<string, EventHandler<FraudEvent>> = {
  'fraud:alert:triggered': async (event: FraudAlertTriggeredEvent) => {
    const { alertId, riskScore, indicators, entityId, entityType, action, modelVersion } = event.payload;
    console.error(`[FraudHandler] Alert ${alertId}: risk ${riskScore} on ${entityType}:${entityId} -> ${action} (model: ${modelVersion}, indicators: ${indicators.join(', ')})`);
  },
};

export function getFraudHandler(type: string): EventHandler<FraudEvent> | undefined {
  return fraudHandlers[type];
}

export function getFraudHandlerTypes(): string[] {
  return Object.keys(fraudHandlers);
}

export const handleFraudEvent: EventHandler<FraudEvent> = async (event) => {
  const handler = fraudHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
