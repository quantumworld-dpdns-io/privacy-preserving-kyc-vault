import type { TEEAttestationVerifiedEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type TEEEvent = TEEAttestationVerifiedEvent;

const teeHandlers: Record<string, EventHandler<TEEEvent>> = {
  'tee:attestation:verified': async (event: TEEAttestationVerifiedEvent) => {
    const { attestationId, enclaveId, verified, tcbStatus, quoteType, platform } = event.payload;
    console.log(`[TEEHandler] Attestation ${attestationId} for enclave ${enclaveId}: verified=${verified}, tcb=${tcbStatus}, quote=${quoteType}, platform=${platform}`);
  },
};

export function getTEEHandler(type: string): EventHandler<TEEEvent> | undefined {
  return teeHandlers[type];
}

export function getTEEHandlerTypes(): string[] {
  return Object.keys(teeHandlers);
}

export const handleTEEEvent: EventHandler<TEEEvent> = async (event) => {
  const handler = teeHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
