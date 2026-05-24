export interface KYCWorkflow {
  id: string;
  applicantId: string;
  status: 'pending' | 'verified' | 'rejected' | 'pending_review' | 'failed';
  fraudScore: number;
  createdAt: string;
  updatedAt: string;
  workflowVersion: number;
}

export interface CredentialSummary {
  id: string;
  type: string[];
  issuer: string;
  subject: string;
  valid: boolean;
  issuedAt: string;
  expiresAt?: string;
}

export interface ComplianceStatus {
  jurisdiction: string;
  lastAuditDate: string;
  regulatoryVersion: string;
  requirements: string[];
}

export interface FraudReport {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  signals: string[];
  timestamp: string;
}

interface ListWorkflowsOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

interface ListCredentialsOptions {
  limit?: number;
  offset?: number;
}

class KYCClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl = 'http://localhost:3000', token = '') {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`KYC API error: ${err.error}`);
    }
    return res.json();
  }

  async listWorkflows(options: ListWorkflowsOptions = {}): Promise<KYCWorkflow[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    return this.request(`/workflows?${params}`);
  }

  async getWorkflow(id: string): Promise<KYCWorkflow> {
    return this.request(`/workflows/${id}`);
  }

  async listCredentials(options: ListCredentialsOptions = {}): Promise<CredentialSummary[]> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    return this.request(`/credentials?${params}`);
  }

  async verifyCredential(credentialId: string): Promise<{ valid: boolean; checks: Record<string, boolean> }> {
    return this.request('/verify', {
      method: 'POST',
      body: JSON.stringify({ credentialId }),
    });
  }

  async getComplianceStatus(): Promise<ComplianceStatus> {
    return this.request('/compliance');
  }

  async getFraudReport(workflowId: string): Promise<FraudReport> {
    return this.request(`/workflows/${workflowId}/fraud`);
  }

  async resolveDID(did: string): Promise<{ id: string; verificationMethod: any[] }> {
    return this.request('/did/resolve', {
      method: 'POST',
      body: JSON.stringify({ did }),
    });
  }
}

export const kycClient = new KYCClient(
  process.env.NEXT_PUBLIC_KYC_VAULT_URL || 'http://localhost:3000',
  process.env.KYC_VAULT_TOKEN || ''
);
