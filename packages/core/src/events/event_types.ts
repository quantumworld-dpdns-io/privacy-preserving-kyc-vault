export type EventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface BaseEvent {
  id: string;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
  tenantId?: string;
  userId?: string;
  severity: EventSeverity;
  metadata?: Record<string, unknown>;
}

export interface CredentialIssuedEvent extends BaseEvent {
  type: 'credential:issued';
  payload: {
    credentialId: string;
    holderDid: string;
    issuerDid: string;
    schemaId: string;
    expirationDate?: number;
    credentialType: string[];
  };
}

export interface CredentialRevokedEvent extends BaseEvent {
  type: 'credential:revoked';
  payload: {
    credentialId: string;
    revokedBy: string;
    reason: string;
    revocationRegistry?: string;
  };
}

export interface CredentialVerifiedEvent extends BaseEvent {
  type: 'credential:verified';
  payload: {
    credentialId: string;
    verifierDid: string;
    verified: boolean;
    verificationMethod: string;
    proofType: string;
    duration: number;
  };
}

export interface CredentialExpiredEvent extends BaseEvent {
  type: 'credential:expired';
  payload: {
    credentialId: string;
    holderDid: string;
    expiredAt: number;
    autoNotify: boolean;
  };
}

export interface CredentialSuspendedEvent extends BaseEvent {
  type: 'credential:suspended';
  payload: {
    credentialId: string;
    suspendedBy: string;
    reason: string;
    suspendedUntil?: number;
  };
}

export interface KYCWorkflowStartedEvent extends BaseEvent {
  type: 'kyc:workflow:started';
  payload: {
    workflowId: string;
    userId: string;
    workflowType: string;
    riskLevel: string;
    documentsRequired: string[];
  };
}

export interface KYCWorkflowCompletedEvent extends BaseEvent {
  type: 'kyc:workflow:completed';
  payload: {
    workflowId: string;
    userId: string;
    outcome: 'approved' | 'rejected' | 'pending_review';
    processingTime: number;
    reviewedBy?: string;
  };
}

export interface KYCWorkflowUpdatedEvent extends BaseEvent {
  type: 'kyc:workflow:updated';
  payload: {
    workflowId: string;
    userId: string;
    previousStatus: string;
    newStatus: string;
    updatedBy: string;
    changeReason?: string;
  };
}

export interface KYCDocumentUploadedEvent extends BaseEvent {
  type: 'kyc:document:uploaded';
  payload: {
    documentId: string;
    workflowId: string;
    userId: string;
    documentType: string;
    fileSize: number;
    checksum: string;
  };
}

export interface KYCDocumentVerifiedEvent extends BaseEvent {
  type: 'kyc:document:verified';
  payload: {
    documentId: string;
    workflowId: string;
    verified: boolean;
    verificationScore: number;
    authenticityFlags: string[];
    verifiedBy: string;
  };
}

export interface AuditLogCreatedEvent extends BaseEvent {
  type: 'audit:log:created';
  payload: {
    logId: string;
    action: string;
    actorId: string;
    resource: string;
    resourceId: string;
    changes: Record<string, unknown>;
    ipAddress: string;
    userAgent: string;
  };
}

export interface WebhookDispatchedEvent extends BaseEvent {
  type: 'webhook:dispatched';
  payload: {
    webhookId: string;
    url: string;
    eventType: string;
    statusCode: number;
    duration: number;
    retryCount: number;
    success: boolean;
  };
}

export interface NotificationSentEvent extends BaseEvent {
  type: 'notification:sent';
  payload: {
    notificationId: string;
    userId: string;
    channel: 'email' | 'sms' | 'push' | 'in_app';
    templateName: string;
    status: 'delivered' | 'failed' | 'pending';
    errorMessage?: string;
  };
}

export interface BillingInvoiceCreatedEvent extends BaseEvent {
  type: 'billing:invoice:created';
  payload: {
    invoiceId: string;
    tenantId: string;
    amount: number;
    currency: string;
    plan: string;
    billingPeriod: { start: number; end: number };
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
  };
}

