import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { VerificationProvider, VerificationRequest, VerificationResult, ProviderHealth } from '../index.js';

export interface YotiConfig {
  sdkId: string;
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  scenarioId?: string;
}

export interface YotiSession {
  id: string;
  status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
  userId: string;
  clientSessionTokenTtl: number;
  createdAt: string;
}

export interface YotiCheckResult {
  id: string;
  type: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  result: 'APPROVED' | 'REJECTED' | 'NOT_APPLICABLE';
  details: Record<string, unknown>;
}

const CHECK_ID = 'yoti';

export class YotiProvider implements VerificationProvider {
  readonly name = CHECK_ID;
  private client: AxiosInstance;
  private config: YotiConfig;

  constructor(config: YotiConfig) {
    this.config = config;
    const baseConfig: AxiosRequestConfig = {
      baseURL: config.baseUrl || 'https://api.yoti.com/idverify/v1',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Yoti-Auth-Id': config.sdkId,
        'X-Yoti-Auth-Key': config.apiKey,
      },
    };

    this.client = axios.create(baseConfig);

    this.client.interceptors.request.use((config) => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const digest = crypto
        .createHmac('sha256', this.config.apiKey)
        .update(timestamp + (config.data ? JSON.stringify(config.data) : ''))
        .digest('base64');

      config.headers['X-Yoti-Timestamp'] = timestamp;
      config.headers['X-Yoti-Digest'] = digest;

      return config;
    });
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const session = await this.createSession(request);
    const checks = await this.getSessionChecks(session.id);

    const ageCheck = checks.find((c) => c.type === 'AGE_VERIFICATION');
    const identityCheck = checks.find((c) => c.type === 'IDENTITY_PROFILE');

    const ageVerified = ageCheck?.result === 'APPROVED';
    const identityVerified = identityCheck?.result === 'APPROVED';

    return {
      id: session.id,
      provider: CHECK_ID,
      status: session.status === 'COMPLETED' ? 'completed' : 'pending',
      verified: ageVerified && (!request.requireIdentityVerification || identityVerified),
      score: ageVerified ? 1.0 : 0.0,
      details: {
        sessionId: session.id,
        ageCheck: ageCheck?.result,
        identityCheck: identityCheck?.result,
        checks,
      },
      timestamp: session.createdAt,
    };
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.client.get('/sessions');
      return {
        provider: CHECK_ID,
        status: response.status === 200 ? 'healthy' : 'degraded',
        latency: 0,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        provider: CHECK_ID,
        status: 'unhealthy',
        latency: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async createSession(request: VerificationRequest): Promise<YotiSession> {
    const response = await this.client.post('/sessions', {
      user_id: request.userId,
      scenario_id: this.config.scenarioId || 'age_verification',
      client_session_token_ttl: 600,
      requested_checks: ['AGE_VERIFICATION', ...(request.requireIdentityVerification ? ['IDENTITY_PROFILE'] : [])],
      user_tracking_id: request.sessionId || undefined,
    });

    return response.data;
  }

  private async getSessionChecks(sessionId: string): Promise<YotiCheckResult[]> {
    const response = await this.client.get(`/sessions/${sessionId}/checks`);
    return response.data?.checks || [];
  }
}
