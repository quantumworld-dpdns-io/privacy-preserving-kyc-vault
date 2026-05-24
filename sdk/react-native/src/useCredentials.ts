import { useState, useCallback } from "react";
import { useAPIClient } from "./KYCVaultProvider";

interface VerifiableCredential {
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

interface Proof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue?: string;
  jws?: string;
  nonce?: string;
  domain?: string;
}

interface VerifiablePresentation {
  "@context": string[];
  id?: string;
  type: string[];
  holder?: string;
  verifiableCredential: VerifiableCredential[];
  proof?: Proof;
}

interface IssueCredentialParams {
  issuerDid: string;
  subjectDid: string;
  claims: Record<string, unknown>;
  expirationDate?: string;
  credentialType?: string[];
  proofPurpose?: string;
}

interface CreatePresentationParams {
  credentials: VerifiableCredential[];
  holderDid: string;
  challenge?: string;
  domain?: string;
}

interface CredentialStatusInfo {
  id: string;
  status: "valid" | "expired" | "revoked" | "suspended";
  updatedAt: string;
  revokedAt?: string;
  revocationReason?: string;
}

interface UseCredentialsReturn {
  credentials: VerifiableCredential[];
  isLoading: boolean;
  error: string | null;
  issueCredential: (params: IssueCredentialParams) => Promise<VerifiableCredential>;
  verifyCredential: (credential: VerifiableCredential, challenge?: string, domain?: string) => Promise<boolean>;
  getCredential: (id: string) => Promise<VerifiableCredential>;
  revokeCredential: (id: string, reason?: string) => Promise<void>;
  checkStatus: (id: string) => Promise<CredentialStatusInfo>;
  listCredentials: (params?: {
    page?: number;
    pageSize?: number;
    subjectDid?: string;
    issuerDid?: string;
    status?: "valid" | "expired" | "revoked";
  }) => Promise<VerifiableCredential[]>;
  createPresentation: (params: CreatePresentationParams) => Promise<VerifiablePresentation>;
  verifyPresentation: (presentation: VerifiablePresentation, challenge?: string, domain?: string) => Promise<boolean>;
  isExpired: (credential: VerifiableCredential) => Promise<boolean>;
  isRevoked: (credential: VerifiableCredential) => Promise<boolean>;
}

export function useCredentials(): UseCredentialsReturn {
  const { get, post } = useAPIClient();
  const [credentials, setCredentials] = useState<VerifiableCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issueCredential = useCallback(
    async (params: IssueCredentialParams): Promise<VerifiableCredential> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await post<{ credential: VerifiableCredential; status: string }>(
          "/v1/credentials/issue",
          params,
        );
        return response.credential;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to issue credential";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const verifyCredential = useCallback(
    async (
      credential: VerifiableCredential,
      challenge?: string,
      domain?: string,
    ): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        if (credential.expirationDate) {
          const now = new Date();
          const exp = new Date(credential.expirationDate);
          if (now > exp) {
            throw new Error(`Credential '${credential.id}' is expired`);
          }
        }
        const result = await post<{ verified: boolean; checks: unknown[] }>(
          "/v1/credentials/verify",
          { credential, challenge, domain },
        );
        return result.verified;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to verify credential";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const getCredential = useCallback(
    async (id: string): Promise<VerifiableCredential> => {
      setIsLoading(true);
      setError(null);
      try {
        const credential = await get<VerifiableCredential>(
          `/v1/credentials/${encodeURIComponent(id)}`,
        );
        return credential;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to get credential";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [get],
  );

  const revokeCredential = useCallback(
    async (id: string, reason?: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await post<{ revoked: boolean }>(
          `/v1/credentials/${encodeURIComponent(id)}/revoke`,
          { reason },
        );
        if (!result.revoked) {
          throw new Error(`Failed to revoke credential '${id}'`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to revoke credential";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const checkStatus = useCallback(
    async (id: string): Promise<CredentialStatusInfo> => {
      setIsLoading(true);
      setError(null);
      try {
        const status = await get<CredentialStatusInfo>(
          `/v1/credentials/${encodeURIComponent(id)}/status`,
        );
        return status;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to check credential status";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [get],
  );

  const listCredentials = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      subjectDid?: string;
      issuerDid?: string;
      status?: "valid" | "expired" | "revoked";
    }): Promise<VerifiableCredential[]> => {
      setIsLoading(true);
      setError(null);
      try {
        const queryParams: Record<string, string> = {};
        if (params?.page) queryParams.page = String(params.page);
        if (params?.pageSize) queryParams.pageSize = String(params.pageSize);
        if (params?.subjectDid) queryParams.subjectDid = params.subjectDid;
        if (params?.issuerDid) queryParams.issuerDid = params.issuerDid;
        if (params?.status) queryParams.status = params.status;

        const response = await get<{ data: VerifiableCredential[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
          "/v1/credentials",
          queryParams,
        );
        setCredentials(response.data);
        return response.data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to list credentials";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [get],
  );

  const createPresentation = useCallback(
    async (params: CreatePresentationParams): Promise<VerifiablePresentation> => {
      setIsLoading(true);
      setError(null);
      try {
        const presentation = await post<VerifiablePresentation>(
          "/v1/presentations/create",
          params,
        );
        return presentation;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to create presentation";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const verifyPresentation = useCallback(
    async (
      presentation: VerifiablePresentation,
      challenge?: string,
      domain?: string,
    ): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await post<{ verified: boolean; checks: unknown[] }>(
          "/v1/presentations/verify",
          { presentation, challenge, domain },
        );
        return result.verified;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to verify presentation";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const isExpired = useCallback(
    async (credential: VerifiableCredential): Promise<boolean> => {
      if (!credential.expirationDate) return false;
      try {
        const status = await checkStatus(credential.id);
        return status.status === "expired";
      } catch {
        const now = new Date();
        const exp = new Date(credential.expirationDate);
        return now > exp;
      }
    },
    [checkStatus],
  );

  const isRevoked = useCallback(
    async (credential: VerifiableCredential): Promise<boolean> => {
      try {
        const status = await checkStatus(credential.id);
        return status.status === "revoked";
      } catch {
        return false;
      }
    },
    [checkStatus],
  );

  return {
    credentials,
    isLoading,
    error,
    issueCredential,
    verifyCredential,
    getCredential,
    revokeCredential,
    checkStatus,
    listCredentials,
    createPresentation,
    verifyPresentation,
    isExpired,
    isRevoked,
  };
}
