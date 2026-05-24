import { createHash, randomUUID } from 'node:crypto';
import { DIDDocument, DID, VerificationMethod, DIDService } from '../types/index.js';

export interface CreateDIDInput {
  method: string;
  verificationMethod: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: DIDService[];
  alsoKnownAs?: string[];
}

export interface UpdateDIDInput {
  did: DID;
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: DIDService[];
  alsoKnownAs?: string[];
}

export interface DIDResolutionResult {
  didDocument: DIDDocument;
  didResolutionMetadata: Record<string, unknown>;
  didDocumentMetadata: Record<string, unknown>;
}

export class DIDService {
  private documents = new Map<DID, DIDDocument>();

  async resolve(did: DID): Promise<DIDResolutionResult> {
    const doc = this.documents.get(did);
    if (!doc) {
      throw new Object.assign(new Error(`DID not found: ${did}`), { statusCode: 404 });
    }
    return {
      didDocument: doc,
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocumentMetadata: { created: doc.created, updated: doc.updated },
    };
  }

  async create(input: CreateDIDInput): Promise<DIDDocument> {
    const methodSpecificId = createHash('sha256')
      .update(JSON.stringify(input.verificationMethod))
      .digest('hex')
      .slice(0, 32);
    const did = `did:${input.method}:${methodSpecificId}` as DID;

    if (this.documents.has(did)) {
      throw new Object.assign(new Error('DID already exists'), { statusCode: 409 });
    }

    const doc: DIDDocument = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: did,
      verificationMethod: input.verificationMethod.map((vm, i) => ({
        ...vm,
        id: vm.id.includes(':') ? vm.id : `${did}#key-${i}`,
      })),
      authentication: input.authentication ?? input.verificationMethod.map((_, i) => `#key-${i}`),
      assertionMethod: input.assertionMethod,
      keyAgreement: input.keyAgreement,
      capabilityInvocation: input.capabilityInvocation,
      capabilityDelegation: input.capabilityDelegation,
      service: input.service,
      alsoKnownAs: input.alsoKnownAs,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };

    this.documents.set(did, doc);
    return doc;
  }

  async update(input: UpdateDIDInput): Promise<DIDDocument> {
    const existing = this.documents.get(input.did);
    if (!existing) {
      throw new Object.assign(new Error(`DID not found: ${input.did}`), { statusCode: 404 });
    }

    const updated: DIDDocument = {
      ...existing,
      verificationMethod: input.verificationMethod ?? existing.verificationMethod,
      authentication: input.authentication ?? existing.authentication,
      assertionMethod: input.assertionMethod ?? existing.assertionMethod,
      keyAgreement: input.keyAgreement ?? existing.keyAgreement,
      capabilityInvocation: input.capabilityInvocation ?? existing.capabilityInvocation,
      capabilityDelegation: input.capabilityDelegation ?? existing.capabilityDelegation,
      service: input.service ?? existing.service,
      alsoKnownAs: input.alsoKnownAs ?? existing.alsoKnownAs,
      updated: new Date().toISOString(),
    };

    this.documents.set(input.did, updated);
    return updated;
  }

  async deactivate(did: DID): Promise<void> {
    const doc = this.documents.get(did);
    if (!doc) {
      throw new Object.assign(new Error(`DID not found: ${did}`), { statusCode: 404 });
    }

    this.documents.delete(did);
  }

  async list(query: {
    method?: string;
    controller?: DID;
    page: number;
    limit: number;
  }): Promise<{ data: DIDDocument[]; total: number; page: number; limit: number }> {
    let docs = Array.from(this.documents.values());

    if (query.method) {
      docs = docs.filter((d) => d.id.startsWith(`did:${query.method}:`));
    }
    if (query.controller) {
      docs = docs.filter((d) => {
        const c = d.controller;
        return c === query.controller || (Array.isArray(c) && c.includes(query.controller));
      });
    }

    const total = docs.length;
    const start = (query.page - 1) * query.limit;
    const data = docs.slice(start, start + query.limit);

    return { data, total, page: query.page, limit: query.limit };
  }
}
