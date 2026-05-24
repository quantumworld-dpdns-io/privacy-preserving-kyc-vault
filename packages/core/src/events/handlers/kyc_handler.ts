import type {
  KYCWorkflowStartedEvent,
  KYCWorkflowCompletedEvent,
  KYCWorkflowUpdatedEvent,
  KYCDocumentUploadedEvent,
  KYCDocumentVerifiedEvent,
} from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type KYCEvent =
  | KYCWorkflowStartedEvent
  | KYCWorkflowCompletedEvent
  | KYCWorkflowUpdatedEvent
  | KYCDocumentUploadedEvent
  | KYCDocumentVerifiedEvent;

const kycHandlers: Record<string, EventHandler<KYCEvent>> = {
  'kyc:workflow:started': async (event: KYCWorkflowStartedEvent) => {
    const { workflowId, userId, workflowType, riskLevel } = event.payload;
    console.log(`[KYCHandler] Workflow ${workflowId} started for ${userId}: ${workflowType} (risk: ${riskLevel})`);
  },
  'kyc:workflow:completed': async (event: KYCWorkflowCompletedEvent) => {
    const { workflowId, userId, outcome, processingTime } = event.payload;
    console.log(`[KYCHandler] Workflow ${workflowId} completed for ${userId}: ${outcome} in ${processingTime}ms`);
  },
  'kyc:workflow:updated': async (event: KYCWorkflowUpdatedEvent) => {
    const { workflowId, previousStatus, newStatus, updatedBy } = event.payload;
    console.log(`[KYCHandler] Workflow ${workflowId} updated: ${previousStatus} -> ${newStatus} by ${updatedBy}`);
  },
  'kyc:document:uploaded': async (event: KYCDocumentUploadedEvent) => {
    const { documentId, workflowId, documentType, fileSize } = event.payload;
    console.log(`[KYCHandler] Document ${documentId} uploaded to ${workflowId}: ${documentType} (${fileSize} bytes)`);
  },
  'kyc:document:verified': async (event: KYCDocumentVerifiedEvent) => {
    const { documentId, verified, verificationScore, verifiedBy } = event.payload;
    console.log(`[KYCHandler] Document ${documentId} verified by ${verifiedBy}: ${verified} (score: ${verificationScore})`);
  },
};

export function getKYCHandler(type: string): EventHandler<KYCEvent> | undefined {
  return kycHandlers[type];
}

export function getKYCHandlerTypes(): string[] {
  return Object.keys(kycHandlers);
}

export const handleKYCEvent: EventHandler<KYCEvent> = async (event) => {
  const handler = kycHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
