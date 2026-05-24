export type HexString = string;
export type Base64UrlString = string;
export type UnixTimestampMs = number;
export type ISO8601String = string;
export type UUID = string;
export type DID = string;
export type CID = string;

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  cursor?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: ISO8601String;
  requestId?: string;
}

export interface ApiError {
  success: false;
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: unknown[];
  timestamp: ISO8601String;
  requestId?: string;
}

export type CredentialStatus = 'active' | 'revoked' | 'expired' | 'suspended';

export interface CredentialSubject {
  id: DID;
  [key: string]: unknown;
}

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: DID;
  issuanceDate: ISO8601String;
  expirationDate?: ISO8601String;
  credentialSubject: CredentialSubject;
  credentialStatus?: {
    id: string;
    type: string;
  };
  proof?: Proof;
}

export interface Proof {
  type: string;
  created: ISO8601String;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
  [key: string]: unknown;
}

export interface DIDDocument {
  '@context': string[] | string;
  id: DID;
  alsoKnownAs?: string[];
  controller?: DID | DID[];
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  capabilityInvocation?: (string | VerificationMethod)[];
  capabilityDelegation?: (string | VerificationMethod)[];
  service?: DIDService[];
  created?: ISO8601String;
  updated?: ISO8601String;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: DID;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}

export interface DIDService {
  id: string;
  type: string;
  serviceEndpoint: string | string[];
}

export type KYCWorkflowState =
  | 'Initiated'
  | 'DocumentSubmission'
  | 'VerificationInProgress'
  | 'ManualReview'
  | 'Escalated'
  | 'Approved'
  | 'Rejected'
  | 'Expired';

export type KYCTier = 'basic' | 'enhanced' | 'enterprise';

export interface KYCWorkflow {
  id: string;
  subjectDid: DID;
  tier: KYCTier;
  platformId: string;
  state: KYCWorkflowState;
  documents: KYCDocument[];
  reviews: KYCReview[];
  history: KYCWorkflowEvent[];
  riskScore?: number;
  assignedAnalyst?: string;
  createdAt: ISO8601String;
  updatedAt?: ISO8601String;
  completedAt?: ISO8601String;
}

export interface KYCDocument {
  id: string;
  type: string;
  fileName: string;
  mimeType: string;
  storageRef: string;
  checksum: string;
  verified: boolean;
  verificationResult?: Record<string, unknown>;
  uploadedAt: ISO8601String;
}

export interface KYCReview {
  id: string;
  reviewer: string;
  decision: 'approve' | 'reject' | 'escalate' | 'request_info';
  reason: string;
  createdAt: ISO8601String;
}

export interface KYCWorkflowEvent {
  eventType: string;
  timestamp: ISO8601String;
  actor: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface ZKPProofRequest {
  circuitId: string;
  inputs: Record<string, unknown>;
  publicSignals?: string[];
}

export interface ZKPProof {
  proofId: string;
  circuitId: string;
  proof: unknown;
  publicInputs: Record<string, unknown>;
  publicOutputs: Record<string, unknown>;
  created: ISO8601String;
}

export interface AuditLogEntry {
  auditId: UUID;
  chainHash: HexString;
  previousHash: HexString;
  timestamp: ISO8601String;
  action: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actorId: string;
  actorType: string;
  resourceType: string;
  resourceId?: string;
  ip: string;
  userAgent: string;
  success: boolean;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookEvent {
  eventId: UUID;
  eventType: string;
  timestamp: ISO8601String;
  source: string;
  subject: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface WebhookSubscription {
  id: UUID;
  url: string;
  events: string[];
  secret: string;
  retryPolicy: WebhookRetryPolicy;
  enabled: boolean;
  createdAt: ISO8601String;
  updatedAt: ISO8601String;
}

export interface WebhookRetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

export interface BillingTier {
  id: string;
  name: string;
  monthlyPrice: string;
  verifications: number;
  apiCallsPerMonth: number;
  storageGb: number;
  features: string[];
}

export interface UsageRecord {
  recordId: UUID;
  customerId: UUID;
  meterName: string;
  quantity: number;
  timestamp: ISO8601String;
  billedAmount: string;
}

export interface Invoice {
  invoiceId: string;
  customerId: UUID;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  periodStart: ISO8601String;
  periodEnd: ISO8601String;
  lineItems: InvoiceLineItem[];
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  dueDate: ISO8601String;
  paidAt?: ISO8601String;
  pdfUrl?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

export interface NotificationEvent {
  id: UUID;
  type: string;
  channel: 'webhook' | 'email' | 'sms' | 'push';
  recipient: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  attempts: number;
  createdAt: ISO8601String;
  sentAt?: ISO8601String;
}

export interface AnalyticsQuery {
  metric: string;
  dimension?: string;
  from: ISO8601String;
  to: ISO8601String;
  granularity: 'hour' | 'day' | 'week' | 'month';
  filters?: Record<string, string>;
}

export interface AnalyticsDataPoint {
  timestamp: ISO8601String;
  value: number;
  label?: string;
}