export interface BillingPaymentProcessedEvent extends BaseEvent {
  type: 'billing:payment:processed';
  payload: {
    invoiceId: string;
    transactionId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    status: 'success' | 'failed' | 'refunded';
    gatewayResponse: string;
  };
}

export interface ComplianceRuleViolatedEvent extends BaseEvent {
  type: 'compliance:rule_violated';
  payload: {
    violationId: string;
    ruleId: string;
    ruleName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    resourceType: string;
    resourceId: string;
    details: Record<string, unknown>;
    autoRemediated: boolean;
  };
}

export interface FraudAlertTriggeredEvent extends BaseEvent {
  type: 'fraud:alert:triggered';
  payload: {
    alertId: string;
    riskScore: number;
    indicators: string[];
    entityId: string;
    entityType: 'user' | 'document' | 'credential' | 'device';
    action: 'block' | 'flag' | 'review';
    modelVersion: string;
  };
}

export interface AnalyticsEventTriggeredEvent extends BaseEvent {
  type: 'analytics:event:triggered';
  payload: {
    eventName: string;
    category: string;
    dimensions: Record<string, string>;
    metrics: Record<string, number>;
    sampled: boolean;
    sampleRate: number;
  };
}

export interface FLTrainingRoundEvent extends BaseEvent {
  type: 'fl:training_round';
  payload: {
    roundId: string;
    roundNumber: number;
    participants: number;
    modelVersion: string;
    accuracy: number;
    loss: number;
    duration: number;
    aggregationMethod: string;
  };
}

export interface QuantumKeyGeneratedEvent extends BaseEvent {
  type: 'quantum:key_generated';
  payload: {
    keyId: string;
    algorithm: string;
    keyLength: number;
    entropySource: string;
    generationTime: number;
  };
}

export interface PQCAttestationVerifiedEvent extends BaseEvent {
  type: 'pqc:attestation:verified';
  payload: {
    attestationId: string;
    moduleId: string;
    verified: boolean;
    securityLevel: string;
    signatureAlgorithm: string;
  };
}

export interface PQCKeyRotatedEvent extends BaseEvent {
  type: 'pqc:key_rotated';
  payload: {
    keyId: string;
    oldKeyId: string;
    algorithm: string;
    rotationReason: string;
    rotatedBy: string;
    effectiveAt: number;
  };
}

export interface WasmModuleDeployedEvent extends BaseEvent {
  type: 'wasm:module:deployed';
  payload: {
    moduleId: string;
    name: string;
    version: string;
    size: number;
    checksum: string;
    permissions: string[];
  };
}

export interface TEEAttestationVerifiedEvent extends BaseEvent {
  type: 'tee:attestation:verified';
  payload: {
    attestationId: string;
    enclaveId: string;
    verified: boolean;
    tcbStatus: string;
    quoteType: string;
    platform: string;
  };
}

export type EventType =
  | CredentialIssuedEvent
  | CredentialRevokedEvent
  | CredentialVerifiedEvent
  | CredentialExpiredEvent
  | CredentialSuspendedEvent
  | KYCWorkflowStartedEvent
  | KYCWorkflowCompletedEvent
  | KYCWorkflowUpdatedEvent
  | KYCDocumentUploadedEvent
  | KYCDocumentVerifiedEvent
  | AuditLogCreatedEvent
  | WebhookDispatchedEvent
  | NotificationSentEvent
  | BillingInvoiceCreatedEvent
  | BillingPaymentProcessedEvent
  | ComplianceRuleViolatedEvent
  | FraudAlertTriggeredEvent
  | AnalyticsEventTriggeredEvent
  | FLTrainingRoundEvent
  | QuantumKeyGeneratedEvent
  | PQCAttestationVerifiedEvent
  | PQCKeyRotatedEvent
  | WasmModuleDeployedEvent
  | TEEAttestationVerifiedEvent;
