import { KYCError, ErrorCode, toKYCError } from "./errors";

export interface ClientConfig {
  baseUrl: string;
  apiKey?: string;
  jwtToken?: string;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime: number;
  services: Record<string, "healthy" | "unhealthy">;
}

export class KYCVaultClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly jwtToken?: string;
  private readonly timeout: number;
  private readonly retryCount: number;
  private readonly retryDelay: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.jwtToken = config.jwtToken;
    this.timeout = config.timeout ?? 30_000;
    this.retryCount = config.retryCount ?? 3;
    this.retryDelay = config.retryDelay ?? 1_000;
    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...config.headers,
    };
  }

  setJWT(token: string): void {
    (this as Record<string, unknown>).jwtToken = token;
  }

  clearAuth(): void {
    (this as Record<string, unknown>).apiKey = undefined;
    (this as Record<string, unknown>).jwtToken = undefined;
  }

  async health(): Promise<HealthStatus> {
    return this.get<HealthStatus>("/health");
  }

  // Credential endpoints

  async issueCredential(
    issuerDid: string,
    subjectDid: string,
    claims: Record<string, unknown>,
    options?: {
      expirationDate?: string;
      credentialType?: string[];
      proofPurpose?: string;
    },
  ): Promise<CredentialResponse> {
    return this.post<CredentialResponse>("/v1/credentials/issue", {
      issuerDid,
      subjectDid,
      claims,
      ...options,
    });
  }

  async verifyCredential(
    credential: VerifiableCredential,
    options?: {
      proof?: Proof;
      challenge?: string;
      domain?: string;
    },
  ): Promise<VerificationResult> {
    return this.post<VerificationResult>("/v1/credentials/verify", {
      credential,
      ...options,
    });
  }

  async getCredential(id: string): Promise<VerifiableCredential> {
    return this.get<VerifiableCredential>(`/v1/credentials/${encodeURIComponent(id)}`);
  }

  async revokeCredential(
    id: string,
    reason?: string,
  ): Promise<RevocationResult> {
    return this.post<RevocationResult>(`/v1/credentials/${encodeURIComponent(id)}/revoke`, {
      reason,
    });
  }

  async checkCredentialStatus(id: string): Promise<CredentialStatusInfo> {
    return this.get<CredentialStatusInfo>(
      `/v1/credentials/${encodeURIComponent(id)}/status`,
    );
  }

  async listCredentials(
    params?: {
      page?: number;
      pageSize?: number;
      subjectDid?: string;
      issuerDid?: string;
      status?: "valid" | "expired" | "revoked";
    },
  ): Promise<PaginatedResponse<VerifiableCredential>> {
    return this.get<PaginatedResponse<VerifiableCredential>>(
      "/v1/credentials",
      params as Record<string, string>,
    );
  }

  // Presentation endpoints

  async createPresentation(
    credentials: VerifiableCredential[],
    holderDid: string,
    options?: { challenge?: string; domain?: string },
  ): Promise<VerifiablePresentation> {
    return this.post<VerifiablePresentation>("/v1/presentations/create", {
      credentials,
      holderDid,
      ...options,
    });
  }

  async verifyPresentation(
    presentation: VerifiablePresentation,
    options?: { challenge?: string; domain?: string },
  ): Promise<VerificationResult> {
    return this.post<VerificationResult>("/v1/presentations/verify", {
      presentation,
      ...options,
    });
  }

  // DID endpoints

  async resolveDID(did: string): Promise<DIDDocument> {
    return this.get<DIDDocument>(`/v1/did/${encodeURIComponent(did)}`);
  }

  async createDID(
    method: string,
    options?: {
      keyType?: string;
      network?: string;
      services?: ServiceEndpoint[];
    },
  ): Promise<DIDDocument> {
    return this.post<DIDDocument>("/v1/did/create", {
      method,
      ...options,
    });
  }

  async rotateKey(
    did: string,
    keyId: string,
    options?: { keyType?: string },
  ): Promise<DIDDocument> {
    return this.post<DIDDocument>(
      `/v1/did/${encodeURIComponent(did)}/rotate`,
      { keyId, ...options },
    );
  }

  async deactivateDID(did: string): Promise<void> {
    await this.post(`/v1/did/${encodeURIComponent(did)}/deactivate`, {});
  }

  // Workflow endpoints

  async createWorkflow(
    workflowType: string,
    subjectId: string,
    config: Record<string, unknown>,
  ): Promise<WorkflowResponse> {
    return this.post<WorkflowResponse>("/v1/workflows", {
      workflowType,
      subjectId,
      config,
    });
  }

  async getWorkflow(id: string): Promise<WorkflowResponse> {
    return this.get<WorkflowResponse>(`/v1/workflows/${encodeURIComponent(id)}`);
  }

  async listWorkflows(
    params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      subjectId?: string;
    },
  ): Promise<PaginatedResponse<WorkflowResponse>> {
    return this.get<PaginatedResponse<WorkflowResponse>>(
      "/v1/workflows",
      params as Record<string, string>,
    );
  }

  // Compliance endpoints

  async checkCompliance(
    subjectId: string,
    tier: string,
    attributes?: Record<string, unknown>,
  ): Promise<ComplianceResult> {
    return this.post<ComplianceResult>("/v1/compliance/check", {
      subjectId,
      tier,
      attributes,
    });
  }

  async getComplianceReport(subjectId: string): Promise<ComplianceReport> {
    return this.get<ComplianceReport>(
      `/v1/compliance/${encodeURIComponent(subjectId)}/report`,
    );
  }

  // Private HTTP methods with retry logic

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const headers = this.buildHeaders();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const responseBody = await response.json().catch(() => ({}));
          throw KYCError.fromHttpResponse(response.status, responseBody);
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof KYCError && error.statusCode < 500) {
          throw error;
        }

        if (attempt < this.retryCount) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ? toKYCError(lastError) : new KYCError("Request failed", ErrorCode.UNKNOWN);
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...this.defaultHeaders };

    if (this.jwtToken) {
      headers["Authorization"] = `Bearer ${this.jwtToken}`;
    } else if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    return headers;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Type definitions

