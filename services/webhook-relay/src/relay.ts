import { randomUUID, createHmac } from 'node:crypto';
import { loadConfig, type RetryPolicy } from './config.js';

const config = loadConfig();

export type DeliveryStatus = 'pending' | 'delivering' | 'delivered' | 'failed' | 'expired';

export interface WebhookEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  retryPolicy: RetryPolicy;
  active: boolean;
  createdAt: string;
}

export interface DeliveryAttempt {
  id: string;
  subscriptionId: string;
  eventId: string;
  status: DeliveryStatus;
  attemptNumber: number;
  statusCode?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  nextRetryAt?: string;
}

export interface WebhookDeliveryReport {
  subscription: WebhookSubscription;
  event: WebhookEvent;
  attempts: DeliveryAttempt[];
  status: DeliveryStatus;
}

export class WebhookRelay {
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private deliveries: Map<string, DeliveryAttempt[]> = new Map();
  private events: Map<string, WebhookEvent> = new Map();
  private activeDeliveries = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, config.cleanupIntervalMs);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  registerSubscription(url: string, events: string[], secret: string): WebhookSubscription {
    const subscription: WebhookSubscription = {
      id: randomUUID(),
      url,
      events,
      secret,
      retryPolicy: { ...config.retryPolicy },
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  updateSubscription(
    id: string,
    updates: Partial<Pick<WebhookSubscription, 'url' | 'events' | 'secret' | 'active'>>,
  ): WebhookSubscription {
    const sub = this.subscriptions.get(id);
    if (!sub) {
      throw new Error(`Subscription not found: ${id}`);
    }
    Object.assign(sub, updates);
    return sub;
  }

  removeSubscription(id: string): void {
    this.subscriptions.delete(id);
  }

  getSubscription(id: string): WebhookSubscription | undefined {
    return this.subscriptions.get(id);
  }

  listSubscriptions(): WebhookSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  async emitEvent(type: string, payload: unknown): Promise<string> {
    const event: WebhookEvent = {
      id: randomUUID(),
      type,
      payload,
      createdAt: new Date().toISOString(),
    };
    this.events.set(event.id, event);

    const matchingSubs = this.subscriptions.filter(
      (sub) => sub.active && (sub.events.includes('*') || sub.events.includes(type)),
    );

    for (const sub of matchingSubs) {
      this.enqueueDelivery(sub, event);
    }

    return event.id;
  }

  private enqueueDelivery(
    subscription: WebhookSubscription,
    event: WebhookEvent,
  ): void {
    const attempt: DeliveryAttempt = {
      id: randomUUID(),
      subscriptionId: subscription.id,
      eventId: event.id,
      status: 'pending',
      attemptNumber: 0,
    };

    const existing = this.deliveries.get(event.id) || [];
    existing.push(attempt);
    this.deliveries.set(event.id, existing);

    this.processDelivery(subscription, event, attempt).catch((err) => {
      console.error(`Delivery failed for event ${event.id}:`, err);
    });
  }

  private async processDelivery(
    subscription: WebhookSubscription,
    event: WebhookEvent,
    attempt: DeliveryAttempt,
  ): Promise<void> {
    if (this.activeDeliveries >= config.maxConcurrentDeliveries) {
      setTimeout(() => {
        this.processDelivery(subscription, event, attempt);
      }, 100);
      return;
    }

    this.activeDeliveries++;
    attempt.status = 'delivering';
    attempt.attemptNumber++;
    attempt.startedAt = new Date().toISOString();

    try {
      const signature = this.signPayload(subscription.secret, event.payload);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), subscription.retryPolicy.timeoutMs);

      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Id': event.id,
          'X-Webhook-Type': event.type,
          'X-Webhook-Attempt': String(attempt.attemptNumber),
          [config.signatureHeader]: signature,
        },
        body: JSON.stringify(event.payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      attempt.statusCode = response.status;

      if (response.ok) {
        attempt.status = 'delivered';
        attempt.completedAt = new Date().toISOString();
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      attempt.error = message;
      attempt.status = 'failed';

      if (attempt.attemptNumber < subscription.retryPolicy.maxRetries) {
        const delay = this.calculateBackoff(
          attempt.attemptNumber,
          subscription.retryPolicy,
        );
        attempt.nextRetryAt = new Date(Date.now() + delay).toISOString();

        setTimeout(() => {
          this.processDelivery(subscription, event, attempt);
        }, delay);
      } else {
        attempt.completedAt = new Date().toISOString();
      }
    } finally {
      this.activeDeliveries--;
    }
  }

  private calculateBackoff(attemptNumber: number, policy: RetryPolicy): number {
    switch (policy.strategy) {
      case 'exponential_backoff': {
        const delay = policy.baseDelayMs * Math.pow(2, attemptNumber - 1);
        return Math.min(delay, policy.maxDelayMs);
      }
      case 'linear': {
        const delay = policy.baseDelayMs * attemptNumber;
        return Math.min(delay, policy.maxDelayMs);
      }
      case 'fixed':
      default:
        return Math.min(policy.baseDelayMs, policy.maxDelayMs);
    }
  }

  private signPayload(secret: string, payload: unknown): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  getDeliveryReport(eventId: string): WebhookDeliveryReport | undefined {
    const event = this.events.get(eventId);
    if (!event) return undefined;

    const attempts = this.deliveries.get(eventId) || [];
    const subscriptionId = attempts[0]?.subscriptionId;
    const subscription = subscriptionId ? this.subscriptions.get(subscriptionId) : undefined;

    const latestAttempt = attempts[attempts.length - 1];

    return {
      subscription: subscription || {
        id: 'unknown',
        url: '',
        events: [],
        secret: '',
        retryPolicy: config.retryPolicy,
        active: false,
        createdAt: '',
      },
      event,
      attempts,
      status: latestAttempt?.status || 'pending',
    };
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, delivery] of this.deliveries) {
      const latestAttempt = delivery[delivery.length - 1];
      if (
        latestAttempt &&
        latestAttempt.completedAt &&
        now - new Date(latestAttempt.completedAt).getTime() > config.maxEventAgeMs
      ) {
        this.deliveries.delete(id);
        this.events.delete(id);
      }
    }
  }

  getQueueStats(): { activeDeliveries: number; pendingEvents: number; subscriptions: number } {
    return {
      activeDeliveries: this.activeDeliveries,
      pendingEvents: this.events.size,
      subscriptions: this.subscriptions.size,
    };
  }
}

export const relay = new WebhookRelay();
