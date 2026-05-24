export type KycTier = 'basic' | 'advanced' | 'premium' | 'enterprise';

export interface TierDefinition {
  tier: KycTier;
  name: string;
  requiredVerifications: string[];
  maxAgeDays: number;
  requiresApproval: boolean;
}

export interface WorkflowTimeoutConfig {
  sessionTtlMs: number;
  stepTimeoutMs: number;
  overallTimeoutMs: number;
  pollingIntervalMs: number;
}

export interface OrchestratorConfig {
  port: number;
  host: string;
  tiers: TierDefinition[];
  timeouts: WorkflowTimeoutConfig;
  credentialIssuerEndpoint: string;
  didResolverEndpoint: string;
  zkpEngineEndpoint: string;
  maxActiveWorkflowsPerUser: number;
}

export function loadConfig(): OrchestratorConfig {
  const env = process.env;

  return {
    port: parseInt(env.KYC_ORCHESTRATOR_PORT || '3030', 10),
    host: env.KYC_ORCHESTRATOR_HOST || '0.0.0.0',
    tiers: [
      {
        tier: 'basic',
        name: 'Basic KYC',
        requiredVerifications: ['age_check'],
        maxAgeDays: 365,
        requiresApproval: false,
      },
      {
        tier: 'advanced',
        name: 'Advanced KYC',
        requiredVerifications: ['age_check', 'identity_check', 'address_check'],
        maxAgeDays: 180,
        requiresApproval: false,
      },
      {
        tier: 'premium',
        name: 'Premium KYC',
        requiredVerifications: ['age_check', 'identity_check', 'address_check', 'document_verification'],
        maxAgeDays: 90,
        requiresApproval: true,
      },
      {
        tier: 'enterprise',
        name: 'Enterprise KYC',
        requiredVerifications: [
          'age_check',
          'identity_check',
          'address_check',
          'document_verification',
          'biometric_check',
          'background_check',
        ],
        maxAgeDays: 30,
        requiresApproval: true,
      },
    ],
    timeouts: {
      sessionTtlMs: parseInt(env.KYC_SESSION_TTL_MS || '3600000', 10),
      stepTimeoutMs: parseInt(env.KYC_STEP_TIMEOUT_MS || '300000', 10),
      overallTimeoutMs: parseInt(env.KYC_OVERALL_TIMEOUT_MS || '86400000', 10),
      pollingIntervalMs: parseInt(env.KYC_POLLING_INTERVAL_MS || '5000', 10),
    },
    credentialIssuerEndpoint: env.CREDENTIAL_ISSUER_ENDPOINT || 'http://credential-issuer:3020',
    didResolverEndpoint: env.DID_RESOLVER_ENDPOINT || 'http://did-resolver:3010',
    zkpEngineEndpoint: env.ZKP_ENGINE_ENDPOINT || 'http://zkp-engine:3040',
    maxActiveWorkflowsPerUser: parseInt(env.KYC_MAX_ACTIVE_WORKFLOWS || '3', 10),
  };
}