export interface VerifiableCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;
    [key: string]: unknown;
  };
  credentialStatus?: {
    id: string;
    type: string;
    revocationListIndex?: number;
    revocationListCredential?: string;
  };
  proof?: Proof;
}

export interface Proof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue?: string;
  jws?: string;
  nonce?: string;
  domain?: string;
}

export interface VerifiablePresentation {
  "@context": string[];
  id?: string;
  type: string[];
  holder?: string;
  verifiableCredential: VerifiableCredential[];
  proof?: Proof;
}

export interface CredentialResponse {
  credential: VerifiableCredential;
  status: "issued" | "pending";
}

export interface VerificationResult {
  verified: boolean;
  checks: VerificationCheck[];
  warnings?: string[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message?: string;
}

export interface RevocationResult {
  revoked: boolean;
  timestamp: string;
  revokedBy: string;
}

export interface CredentialStatusInfo {
  id: string;
  status: "valid" | "expired" | "revoked" | "suspended";
  updatedAt: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface DIDDocument {
  "@context": string[];
  id: string;
  controller?: string[];
  alsoKnownAs?: string[];
  verificationMethod: DIDVerificationMethod[];
  authentication: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: ServiceEndpoint[];
  created?: string;
  updated?: string;
}

export interface DIDVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
  blockchainAccountId?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string | string[];
  description?: string;
}

export interface WorkflowResponse {
  id: string;
  workflowType: string;
  subjectId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  config: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface ComplianceResult {
  compliant: boolean;
  tier: string;
  checks: ComplianceCheck[];
  validUntil?: string;
}

export interface ComplianceCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface ComplianceReport {
  subjectId: string;
  overallStatus: "compliant" | "non_compliant" | "pending_review";
  tiers: Record<string, ComplianceResult>;
  generatedAt: string;
}
