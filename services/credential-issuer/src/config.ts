export interface SchemaRegistryEntry {
  id: string;
  type: string;
  version: string;
  schema: Record<string, unknown>;
  requiredFields: string[];
}

export interface SigningKeyConfig {
  keyId: string;
  algorithm: 'Ed25519' | 'Secp256k1' | 'RSA';
  privateKeyPath: string;
  publicKeyPath: string;
}

export interface CredentialIssuerConfig {
  port: number;
  host: string;
  signingKey: SigningKeyConfig;
  schemaRegistry: SchemaRegistryEntry[];
  defaultExpirySeconds: number;
  maxCredentialBatch: number;
  verifyDidEndpoint: string;
}

export function loadConfig(): CredentialIssuerConfig {
  const env = process.env;

  return {
    port: parseInt(env.CREDENTIAL_ISSUER_PORT || '3020', 10),
    host: env.CREDENTIAL_ISSUER_HOST || '0.0.0.0',
    signingKey: {
      keyId: env.SIGNING_KEY_ID || 'issuer-key-1',
      algorithm: (env.SIGNING_KEY_ALGORITHM as SigningKeyConfig['algorithm']) || 'Ed25519',
      privateKeyPath: env.SIGNING_PRIVATE_KEY_PATH || '/keys/issuer-private.pem',
      publicKeyPath: env.SIGNING_PUBLIC_KEY_PATH || '/keys/issuer-public.pem',
    },
    schemaRegistry: [
      {
        id: 'KycBasicV1',
        type: 'KycBasic',
        version: '1.0.0',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            age: { type: 'integer', minimum: 18 },
            nationality: { type: 'string' },
            verificationDate: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'age', 'verificationDate'],
        },
        requiredFields: ['id', 'age', 'verificationDate'],
      },
      {
        id: 'KycAdvancedV1',
        type: 'KycAdvanced',
        version: '1.1.0',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            age: { type: 'integer', minimum: 18 },
            nationality: { type: 'string' },
            address: { type: 'string' },
            documentType: { type: 'string', enum: ['passport', 'id_card', 'drivers_license'] },
            verificationDate: { type: 'string', format: 'date-time' },
            expiryDate: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'age', 'nationality', 'verificationDate'],
        },
        requiredFields: ['id', 'age', 'nationality', 'verificationDate'],
      },
    ],
    defaultExpirySeconds: parseInt(env.CREDENTIAL_DEFAULT_EXPIRY_SECONDS || '31536000', 10),
    maxCredentialBatch: parseInt(env.CREDENTIAL_MAX_BATCH || '100', 10),
    verifyDidEndpoint: env.VERIFY_DID_ENDPOINT || 'http://did-resolver:3010/api/v1/did/resolve',
  };
}
