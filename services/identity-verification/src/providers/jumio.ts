import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { VerificationProvider, VerificationRequest, VerificationResult, ProviderHealth } from '../index.js';

export interface JumioConfig {
  apiToken: string;
  apiSecret: string;
  baseUrl?: string;
  timeout?: number;
  callbackUrl?: string;
}

export interface JumioTransaction {
  timestamp: string;
  transactionReference: string;
  verificationStatus: 'APPROVED' | 'DENIED' | 'ERROR' | 'PENDING';
  confidence: number;
  details: Record<string, unknown>;
}

const CHECK_ID = 'jumio';

export class JumioProvider implements VerificationProvider {
  readonly name = CHECK_ID;
  private client: AxiosInstance;

  constructor(config: JumioConfig) {
    const baseConfig: AxiosRequestConfig = {
      baseURL: config.baseUrl || 'https://netverify.com/api/v1',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username: config.apiToken,
        password: config.apiSecret,
      },
    };

    this.client = axios.create(baseConfig);
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const idempotencyKey = crypto.randomUUID();

    const response = await this.client.post(
      '/initiate',
      {
        customerId: request.userId,
        merchantIdScanReference: `verify-${request.userId}-${Date.now()}`,
        callbackUrl: this.client.defaults.baseURL ? undefined : undefined,
        presetCountry: request.nationality || undefined,
        idType: 'PASSPORT',
        enableIdentityVerification: request.requireIdentityVerification,
        enableAddressVerification: request.requireAddressVerification,
      },
      {
        headers: {
          'X-Idempotency-Key': idempotencyKey,
          'User-Agent': 'Jumio-Adapter/1.0',
        },
      },
    );

    const data = response.data as JumioTransaction;

    return {
      id: data.transactionReference,
      provider: CHECK_ID,
      status: data.verificationStatus === 'APPROVED' ? 'completed' : 'pending',
      verified: data.verificationStatus === 'APPROVED',
      score: data.confidence / 100,
      details: {
        transactionReference: data.transactionReference,
        verificationStatus: data.verificationStatus,
        jumioDetails: data.details,
      },
      timestamp: data.timestamp,
    };
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.client.get('/ping');
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
}
