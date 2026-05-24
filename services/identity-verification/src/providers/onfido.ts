import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { VerificationProvider, VerificationRequest, VerificationResult, ProviderHealth } from '../index.js';

export interface OnfidoConfig {
  apiToken: string;
  baseUrl?: string;
  timeout?: number;
  webhookToken?: string;
}

export interface OnfidoApplicant {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  dob?: string;
  address?: Record<string, string>;
  createdAt: string;
}

export interface OnfidoCheck {
  id: string;
  applicantId: string;
  status: 'in_progress' | 'awaiting_applicant' | 'complete' | 'withdrawn' | 'paused';
  result?: 'clear' | 'consider' | 'unidentified';
  tags?: string[];
  createdAt: string;
  completedAt?: string;
}

const CHECK_ID = 'onfido';

export class OnfidoProvider implements VerificationProvider {
  readonly name = CHECK_ID;
  private client: AxiosInstance;

  constructor(config: OnfidoConfig) {
    const baseConfig: AxiosRequestConfig = {
      baseURL: config.baseUrl || 'https://api.onfido.com/v3',
      timeout: config.timeout || 30000,
      headers: {
        Authorization: `Token token=${config.apiToken}`,
        'Content-Type': 'application/json',
      },
    };

    this.client = axios.create(baseConfig);
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const applicant = await this.createApplicant(request);

    const check = await this.submitCheck(applicant.id, request);

    const result = await this.pollCheckResult(check.id);

    return {
      id: result.id,
      provider: CHECK_ID,
      status: result.status === 'complete' ? 'completed' : 'pending',
      verified: result.result === 'clear',
      score: result.result === 'clear' ? 1.0 : result.result === 'consider' ? 0.5 : 0.0,
      details: {
        applicantId: applicant.id,
        checkId: result.id,
        onfidoResult: result.result,
        reportBreakdown: result.tags,
      },
      timestamp: new Date().toISOString(),
    };
  }

  async health(): Promise<ProviderHealth> {
    try {
      const response = await this.client.get('/webhooks/ping');
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

  private async createApplicant(request: VerificationRequest): Promise<OnfidoApplicant> {
    const response = await this.client.post('/applicants', {
      first_name: request.firstName,
      last_name: request.lastName,
      email: request.email,
      dob: request.dateOfBirth,
      address: request.address
        ? {
            building_number: request.address.street,
            street: request.address.street,
            town: request.address.city,
            postcode: request.address.postalCode,
            country: request.address.country,
          }
        : undefined,
    });

    return response.data;
  }

  private async submitCheck(applicantId: string, request: VerificationRequest): Promise<OnfidoCheck> {
    const reportNames: string[] = ['document', 'facial_similarity'];

    if (request.requireIdentityVerification) {
      reportNames.push('identity');
    }

    if (request.requireAddressVerification) {
      reportNames.push('address');
    }

    const response = await this.client.post('/checks', {
      applicant_id: applicantId,
      report_names: reportNames,
      tags: [`userId:${request.userId}`, `sessionId:${request.sessionId || 'none'}`],
    });

    return response.data;
  }

  private async pollCheckResult(checkId: string, maxAttempts = 30, intervalMs = 2000): Promise<OnfidoCheck> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.client.get(`/checks/${checkId}`);
      const check: OnfidoCheck = response.data;

      if (check.status === 'complete' || check.status === 'withdrawn') {
        return check;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Onfido check timed out');
  }
}
