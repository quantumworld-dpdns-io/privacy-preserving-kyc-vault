export interface KVCMetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timing';
  help: string;
  unit?: string;
  labels?: string[];
}

export const KYC_METRICS: Record<string, KVCMetricDefinition> = {
  credential_issued_total: {
    name: 'credential_issued_total',
    type: 'counter',
    help: 'Total number of credentials issued',
    labels: ['credential_type', 'issuer'],
  },
  credential_revoked_total: {
    name: 'credential_revoked_total',
    type: 'counter',
    help: 'Total number of credentials revoked',
    labels: ['reason'],
  },
  credential_verification_duration: {
    name: 'credential_verification_duration',
    type: 'histogram',
    help: 'Duration of credential verification in milliseconds',
    unit: 'ms',
    labels: ['verification_method', 'result'],
  },
  kyc_workflow_duration: {
    name: 'kyc_workflow_duration',
    type: 'histogram',
    help: 'Duration of KYC workflow processing in milliseconds',
    unit: 'ms',
    labels: ['workflow_type', 'outcome'],
  },
  kyc_document_verification_score: {
    name: 'kyc_document_verification_score',
    type: 'gauge',
    help: 'Document verification score (0-100)',
    labels: ['document_type'],
  },
  kyc_workflow_active: {
    name: 'kyc_workflow_active',
    type: 'gauge',
    help: 'Number of currently active KYC workflows',
    labels: ['status'],
  },
  compliance_violations_total: {
    name: 'compliance_violations_total',
    type: 'counter',
    help: 'Total number of compliance rule violations',
    labels: ['rule_id', 'severity'],
  },
  fraud_alerts_total: {
    name: 'fraud_alerts_total',
    type: 'counter',
    help: 'Total number of fraud alerts triggered',
    labels: ['action', 'entity_type'],
  },
  fraud_risk_score: {
    name: 'fraud_risk_score',
    type: 'gauge',
    help: 'Current fraud risk score per entity',
    labels: ['entity_id', 'entity_type'],
  },
  webhook_dispatch_duration: {
    name: 'webhook_dispatch_duration',
    type: 'histogram',
    help: 'Duration of webhook dispatch in milliseconds',
    unit: 'ms',
    labels: ['status_code', 'retry'],
  },
  notification_sent_total: {
    name: 'notification_sent_total',
    type: 'counter',
    help: 'Total number of notifications sent',
    labels: ['channel', 'status'],
  },
  billing_invoice_total: {
    name: 'billing_invoice_total',
    type: 'counter',
    help: 'Total number of invoices created',
    labels: ['plan', 'currency'],
  },
  billing_revenue_total: {
    name: 'billing_revenue_total',
    type: 'counter',
    help: 'Total revenue collected',
    unit: 'usd',
    labels: ['plan', 'payment_method'],
  },
  fl_training_rounds_total: {
    name: 'fl_training_rounds_total',
    type: 'counter',
    help: 'Total federated learning training rounds',
    labels: ['model_version'],
  },
  fl_accuracy: {
    name: 'fl_accuracy',
    type: 'gauge',
    help: 'Current federated learning model accuracy',
    labels: ['model_version'],
  },
  quantum_key_generation_duration: {
    name: 'quantum_key_generation_duration',
    type: 'histogram',
    help: 'Duration of quantum key generation in milliseconds',
    unit: 'ms',
    labels: ['algorithm'],
  },
  pqc_attestation_total: {
    name: 'pqc_attestation_total',
    type: 'counter',
    help: 'Total PQC attestation verifications',
    labels: ['result'],
  },
  wasm_module_deploy_total: {
    name: 'wasm_module_deploy_total',
    type: 'counter',
    help: 'Total WASM modules deployed',
    labels: ['permissions_hash'],
  },
  tee_attestation_total: {
    name: 'tee_attestation_total',
    type: 'counter',
    help: 'Total TEE attestation verifications',
    labels: ['platform', 'result'],
  },
  api_request_duration: {
    name: 'api_request_duration',
    type: 'histogram',
    help: 'API request duration in milliseconds',
    unit: 'ms',
    labels: ['method', 'path', 'status_code'],
  },
  api_requests_total: {
    name: 'api_requests_total',
    type: 'counter',
    help: 'Total API requests',
    labels: ['method', 'path', 'status_code'],
  },
  cache_hit_ratio: {
    name: 'cache_hit_ratio',
    type: 'gauge',
    help: 'Cache hit ratio per tier',
    labels: ['tier'],
  },
  database_query_duration: {
    name: 'database_query_duration',
    type: 'histogram',
    help: 'Database query duration in milliseconds',
    unit: 'ms',
    labels: ['operation', 'table'],
  },
  queue_message_latency: {
    name: 'queue_message_latency',
    type: 'histogram',
    help: 'Message queue processing latency in milliseconds',
    unit: 'ms',
    labels: ['queue', 'status'],
  },
  active_sessions: {
    name: 'active_sessions',
    type: 'gauge',
    help: 'Number of active user sessions',
    labels: ['auth_method'],
  },
};

export function getMetricDefinition(name: string): KVCMetricDefinition | undefined {
  return KYC_METRICS[name];
}

export function listMetricDefinitions(): KVCMetricDefinition[] {
  return Object.values(KYC_METRICS);
}
