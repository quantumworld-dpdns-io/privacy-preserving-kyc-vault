import { randomUUID } from 'node:crypto';
import { VerifiableCredential, CredentialStatus, DID, CredentialSubject } from '../types/index.js';

export interface IssueCredentialInput {
  type: string | string[];
  issuer: DID;
  subject: DID;
  claims?: Record<string, unknown>;
  expirationDate?: string;
  credentialStatus?: { id: string; type: string };
}

export interface VerifyCredentialInput {
  credential: Record<string, unknown>;
  options?: {
    proofPurpose?: string;
    challenge?: string;
    domain?: string;
  };
}

export interface VerificationResult {
  verified: boolean;
  checks: string[];
  errors?: string[];
  timestamp: string;
}

export class CredentialService {
  private credentials = new Map<string, VerifiableCredential>();
  private revokedCredentials = new Set<string>();

  async issue(input: IssueCredentialInput): Promise<VerifiableCredential> {
    const id = `urn:uuid:${randomUUID()}`;
    const types = Array.isArray(input.type) ? input.type : [input.type];
    const allTypes = ['VerifiableCredential', ...types];

    const subject: CredentialSubject = {
      id: input.subject,
      ...(input.claims ?? {}),
    };

    const credential: VerifiableCredential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id,
      type: allTypes,
      issuer: input.issuer,
      issuanceDate: new Date().toISOString(),
      credentialSubject: subject,
      ...(input.expirationDate ? { expirationDate: input.expirationDate } : {}),
      ...(input.credentialStatus ? { credentialStatus: input.credentialStatus } : {}),
    };

    this.credentials.set(id, credential);
    return credential;
  }

  async getById(id: string): Promise<VerifiableCredential> {
    const credential = this.credentials.get(id);
    if (!credential) {
      throw new Object.assign(new Error(`Credential not found: ${id}`), { statusCode: 404 });
    }

    if (this.revokedCredentials.has(id)) {
      return { ...credential, credentialStatus: { id, type: 'RevocationList2020' } };
    }

    return credential;
  }

  async verify(input: VerifyCredentialInput): Promise<VerificationResult> {
    const checks: string[] = [];
    const errors: string[] = [];
    const credential = input.credential as Partial<VerifiableCredential>;

    if (!credential['@context']?.includes('https://www.w3.org/2018/credentials/v1')) {
      errors.push('Missing or invalid @context');
    }
    checks.push('schema');

    if (credential.issuer && (credential.issuer as string).startsWith('did:')) {
      checks.push('issuer_trust');
    } else {
      errors.push('Invalid or missing issuer');
    }

    if (credential.expirationDate) {
      const exp = new Date(credential.expirationDate).getTime();
      if (Date.now() > exp) {
        errors.push('Credential has expired');
      }
      checks.push('expiration');
    }

    if (credential.id && this.revokedCredentials.has(credential.id)) {
      errors.push('Credential has been revoked');
    }
    checks.push('revocation');

    if (input.options?.proofPurpose) {
      checks.push('proof_validation');
    }

    return {
      verified: errors.length === 0,
      checks,
      ...(errors.length > 0 ? { errors } : {}),
      timestamp: new Date().toISOString(),
    };
  }

  async revoke(id: string): Promise<void> {
    if (!this.credentials.has(id)) {
      throw new Object.assign(new Error(`Credential not found: ${id}`), { statusCode: 404 });
    }

    if (this.revokedCredentials.has(id)) {
      throw new Object.assign(new Error(`Credential already revoked: ${id}`), { statusCode: 409 });
    }

    this.revokedCredentials.add(id);
  }

  async list(query: {
    issuer?: DID;
    subject?: DID;
    type?: string;
    status?: CredentialStatus;
    page: number;
    limit: number;
  }): Promise<{ data: VerifiableCredential[]; total: number; page: number; limit: number }> {
    let credentials = Array.from(this.credentials.values());

    if (query.issuer) {
      credentials = credentials.filter((c) => c.issuer === query.issuer);
    }
    if (query.subject) {
      credentials = credentials.filter((c) => c.credentialSubject.id === query.subject);
    }
    if (query.type) {
      credentials = credentials.filter((c) => c.type.includes(query.type!));
    }
    if (query.status === 'revoked') {
      credentials = credentials.filter((c) => this.revokedCredentials.has(c.id));
    } else if (query.status === 'active') {
      credentials = credentials.filter((c) => !this.revokedCredentials.has(c.id));
    }

    const total = credentials.length;
    const start = (query.page - 1) * query.limit;
    const data = credentials.slice(start, start + query.limit);

    return { data, total, page: query.page, limit: query.limit };
  }
}
