import { useState, useCallback } from "react";
import { useAPIClient } from "./KYCVaultProvider";

interface DIDDocument {
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

interface DIDVerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
  blockchainAccountId?: string;
}

interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string | string[];
  description?: string;
}

interface CreateDIDOptions {
  keyType?: string;
  network?: string;
  services?: ServiceEndpoint[];
}

interface ResolveResult {
  document: DIDDocument;
  duration: number;
  resolvedAt: number;
}

interface UseDIDReturn {
  didDocument: DIDDocument | null;
  isLoading: boolean;
  error: string | null;
  resolveDID: (did: string) => Promise<DIDDocument>;
  createDID: (method: string, options?: CreateDIDOptions) => Promise<DIDDocument>;
  rotateKey: (did: string, keyId: string, keyType?: string) => Promise<DIDDocument>;
  deactivateDID: (did: string) => Promise<void>;
  resolveWithMetadata: (did: string) => Promise<ResolveResult>;
  getVerificationMethods: (did: string) => Promise<DIDVerificationMethod[]>;
  getServices: (did: string) => Promise<ServiceEndpoint[]>;
  isDeactivated: (did: string) => Promise<boolean>;
}

function validateDID(did: string): void {
  if (!did || typeof did !== "string") {
    throw new Error("DID string is required");
  }
  const parts = did.split(":");
  if (parts.length < 3 || parts[0] !== "did") {
    throw new Error(`Invalid DID format: '${did}'`);
  }
  if (!parts[1] || parts[1].length === 0) {
    throw new Error("DID method is required");
  }
}

export function useDID(): UseDIDReturn {
  const { get, post } = useAPIClient();
  const [didDocument, setDidDocument] = useState<DIDDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveDID = useCallback(
    async (did: string): Promise<DIDDocument> => {
      validateDID(did);
      setIsLoading(true);
      setError(null);
      try {
        const doc = await get<DIDDocument>(`/v1/did/${encodeURIComponent(did)}`);
        setDidDocument(doc);
        return doc;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to resolve DID";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [get],
  );

  const createDID = useCallback(
    async (method: string, options?: CreateDIDOptions): Promise<DIDDocument> => {
      setIsLoading(true);
      setError(null);
      try {
        const doc = await post<DIDDocument>("/v1/did/create", { method, ...options });
        setDidDocument(doc);
        return doc;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to create DID";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const rotateKey = useCallback(
    async (did: string, keyId: string, keyType?: string): Promise<DIDDocument> => {
      validateDID(did);
      setIsLoading(true);
      setError(null);
      try {
        const doc = await post<DIDDocument>(
          `/v1/did/${encodeURIComponent(did)}/rotate`,
          { keyId, keyType },
        );
        setDidDocument(doc);
        return doc;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to rotate key";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const deactivateDID = useCallback(
    async (did: string): Promise<void> => {
      validateDID(did);
      setIsLoading(true);
      setError(null);
      try {
        await post(`/v1/did/${encodeURIComponent(did)}/deactivate`, {});
        setDidDocument(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to deactivate DID";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const resolveWithMetadata = useCallback(
    async (did: string): Promise<ResolveResult> => {
      const start = performance.now();
      const document = await resolveDID(did);
      const duration = performance.now() - start;
      return {
        document,
        duration,
        resolvedAt: Math.floor(Date.now() / 1000),
      };
    },
    [resolveDID],
  );

  const getVerificationMethods = useCallback(
    async (did: string): Promise<DIDVerificationMethod[]> => {
      const doc = await resolveDID(did);
      return doc.verificationMethod || [];
    },
    [resolveDID],
  );

  const getServices = useCallback(
    async (did: string): Promise<ServiceEndpoint[]> => {
      const doc = await resolveDID(did);
      return doc.service || [];
    },
    [resolveDID],
  );

  const isDeactivated = useCallback(
    async (did: string): Promise<boolean> => {
      try {
        await resolveDID(did);
        return false;
      } catch {
        return true;
      }
    },
    [resolveDID],
  );

  return {
    didDocument,
    isLoading,
    error,
    resolveDID,
    createDID,
    rotateKey,
    deactivateDID,
    resolveWithMetadata,
    getVerificationMethods,
    getServices,
    isDeactivated,
  };
}
