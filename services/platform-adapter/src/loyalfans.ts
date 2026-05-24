import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import {
  PlatformAdapter,
  AdapterCredentials,
  PlatformProfile,
  PlatformSubscription,
  PayoutRecord,
  PlatformContent,
  PlatformMetrics,
  WebhookPayload,
  SyncResult,
  PlatformError,
} from './interfaces.js';
import { PlatformAdapterConfig } from './config.js';

const CHECK_ID = 'loyalfans';

export class LoyalFansAdapter implements PlatformAdapter {
  readonly platform = CHECK_ID;
  private client: AxiosInstance | null = null;
  private config: PlatformAdapterConfig;
  private credentials: AdapterCredentials | null = null;

  constructor(config: PlatformAdapterConfig) {
    this.config = config;
  }

  async initialize(credentials: AdapterCredentials): Promise<void> {
    this.credentials = credentials;

    const baseConfig: AxiosRequestConfig = {
      baseURL: this.config.loyalfans.baseUrl,
      timeout: this.config.loyalfans.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LoyalFans-Adapter/1.0',
      },
    };

    this.client = axios.create(baseConfig);

    this.client.interceptors.request.use((config) => {
      config.headers['Authorization'] = `Bearer ${this.credentials?.accessToken || ''}`;
      return config;
    });
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const response = await this.client?.get('/api/v1/auth/validate');
      return response?.status === 200;
    } catch {
      return false;
    }
  }

  async getProfile(platformUserId: string): Promise<PlatformProfile> {
    const response = await this.client?.get(`/api/v1/creators/${platformUserId}`);
    const data = response?.data?.creator || response?.data;

    return {
      id: `loyalfans:${data.id}`,
      platformUserId: data.id.toString(),
      username: data.username,
      displayName: data.displayName || data.stageName,
      email: data.email,
      avatarUrl: data.avatar || data.profilePicture,
      bio: data.bio || data.about,
      verifiedAt: data.verifiedAt || data.identityVerifiedAt,
      metadata: { followerCount: data.followerCount, subscriberCount: data.subscriberCount },
    };
  }

  async getSubscriptions(creatorId: string, page = 1, limit = 50): Promise<PlatformSubscription[]> {
    const response = await this.client?.get(`/api/v1/creators/${creatorId}/subscribers`, {
      params: { page, limit },
    });

    return (response?.data?.subscribers || []).map((sub: Record<string, unknown>) => ({
      id: `loyalfans:sub:${sub.id}`,
      subscriberId: sub.userId?.toString() || '',
      creatorId,
      tier: sub.tier as string | undefined,
      status: (sub.status as PlatformSubscription['status']) || 'active',
      startDate: (sub.subscribedAt || sub.createdAt) as string,
      endDate: sub.expiresAt as string | undefined,
      autoRenew: (sub.autoRenew as boolean) || false,
      amount: sub.price as number | undefined,
      currency: (sub.currency as string) || 'USD',
    }));
  }

  async getPayouts(creatorId: string, page = 1, limit = 50): Promise<PayoutRecord[]> {
    const response = await this.client?.get(`/api/v1/creators/${creatorId}/payouts`, {
      params: { page, limit },
    });

    return (response?.data?.payouts || []).map((p: Record<string, unknown>) => ({
      id: `loyalfans:payout:${p.id}`,
      creatorId,
      amount: p.amount as number,
      currency: (p.currency as string) || 'USD',
      status: (p.status as PayoutRecord['status']) || 'pending',
      periodStart: p.periodStart as string,
      periodEnd: p.periodEnd as string,
      processedAt: p.processedAt as string | undefined,
      transactionId: p.transactionId as string | undefined,
    }));
  }

  async getContent(creatorId: string, page = 1, limit = 50): Promise<PlatformContent[]> {
    const response = await this.client?.get(`/api/v1/creators/${creatorId}/media`, {
      params: { page, limit },
    });

    return (response?.data?.media || []).map((c: Record<string, unknown>) => ({
      id: `loyalfans:content:${c.id}`,
      creatorId,
      type: (c.type as PlatformContent['type']) || 'photo',
      title: c.title || '',
      description: c.description as string | undefined,
      isPremium: (c.isPremium as boolean) || false,
      price: c.price as number | undefined,
      createdAt: c.createdAt as string,
      updatedAt: c.updatedAt as string,
      metadata: { views: c.viewCount, likes: c.likeCount },
    }));
  }

  async getMetrics(creatorId: string, periodStart: string, periodEnd: string): Promise<PlatformMetrics> {
    const response = await this.client?.get(`/api/v1/creators/${creatorId}/analytics`, {
      params: { from: periodStart, to: periodEnd },
    });

    const data = response?.data || {};
    return {
      creatorId,
      totalSubscribers: data.totalSubscribers || 0,
      activeSubscribers: data.activeSubscribers || 0,
      totalContent: data.totalMedia || 0,
      totalEarnings: data.totalEarnings || 0,
      subscriptionRevenue: data.subscriptionRevenue || 0,
      tipsRevenue: data.tipsRevenue || 0,
      payPerViewRevenue: data.ppvRevenue || 0,
      periodStart,
      periodEnd,
    };
  }

  async syncAll(creatorId: string): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const errors: PlatformError[] = [];
    let profilesSynced = 0;
    let subscriptionsSynced = 0;
    let payoutsSynced = 0;
    let contentSynced = 0;

    try {
      await this.getProfile(creatorId);
      profilesSynced++;
    } catch (err) {
      errors.push({ code: 'PROFILE_SYNC_FAILED', message: (err as Error).message, statusCode: 500, retryable: true });
    }

    try {
      const subs = await this.getSubscriptions(creatorId);
      subscriptionsSynced = subs.length;
    } catch (err) {
      errors.push({ code: 'SUBSCRIPTION_SYNC_FAILED', message: (err as Error).message, statusCode: 500, retryable: true });
    }

    try {
      const payouts = await this.getPayouts(creatorId);
      payoutsSynced = payouts.length;
    } catch (err) {
      errors.push({ code: 'PAYOUT_SYNC_FAILED', message: (err as Error).message, statusCode: 500, retryable: true });
    }

    try {
      const content = await this.getContent(creatorId);
      contentSynced = content.length;
    } catch (err) {
      errors.push({ code: 'CONTENT_SYNC_FAILED', message: (err as Error).message, statusCode: 500, retryable: true });
    }

    return {
      platform: CHECK_ID,
      profilesSynced,
      subscriptionsSynced,
      payoutsSynced,
      contentSynced,
      errors,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const expectedSig = crypto
      .createHmac('sha256', this.credentials?.webhookSecret || '')
      .update(JSON.stringify(payload.data))
      .digest('hex');

    if (payload.signature && payload.signature !== expectedSig) {
      throw new Error('Invalid webhook signature');
    }

    switch (payload.event) {
      case 'subscription.created':
      case 'subscription.canceled':
      case 'subscription.renewed':
      case 'media.uploaded':
      case 'payout.sent':
      case 'tip.sent':
        break;
      default:
        console.warn(`[${CHECK_ID}] Unhandled webhook event: ${payload.event}`);
    }
  }
}
