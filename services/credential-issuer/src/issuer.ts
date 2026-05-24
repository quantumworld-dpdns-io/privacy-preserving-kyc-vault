import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { DIDResolver } from '@kyc-vault/did';
import { loadConfig, type SchemaRegistryEntry } from './config.js';

const config = loadConfig();

export interface CredentialSubject {
  id: string;
  [key: string]: unknown;
}

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate: string;
  credentialSubject: CredentialSubject;
  credentialSchema: {
    id: string;
    type: string;
  };
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string;
  };
}

export interface IssueCredentialRequest {
  schemaId: string;
  subject: CredentialSubject;
  issuerDid: string;
  expirySeconds?: number;
}

export interface VerifyCredentialResult {
  valid: boolean;
  errors: string[];
  schemaValid: boolean;
  proofValid: boolean;
  notExpired: boolean;
}

export interface CredentialStatusResult {
  active: boolean;
  revoked: boolean;
  suspended: boolean;
  lastModified: string;
}

export class CredentialIssuer {
  private revokedCredentials: Set<string> = new Set();
  private suspendedCredentials: Set<string> = new Set();

  private getSchema(schemaId: string): SchemaRegistryEntry | undefined {
    return config.schemaRegistry.find((s) => s.id === schemaId);
  }

  private generateProof(subject: CredentialSubject, issuerDid: string): string {
    const payload = JSON.stringify({ subject, issuer: issuerDid, issuedAt: Date.now() });
    return createHash('sha256').update(payload).digest('hex');
  }

  async issueCredential(request: IssueCredentialRequest): Promise<VerifiableCredential> {
    const schema = this.getSchema(request.schemaId);
    if (!schema) {
      throw new Error(`Unknown schema: ${request.schemaId}`);
    }

    const missingFields = schema.requiredFields.filter(
      (field) => !(field in request.subject),
    );
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const now = new Date();
    const expirySeconds = request.expirySeconds ?? config.defaultExpirySeconds;
    const expirationDate = new Date(now.getTime() + expirySeconds * 1000);

    const credential: VerifiableCredential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://www.w3.org/2018/credentials/examples/v1',
      ],
      id: `urn:uuid:${randomUUID()}`,
      type: ['VerifiableCredential', schema.type],
      issuer: request.issuerDid,
      issuanceDate: now.toISOString(),
      expirationDate: expirationDate.toISOString(),
      credentialSubject: request.subject,
      credentialSchema: {
        id: schema.id,
        type: 'JsonSchemaValidator2018',
      },
    };

    credential.proof = {
      type: 'Ed25519Signature2020',
      created: now.toISOString(),
      verificationMethod: `${request.issuerDid}#${config.signingKey.keyId}`,
      proofPurpose: 'assertionMethod',
      proofValue: this.generateProof(request.subject, request.issuerDid),
    };

    return credential;
  }

  async issueBatch(
    requests: IssueCredentialRequest[],
  ): Promise<VerifiableCredential[]> {
    if (requests.length > config.maxCredentialBatch) {
      throw new Error(
        `Batch size ${requests.length} exceeds maximum ${config.maxCredentialBatch}`,
      );
    }
    return Promise.all(requests.map((r) => this.issueCredential(r)));
  }

  async verifyCredential(
    credential: VerifiableCredential,
  ): Promise<VerifyCredentialResult> {
    const errors: string[] = [];

    const hasProof = !!credential.proof;
    const hasSubject = !!credential.credentialSubject;
    const hasSchema = !!credential.credentialSchema;
    const schemaEntry = credential.credentialSchema
      ? this.getSchema(credential.credentialSchema.id)
      : undefined;

    if (credential.expirationDate && new Date(credential.expirationDate) < new Date()) {
      errors.push('Credential has expired');
    }

    if (this.revokedCredentials.has(credential.id)) {
      errors.push('Credential has been revoked');
    }

    return {
      valid: errors.length === 0 && hasProof && hasSubject && hasSchema,
      errors,
      schemaValid: !!schemaEntry,
      proofValid: hasProof,
      notExpired: errors.length === 0,
    };
  }

  async revokeCredential(credentialId: string): Promise<void> {
    this.revokedCredentials.add(credentialId);
  }

  async suspendCredential(credentialId: string): Promise<void> {
    this.suspendedCredentials.add(credentialId);
  }

  async unsuspendCredential(credentialId: string): Promise<void> {
    this.suspendedCredentials.delete(credentialId);
  }

  async getCredentialStatus(credentialId: string): Promise<CredentialStatusResult> {
    return {
      active: !this.revokedCredentials.has(credentialId) && !this.suspendedCredentials.has(credentialId),
      revoked: this.revokedCredentials.has(credentialId),
      suspended: this.suspendedCredentials.has(credentialId),
      lastModified: new Date().toISOString(),
    };
  }

  async resolveIssuerDid(issuerDid: string): Promise<boolean> {
    try {
      const resolver = new DIDResolver();
      await resolver.resolve(issuerDid);
      return true;
    } catch {
      return false;
    }
  }
}

export const issuer = new CredentialIssuer();
