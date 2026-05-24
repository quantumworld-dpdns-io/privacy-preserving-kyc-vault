import { KYCVaultClient, VerifiableCredential, VerifiablePresentation, Proof } from "./client";
import { CredentialError, ErrorCode } from "./errors";

export interface IssueCredentialParams {
  issuerDid: string;
  subjectDid: string;
  claims: Record<string, unknown>;
  expirationDate?: string;
  credentialType?: string[];
  proofPurpose?: string;
}

export interface VerifyCredentialParams {
  credential: VerifiableCredential;
  challenge?: string;
  domain?: string;
}

export interface CreatePresentationParams {
  credentials: VerifiableCredential[];
  holderDid: string;
  challenge?: string;
  domain?: string;
}

export class CredentialManager {
  private readonly client: KYCVaultClient;

  constructor(client: KYCVaultClient) {
    this.client = client;
  }

  async issue(params: IssueCredentialParams): Promise<VerifiableCredential> {
    this.validateSubject(params.subjectDid);

    const response = await this.client.issueCredential(
      params.issuerDid,
      params.subjectDid,
      params.claims,
      {
        expirationDate: params.expirationDate,
        credentialType: params.credentialType,
        proofPurpose: params.proofPurpose,
      },
    );

    return response.credential;
  }

  async verify(params: VerifyCredentialParams): Promise<boolean> {
    this.validateCredential(params.credential);

    if (params.credential.expirationDate) {
      const now = new Date();
      const exp = new Date(params.credential.expirationDate);
      if (now > exp) {
        throw CredentialError.expired(params.credential.id);
      }
    }

    const result = await this.client.verifyCredential(params.credential, {
      challenge: params.challenge,
      domain: params.domain,
    });

    return result.verified;
  }

  async verifyWithDetail(
    params: VerifyCredentialParams,
  ): Promise<{ verified: boolean; checks: { name: string; passed: boolean; message?: string }[] }> {
    this.validateCredential(params.credential);

    const result = await this.client.verifyCredential(params.credential, {
      challenge: params.challenge,
      domain: params.domain,
    });

    return {
      verified: result.verified,
      checks: result.checks,
    };
  }

  async createPresentation(
    params: CreatePresentationParams,
  ): Promise<VerifiablePresentation> {
    if (params.credentials.length === 0) {
      throw new CredentialError(
        "At least one credential is required to create a presentation",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    return this.client.createPresentation(
      params.credentials,
      params.holderDid,
      {
        challenge: params.challenge,
        domain: params.domain,
      },
    );
  }

  async verifyPresentation(
    presentation: VerifiablePresentation,
    challenge?: string,
    domain?: string,
  ): Promise<boolean> {
    if (!presentation.verifiableCredential || presentation.verifiableCredential.length === 0) {
      throw new CredentialError(
        "Presentation must contain at least one credential",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const result = await this.client.verifyPresentation(presentation, {
      challenge,
      domain,
    });

    return result.verified;
  }

  async revoke(id: string, reason?: string): Promise<void> {
    const result = await this.client.revokeCredential(id, reason);
    if (!result.revoked) {
      throw new CredentialError(
        `Failed to revoke credential '${id}'`,
        ErrorCode.INTERNAL_ERROR,
        { credentialId: id },
      );
    }
  }

  async getStatus(id: string): Promise<{
    status: string;
    updatedAt: string;
    revokedAt?: string;
    revocationReason?: string;
  }> {
    return this.client.checkCredentialStatus(id);
  }

  async get(id: string): Promise<VerifiableCredential> {
    return this.client.getCredential(id);
  }

  async list(params?: {
    page?: number;
    pageSize?: number;
    subjectDid?: string;
    issuerDid?: string;
    status?: "valid" | "expired" | "revoked";
  }): Promise<VerifiableCredential[]> {
    const response = await this.client.listCredentials(params);
    return response.data;
  }

  async isExpired(credential: VerifiableCredential): Promise<boolean> {
    if (!credential.expirationDate) return false;

    // Check with the server first for authoritative answer
    try {
      const status = await this.getStatus(credential.id);
      return status.status === "expired";
    } catch {
      // Fallback to local check
      const now = new Date();
      const exp = new Date(credential.expirationDate);
      return now > exp;
    }
  }

  async isRevoked(credential: VerifiableCredential): Promise<boolean> {
    try {
      const status = await this.getStatus(credential.id);
      return status.status === "revoked";
    } catch {
      return false;
    }
  }

  async selectByType(
    credentials: VerifiableCredential[],
    type: string,
  ): Promise<VerifiableCredential[]> {
    return credentials.filter((c) => c.type.includes(type));
  }

  async selectNonExpired(
    credentials: VerifiableCredential[],
  ): Promise<VerifiableCredential[]> {
    const now = new Date();
    return credentials.filter((c) => {
      if (!c.expirationDate) return true;
      return now <= new Date(c.expirationDate);
    });
  }

  private validateSubject(did: string): void {
    if (!did || !did.startsWith("did:")) {
      throw new CredentialError(
        `Invalid subject DID: '${did}'`,
        ErrorCode.VALIDATION_ERROR,
        { subjectDid: did },
      );
    }
  }

  private validateCredential(credential: VerifiableCredential): void {
    if (!credential.id) {
      throw new CredentialError("Credential must have an id", ErrorCode.VALIDATION_ERROR);
    }
    if (!credential.issuer) {
      throw new CredentialError("Credential must have an issuer", ErrorCode.VALIDATION_ERROR);
    }
    if (!credential.credentialSubject?.id) {
      throw new CredentialError(
        "Credential subject must have an id",
        ErrorCode.VALIDATION_ERROR,
      );
    }
  }
}

export function createCredential(
  issuer: string,
  subjectId: string,
  claims: Record<string, unknown>,
  options?: {
    id?: string;
    types?: string[];
    expirationDate?: string;
  },
): VerifiableCredential {
  const credential: VerifiableCredential = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://www.w3.org/2018/credentials/examples/v1",
    ],
    id: options?.id || `urn:uuid:${crypto.randomUUID()}`,
    type: options?.types || ["VerifiableCredential"],
    issuer,
    issuanceDate: new Date().toISOString(),
    expirationDate: options?.expirationDate,
    credentialSubject: {
      id: subjectId,
      ...claims,
    },
  };

  return credential;
}

export function addProof(
  credential: VerifiableCredential,
  proof: Proof,
): VerifiableCredential {
  return {
    ...credential,
    proof,
  };
}

export function toJSON(credential: VerifiableCredential): string {
  return JSON.stringify(credential, null, 2);
}

export function fromJSON(json: string): VerifiableCredential {
  return JSON.parse(json) as VerifiableCredential;
}

export function isVerifiableCredential(obj: unknown): obj is VerifiableCredential {
  if (typeof obj !== "object" || obj === null) return false;
  const vc = obj as Record<string, unknown>;
  return (
    typeof vc.id === "string" &&
    typeof vc.issuer === "string" &&
    Array.isArray(vc.type) &&
    typeof vc.credentialSubject === "object" &&
    vc.credentialSubject !== null &&
    typeof (vc.credentialSubject as Record<string, unknown>).id === "string"
  );
}
