import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { VerificationProvider, VerificationRequest, VerificationResult, ProviderHealth } from '../index.js';

export interface MitekConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl?: string;
  timeout?: number;
  workflowId?: string;
}

export interface MitekTransaction {
  id: string;
  status: 'completed' | 'failed' | 'pending' | 'review';
  decision: 'accept' | 'reject' | 'review' | 'unknown';
  confidenceScore: number;
  details: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

const CHECK_ID = 'mitek';

export class MitekProvider implements VerificationProvider {
  readonly name = CHECK_ID;
  private client: AxiosInstance;
  private config: MitekConfig;

  constructor(config: MitekConfig) {
    this.config = config;
    const baseConfig: AxiosRequestConfig = {
      baseURL: config.baseUrl || 'https://api.mitek.com/verify/v1',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
        'X-Api-Secret': config.apiSecret,
      },
    };

    this.client = axios.create(baseConfig);
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const payload: Record<string, unknown> = {
      firstName: request.firstName,
      lastName: request.lastName,
      dateOfBirth: request.dateOfBirth,
      email: request.email,
      workflowId: this.config.workflowId || 'default-kyc',
      externalRef: `verify-${request.userId}`,
    };

    if (request.address) {
      payload.address = {
        street: request.address.street,
        city: request.address.city,
        state: request.address.state,
        postalCode: request.address.postalCode,
        country: request.address.country,
      };
    }

    const response = await this.client.post('/transactions', payload);
    const data = response.data as MitekTransaction;

    let result: MitekTransaction = data;
    if (data.status === 'pending') {
      result = await this.pollTransaction(data.id);
    }

    return {
      id: result.id,
      provider: CHECK_ID,
      status: result.status === 'completed' ? 'completed' : 'pending',
      verified: result.decision === 'accept',
      score: result.confidenceScore / 100,
      details: {
        transactionId: result.id,
        decision: result.decision,
        confidenceScore: result.confidenceScore,
        mitkDetails: result.details,
      },
      timestamp: result.completedAt || result.createdAt,
    };
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.client.get('/health');
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

  private async pollTransaction(transactionId: string, maxAttempts = 20, intervalMs = 3000): Promise<MitekTransaction> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.client.get(`/transactions/${transactionId}`);
      const tx: MitekTransaction = response.data;

      if (tx.status !== 'pending') {
        return tx;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Mitek transaction timed out');
  }
}
