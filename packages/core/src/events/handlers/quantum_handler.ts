import type { QuantumKeyGeneratedEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type QuantumEvent = QuantumKeyGeneratedEvent;

const quantumHandlers: Record<string, EventHandler<QuantumEvent>> = {
  'quantum:key_generated': async (event: QuantumKeyGeneratedEvent) => {
    const { keyId, algorithm, keyLength, entropySource, generationTime } = event.payload;
    console.log(`[QuantumHandler] Key ${keyId} generated: ${algorithm}/${keyLength} from ${entropySource} in ${generationTime}ms`);
  },
};

export function getQuantumHandler(type: string): EventHandler<QuantumEvent> | undefined {
  return quantumHandlers[type];
}

export function getQuantumHandlerTypes(): string[] {
  return Object.keys(quantumHandlers);
}

export const handleQuantumEvent: EventHandler<QuantumEvent> = async (event) => {
  const handler = quantumHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
