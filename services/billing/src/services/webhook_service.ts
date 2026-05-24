import { randomUUID, createHmac } from 'node:crypto';
import { WebhookEvent, WebhookSubscription, WebhookRetryPolicy } from '../types/index.js';

interface DeliveryAttempt {
  attempt: number;
  timestamp: string;
  statusCode: number;
  durationMs: number;
  error?: string;
}

interface PendingDelivery {
  event: WebhookEvent;
  subscription: WebhookSubscription;
  attempts: number;
  nextAttemptAt: number;
  deliveryHistory: DeliveryAttempt[];
}

const DEFAULT_RETRY_POLICY: WebhookRetryPolicy = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffFactor: 2,
};

export class WebhookService {
  private subscriptions = new Map<string, WebhookSubscription>();
  private pendingDeliveries = new Map<string, PendingDelivery>();
  private deliveryTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startDeliveryLoop();
  }

  private startDeliveryLoop(): void {
    this.deliveryTimer = setInterval(() => {
      this.processPendingDeliveries();
    }, 1000);
    this.deliveryTimer.unref();
  }

  destroy(): void {
    if (this.deliveryTimer) {
      clearInterval(this.deliveryTimer);
      this.deliveryTimer = null;
    }
  }

  async createSubscription(
    url: string,
    events: string[],
    secret?: string,
    retryPolicy?: Partial<WebhookRetryPolicy>,
  ): Promise<WebhookSubscription> {
    const id = randomUUID();
    const subscription: WebhookSubscription = {
      id,
      url,
      events,
      secret: secret || randomUUID(),
      retryPolicy: { ...DEFAULT_RETRY_POLICY, ...retryPolicy },
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async updateSubscription(id: string, updates: Partial<WebhookSubscription>): Promise<WebhookSubscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) {
      throw new Object.assign(new Error(`Subscription not found: ${id}`), { statusCode: 404 });
    }

    const updated: WebhookSubscription = {
      ...sub,
      ...updates,
      id: sub.id,
      createdAt: sub.createdAt,
      updatedAt: new Date().toISOString(),
    };

    this.subscriptions.set(id, updated);
    return updated;
  }

  async deleteSubscription(id: string): Promise<void> {
    if (!this.subscriptions.has(id)) {
      throw new Object.assign(new Error(`Subscription not found: ${id}`), { statusCode: 404 });
    }
    this.subscriptions.delete(id);
  }

  async getSubscription(id: string): Promise<WebhookSubscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) {
      throw new Object.assign(new Error(`Subscription not found: ${id}`), { statusCode: 404 });
    }
    return sub;
  }

  async listSubscriptions(): Promise<WebhookSubscription[]> {
    return Array.from(this.subscriptions.values());
  }

  async emitEvent(eventType: string, source: string, subject: string, data: Record<string, unknown>): Promise<void> {
    const event: WebhookEvent = {
      eventId: randomUUID(),
      eventType,
      timestamp: new Date().toISOString(),
      source,
      subject,
      data,
    };

    const matchingSubscriptions = Array.from(this.subscriptions.values())
      .filter((s) => s.enabled && (s.events.includes('*') || s.events.includes(eventType)));

    for (const sub of matchingSubscriptions) {
      const pendingKey = `${sub.id}:${event.eventId}`;
      const pending: PendingDelivery = {
        event,
        subscription: sub,
        attempts: 0,
        nextAttemptAt: Date.now(),
        deliveryHistory: [],
      };
      this.pendingDeliveries.set(pendingKey, pending);
    }
  }

  private async processPendingDeliveries(): Promise<void> {
    const now = Date.now();
    const ready = Array.from(this.pendingDeliveries.entries())
      .filter(([, d]) => d.nextAttemptAt <= now);

    for (const [key, delivery] of ready) {
      this.pendingDeliveries.delete(key);
      try {
        await this.deliver(delivery);
      } catch {
        delivery.attempts++;
        delivery.deliveryHistory.push({
          attempt: delivery.attempts,
          timestamp: new Date().toISOString(),
          statusCode: 0,
          durationMs: 0,
          error: 'Delivery failed',
        });

        if (delivery.attempts < delivery.subscription.retryPolicy.maxRetries) {
          const delay = Math.min(
            delivery.subscription.retryPolicy.baseDelayMs *
              Math.pow(delivery.subscription.retryPolicy.backoffFactor, delivery.attempts - 1),
            delivery.subscription.retryPolicy.maxDelayMs,
          );
          delivery.nextAttemptAt = Date.now() + delay;
          this.pendingDeliveries.set(key, delivery);
        }
      }
    }
  }

  private async deliver(delivery: PendingDelivery): Promise<void> {
    const payload = JSON.stringify({
      eventId: delivery.event.eventId,
      eventType: delivery.event.eventType,
      timestamp: delivery.event.timestamp,
      source: delivery.event.source,
      subject: delivery.event.subject,
      data: delivery.event.data,
    });

    const signature = createHmac('sha256', delivery.subscription.secret)
      .update(payload)
      .digest('hex');

    const startTime = Date.now();
    const response = await fetch(delivery.subscription.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-ID': delivery.subscription.id,
        'X-Webhook-Event': delivery.event.eventType,
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': delivery.event.timestamp,
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    const durationMs = Date.now() - startTime;
    delivery.deliveryHistory.push({
      attempt: delivery.attempts + 1,
      timestamp: new Date().toISOString(),
      statusCode: response.status,
      durationMs,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  async getDeliveryStatus(eventId: string): Promise<DeliveryAttempt[]> {
    const history: DeliveryAttempt[] = [];
    for (const delivery of this.pendingDeliveries.values()) {
      if (delivery.event.eventId === eventId) {
        history.push(...delivery.deliveryHistory);
      }
    }
    return history;
  }
}
