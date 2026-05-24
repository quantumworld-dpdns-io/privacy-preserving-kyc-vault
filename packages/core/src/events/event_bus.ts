import type { EventType, EventSeverity, BaseEvent } from './event_types.js';

export type EventHandler<E extends EventType = EventType> = (event: E) => void | Promise<void>;
export type EventFilter = (event: EventType) => boolean;

export interface Subscription {
  id: string;
  handler: EventHandler;
  filter?: EventFilter;
  once?: boolean;
}

export interface EventBusStats {
  subscribers: number;
  eventsProcessed: number;
  eventsDropped: number;
  handlersByType: Record<string, number>;
  uptime: number;
}

export class EventBus {
  private handlers: Map<string, Set<Subscription>> = new Map();
  private wildcardHandlers: Set<Subscription> = new Set();
  private eventsProcessed = 0;
  private eventsDropped = 0;
  private startedAt = Date.now();
  private scheduler: (fn: () => void) => void = (fn) => setTimeout(fn, 0);

  setScheduler(scheduler: (fn: () => void) => void): void {
    this.scheduler = scheduler;
  }

  subscribe<E extends EventType>(
    type: E['type'],
    handler: EventHandler<E>,
    options?: { filter?: EventFilter; once?: boolean },
  ): () => void {
    const sub: Subscription = {
      id: crypto.randomUUID(),
      handler: handler as EventHandler,
      filter: options?.filter,
      once: options?.once,
    };
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(sub);
    return () => this.unsubscribe(type, sub.id);
  }

  subscribeAll(handler: EventHandler, filter?: EventFilter): () => void {
    const sub: Subscription = {
      id: crypto.randomUUID(),
      handler,
      filter,
    };
    this.wildcardHandlers.add(sub);
    return () => this.wildcardHandlers.delete(sub);
  }

  private unsubscribe(type: string, id: string): void {
    const subs = this.handlers.get(type);
    if (!subs) return;
    for (const sub of subs) {
      if (sub.id === id) {
        subs.delete(sub);
        break;
      }
    }
    if (subs.size === 0) {
      this.handlers.delete(type);
    }
  }

  async emit(event: EventType): Promise<void> {
    const promises: Promise<void>[] = [];
    const scheduled: (() => void)[] = [];

    const baseEvent = event as unknown as BaseEvent & { type: string };
    const subs = this.handlers.get(baseEvent.type);
    if (subs) {
      for (const sub of subs) {
        if (sub.filter && !sub.filter(event as unknown as EventType)) continue;
        if (sub.once) {
          subs.delete(sub);
        }
        const invoke = (): void => {
          try {
            const result = sub.handler(event as unknown as EventType);
            if (result instanceof Promise) {
              promises.push(result);
            }
          } catch {
            this.eventsDropped++;
          }
        };
        scheduled.push(invoke);
      }
    }

    for (const sub of this.wildcardHandlers) {
      if (sub.filter && !sub.filter(event as unknown as EventType)) continue;
      const invoke = (): void => {
        try {
          const result = sub.handler(event as unknown as EventType);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch {
          this.eventsDropped++;
        }
      };
      scheduled.push(invoke);
    }

    if (subs && subs.size === 0) {
      this.handlers.delete(baseEvent.type);
    }

    for (const fn of scheduled) {
      this.scheduler(fn);
    }

    this.eventsProcessed++;
    await Promise.allSettled(promises);
  }

  emitSync(event: EventType): void {
    const baseEvent = event as unknown as BaseEvent & { type: string };
    const subs = this.handlers.get(baseEvent.type);
    if (subs) {
      for (const sub of subs) {
        if (sub.filter && !sub.filter(event as unknown as EventType)) continue;
        if (sub.once) subs.delete(sub);
        try {
          sub.handler(event as unknown as EventType);
        } catch {
          this.eventsDropped++;
        }
      }
      if (subs.size === 0) this.handlers.delete(baseEvent.type);
    }
    for (const sub of this.wildcardHandlers) {
      if (sub.filter && !sub.filter(event as unknown as EventType)) continue;
      try {
        sub.handler(event as unknown as EventType);
      } catch {
        this.eventsDropped++;
      }
    }
    this.eventsProcessed++;
  }

  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }

  stats(): EventBusStats {
    const handlersByType: Record<string, number> = {};
    for (const [type, subs] of this.handlers) {
      handlersByType[type] = subs.size;
    }
    return {
      subscribers: [...this.handlers.values()].reduce((a, s) => a + s.size, 0) + this.wildcardHandlers.size,
      eventsProcessed: this.eventsProcessed,
      eventsDropped: this.eventsDropped,
      handlersByType,
      uptime: Date.now() - this.startedAt,
    };
  }
}

const globalBus = new EventBus();
export function getGlobalBus(): EventBus {
  return globalBus;
}
