import type { WasmModuleDeployedEvent } from '../event_types.js';
import type { EventHandler } from '../event_bus.js';

export type WasmEvent = WasmModuleDeployedEvent;

const wasmHandlers: Record<string, EventHandler<WasmEvent>> = {
  'wasm:module:deployed': async (event: WasmModuleDeployedEvent) => {
    const { moduleId, name, version, size, checksum, permissions } = event.payload;
    console.log(`[WasmHandler] Module ${name}@${version} (${moduleId}) deployed: ${size} bytes, checksum=${checksum.slice(0, 16)}..., perms=${permissions.join(',')}`);
  },
};

export function getWasmHandler(type: string): EventHandler<WasmEvent> | undefined {
  return wasmHandlers[type];
}

export function getWasmHandlerTypes(): string[] {
  return Object.keys(wasmHandlers);
}

export const handleWasmEvent: EventHandler<WasmEvent> = async (event) => {
  const handler = wasmHandlers[event.type];
  if (handler) {
    await handler(event);
  }
};
