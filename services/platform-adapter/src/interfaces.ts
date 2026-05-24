export interface PlatformProfile {
  id: string;
  platformUserId: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  verifiedAt?: string;
  metadata: Record<string, unknown>;
}

export interface PlatformSubscription {
  id: string;
  subscriberId: string;
  creatorId: string;
  tier?: string;
  status: 'active' | 'canceled' | 'expired' | 'pending';
  startDate: string;
  endDate?: string;
  autoRenew: boolean;
  amount?: number;
  currency?: string;
}

export interface PayoutRecord {
  id: string;
  creatorId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processed' | 'failed' | 'reversed';
  periodStart: string;
  periodEnd: string;
  processedAt?: string;
  transactionId?: string;
}

export interface PlatformContent {
  id: string;
  creatorId: string;
  type: 'photo' | 'video' | 'audio' | 'text' | 'stream';
  title: string;
  description?: string;
  isPremium: boolean;
  price?: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface PlatformMetrics {
  creatorId: string;
  totalSubscribers: number;
  activeSubscribers: number;
  totalContent: number;
  totalEarnings: number;
  subscriptionRevenue: number;
  tipsRevenue: number;
  payPerViewRevenue: number;
  periodStart: string;
  periodEnd: string;
}

export interface AdapterCredentials {
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  username?: string;
  password?: string;
  webhookSecret?: string;
}

export interface PlatformConfig {
  baseUrl: string;
  apiVersion: string;
  timeout: number;
  retryCount: number;
  rateLimitPerSecond: number;
  enabled: boolean;
  sandboxMode: boolean;
}

export interface WebhookPayload {
  event: string;
  platform: string;
  timestamp: string;
  signature?: string;
  data: Record<string, unknown>;
}

export interface PlatformError {
  code: string;
  message: string;
  statusCode: number;
  platformError?: string;
  retryable: boolean;
}

export interface SyncResult {
  platform: string;
  profilesSynced: number;
  subscriptionsSynced: number;
  payoutsSynced: number;
  contentSynced: number;
  errors: PlatformError[];
  startedAt: string;
  completedAt: string;
}

export interface PlatformAdapter {
  readonly platform: string;
  initialize(credentials: AdapterCredentials): Promise<void>;
  validateCredentials(): Promise<boolean>;
  getProfile(platformUserId: string): Promise<PlatformProfile>;
  getSubscriptions(creatorId: string, page?: number, limit?: number): Promise<PlatformSubscription[]>;
  getPayouts(creatorId: string, page?: number, limit?: number): Promise<PayoutRecord[]>;
  getContent(creatorId: string, page?: number, limit?: number): Promise<PlatformContent[]>;
  getMetrics(creatorId: string, periodStart: string, periodEnd: string): Promise<PlatformMetrics>;
  syncAll(creatorId: string): Promise<SyncResult>;
  handleWebhook(payload: WebhookPayload): Promise<void>;
}
