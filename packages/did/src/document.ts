import { DIDError, DIDErrorCode } from './error.js';
import { Service } from './service.js';
import { VerificationMethod } from './verification.js';

export interface DIDDocumentParams {
  id: string;
  controller?: string[];
  alsoKnownAs?: string[];
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: Service[];
  created?: string;
  updated?: string;
  versionId?: string;
}

export class DIDDocument {
  public readonly context: string[];
  public readonly id: string;
  public controller?: string[];
  public alsoKnownAs: string[];
  public verificationMethod: VerificationMethod[];
  public authentication: string[];
  public assertionMethod: string[];
  public keyAgreement: string[];
  public capabilityInvocation: string[];
  public capabilityDelegation: string[];
  public service: Service[];
  public created?: string;
  public updated?: string;
  public versionId?: string;

  constructor(id: string) {
    this.context = [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ];
    this.id = id;
    this.alsoKnownAs = [];
    this.verificationMethod = [];
    this.authentication = [];
    this.assertionMethod = [];
    this.keyAgreement = [];
    this.capabilityInvocation = [];
    this.capabilityDelegation = [];
    this.service = [];
  }

  addVerificationMethod(method: VerificationMethod): void {
    this.verificationMethod.push(method);
    this.authentication.push(method.id);
  }

  addService(service: Service): void {
    this.service.push(service);
  }

  validate(): boolean {
    if (!this.id.startsWith('did:')) {
      throw new DIDError(`Invalid DID: ${this.id}`, DIDErrorCode.InvalidDID);
    }
    for (const vm of this.verificationMethod) {
      if (!vm.controller || vm.controller === '') {
        throw new DIDError(
          'Empty controller in verification method',
          DIDErrorCode.InvalidVerificationMethod,
        );
      }
    }
    return true;
  }

  toJSON(): Record<string, unknown> {
    return {
      '@context': this.context,
      id: this.id,
      controller: this.controller,
      alsoKnownAs: this.alsoKnownAs.length > 0 ? this.alsoKnownAs : undefined,
      verificationMethod: this.verificationMethod.map(v => v.toJSON()),
      authentication: this.authentication,
      assertionMethod: this.assertionMethod.length > 0 ? this.assertionMethod : undefined,
      service: this.service.map(s => s.toJSON()),
      created: this.created,
      updated: this.updated,
      versionId: this.versionId,
    };
  }

  static fromJSON(json: Record<string, unknown>): DIDDocument {
    const doc = new DIDDocument(json.id as string);
    if (json.controller) doc.controller = json.controller as string[];
    if (json.alsoKnownAs) doc.alsoKnownAs = json.alsoKnownAs as string[];
    if (json.created) doc.created = json.created as string;
    if (json.updated) doc.updated = json.updated as string;
    if (json.versionId) doc.versionId = json.versionId as string;
    return doc;
  }
}
