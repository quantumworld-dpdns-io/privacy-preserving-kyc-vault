import { KYCVaultClient, DIDDocument, DIDVerificationMethod, ServiceEndpoint } from "./client";
import { DIDError } from "./errors";

export interface CreateDIDOptions {
  keyType?: string;
  network?: string;
  services?: ServiceEndpoint[];
}

export interface RotateKeyOptions {
  keyType?: string;
}

export class DIDManager {
  private readonly client: KYCVaultClient;

  constructor(client: KYCVaultClient) {
    this.client = client;
  }

  async resolve(did: string): Promise<DIDDocument> {
    this.validateDID(did);
    return this.client.resolveDID(did);
  }

  async create(method: string, options?: CreateDIDOptions): Promise<DIDDocument> {
    if (!method) {
      throw DIDError.validation("method", "DID method is required");
    }

    const supportedMethods = ["key", "web", "ethr", "ion", "indy"];
    if (!supportedMethods.includes(method)) {
      throw DIDError.unsupportedMethod(method);
    }

    return this.client.createDID(method, options);
  }

  async deactivate(did: string): Promise<void> {
    this.validateDID(did);
    await this.client.deactivateDID(did);
  }

  async rotateKey(did: string, keyId: string, options?: RotateKeyOptions): Promise<DIDDocument> {
    this.validateDID(did);
    if (!keyId) {
      throw DIDError.validation("keyId", "Key ID is required for rotation");
    }

    return this.client.rotateKey(did, keyId, options);
  }

  async resolveWithMetadata(
    did: string,
  ): Promise<{ document: DIDDocument; duration: number; resolvedAt: number }> {
    const start = performance.now();
    const doc = await this.resolve(did);
    const duration = performance.now() - start;

    return {
      document: doc,
      duration,
      resolvedAt: Math.floor(Date.now() / 1000),
    };
  }

  async getVerificationMethods(did: string): Promise<DIDVerificationMethod[]> {
    const doc = await this.resolve(did);
    return doc.verificationMethod || [];
  }

  async getServices(did: string): Promise<ServiceEndpoint[]> {
    const doc = await this.resolve(did);
    return doc.service || [];
  }

  async findServiceByType(
    did: string,
    serviceType: string,
  ): Promise<ServiceEndpoint | undefined> {
    const services = await this.getServices(did);
    return services.find((s) => s.type === serviceType);
  }

  async getController(did: string): Promise<string[]> {
    const doc = await this.resolve(did);
    return doc.controller || [doc.id];
  }

  async isDeactivated(did: string): Promise<boolean> {
    try {
      await this.resolve(did);
      return false;
    } catch (error) {
      if (error instanceof DIDError && error.message.includes("deactivated")) {
        return true;
      }
      throw error;
    }
  }

  async batchResolve(dids: string[]): Promise<Map<string, DIDDocument>> {
    const results = new Map<string, DIDDocument>();
    const entries = await Promise.allSettled(
      dids.map(async (did) => {
        const doc = await this.resolve(did);
        return { did, doc };
      }),
    );

    for (const entry of entries) {
      if (entry.status === "fulfilled") {
        results.set(entry.value.did, entry.value.doc);
      }
    }

    return results;
  }

  private validateDID(did: string): void {
    if (!did || typeof did !== "string") {
      throw DIDError.validation("did", "DID string is required");
    }

    const parts = did.split(":");
    if (parts.length < 3 || parts[0] !== "did") {
      throw DIDError.validation("did", `Invalid DID format: '${did}'`);
    }

    const method = parts[1];
    if (!method || method.length === 0) {
      throw DIDError.validation("did", "DID method is required");
    }
  }

  static parseDID(did: string): { method: string; methodSpecificId: string } {
    const parts = did.split(":");
    if (parts.length < 3 || parts[0] !== "did") {
      throw new Error(`Invalid DID: ${did}`);
    }
    return {
      method: parts[1],
      methodSpecificId: parts.slice(2).join(":"),
    };
  }

  static isValidDID(did: string): boolean {
    try {
      DIDManager.parseDID(did);
      return true;
    } catch {
      return false;
    }
  }

  static generateDocURI(did: string, fragment: string): string {
    return `${did}#${fragment}`;
  }

  static createKeyDocURI(did: string, keyTag: string): string {
    return `${did}#${keyTag}`;
  }
}

export function createDIDDocument(
  id: string,
  options?: {
    controller?: string[];
    verificationMethods?: DIDVerificationMethod[];
    services?: ServiceEndpoint[];
    alsoKnownAs?: string[];
  },
): DIDDocument {
  const doc: DIDDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1",
    ],
    id,
    verificationMethod: options?.verificationMethods || [],
    authentication: (options?.verificationMethods || []).map((vm) => vm.id),
    service: options?.services,
    alsoKnownAs: options?.alsoKnownAs,
    controller: options?.controller,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  return doc;
}

export function createVerificationMethod(
  id: string,
  type: string,
  controller: string,
  publicKey: { multibase?: string; jwk?: Record<string, unknown> },
): DIDVerificationMethod {
  return {
    id,
    type,
    controller,
    publicKeyMultibase: publicKey.multibase,
    publicKeyJwk: publicKey.jwk,
  };
}

export function addVerificationMethod(
  doc: DIDDocument,
  method: DIDVerificationMethod,
): DIDDocument {
  return {
    ...doc,
    verificationMethod: [...(doc.verificationMethod || []), method],
    authentication: [...(doc.authentication || []), method.id],
  };
}

export function removeVerificationMethod(
  doc: DIDDocument,
  methodId: string,
): DIDDocument {
  return {
    ...doc,
    verificationMethod: (doc.verificationMethod || []).filter((vm) => vm.id !== methodId),
    authentication: (doc.authentication || []).filter((id) => id !== methodId),
    assertionMethod: (doc.assertionMethod || []).filter((id) => id !== methodId),
    keyAgreement: (doc.keyAgreement || []).filter((id) => id !== methodId),
  };
}

export function addService(doc: DIDDocument, service: ServiceEndpoint): DIDDocument {
  return {
    ...doc,
    service: [...(doc.service || []), service],
  };
}

export function removeService(doc: DIDDocument, serviceId: string): DIDDocument {
  return {
    ...doc,
    service: (doc.service || []).filter((s) => s.id !== serviceId),
  };
}
