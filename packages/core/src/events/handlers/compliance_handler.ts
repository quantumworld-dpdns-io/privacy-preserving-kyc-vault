import type { ComplianceRuleViolatedEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type ComplianceEvent = ComplianceRuleViolatedEvent;

const complianceHandlers: Record<string, EventHandler<ComplianceEvent>> = {
  'compliance:rule_violated': async (event: ComplianceRuleViolatedEvent) => {
    const { violationId, ruleName, severity, resourceType, resourceId, autoRemediated } = event.payload;
    const level = severity === 'critical' || severity === 'high' ? console.error : console.warn;
    level(`[ComplianceHandler] Rule violation ${violationId}: ${ruleName} [${severity}] on ${resourceType}:${resourceId} (auto-remediated: ${autoRemediated})`);
  },
};

export function getComplianceHandler(type: string): EventHandler<ComplianceEvent> | undefined {
  return complianceHandlers[type];
}

export function getComplianceHandlerTypes(): string[] {
  return Object.keys(complianceHandlers);
}

export const handleComplianceEvent: EventHandler<ComplianceEvent> = async (event) => {
  const handler = complianceHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
