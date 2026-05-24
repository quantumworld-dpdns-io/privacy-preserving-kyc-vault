import type { FLTrainingRoundEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type FLEvent = FLTrainingRoundEvent;

const flHandlers: Record<string, EventHandler<FLEvent>> = {
  'fl:training_round': async (event: FLTrainingRoundEvent) => {
    const { roundNumber, participants, modelVersion, accuracy, loss, duration, aggregationMethod } = event.payload;
    console.log(`[FLHandler] Round ${roundNumber} complete: ${participants} participants, accuracy=${accuracy}, loss=${loss}, duration=${duration}ms (method: ${aggregationMethod}, model: ${modelVersion})`);
  },
};

export function getFLHandler(type: string): EventHandler<FLEvent> | undefined {
  return flHandlers[type];
}

export function getFLHandlerTypes(): string[] {
  return Object.keys(flHandlers);
}

export const handleFLEvent: EventHandler<FLEvent> = async (event) => {
  const handler = flHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
