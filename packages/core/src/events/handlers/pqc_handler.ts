import type { PQCKeyRotatedEvent, PQCAttestationVerifiedEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type PQCEvent = PQCKeyRotatedEvent | PQCAttestationVerifiedEvent;

const pqcHandlers: Record<string, EventHandler<PQCEvent>> = {
  'pqc:attestation:verified': async (event: PQCAttestationVerifiedEvent) => {
    const { attestationId, moduleId, verified, securityLevel, signatureAlgorithm } = event.payload;
    console.log(`[PQCHandler] Attestation ${attestationId} for ${moduleId}: ${verified} (security: ${securityLevel}, sig: ${signatureAlgorithm})`);
  },
  'pqc:key_rotated': async (event: PQCKeyRotatedEvent) => {
    const { keyId, oldKeyId, algorithm, rotationReason, rotatedBy } = event.payload;
    console.log(`[PQCHandler] Key rotated ${oldKeyId} -> ${keyId} (${algorithm}): ${rotationReason} by ${rotatedBy}`);
  },
};

export function getPQCHandler(type: string): EventHandler<PQCEvent> | undefined {
  return pqcHandlers[type];
}

export function getPQCHandlerTypes(): string[] {
  return Object.keys(pqcHandlers);
}

export const handlePQCEvent: EventHandler<PQCEvent> = async (event) => {
  const handler = pqcHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
