export type VerificationType =
  | 'Ed25519VerificationKey2020'
  | 'Ed25519VerificationKey2018'
  | 'JsonWebKey2020'
  | 'EcdsaSecp256k1VerificationKey2019'
  | 'Bls12381G2Key2020';

export interface VerificationMethodParams {
  id: string;
  type: VerificationType;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}

export class VerificationMethod {
  public readonly id: string;
  public readonly type: VerificationType;
  public readonly controller: string;
  public readonly publicKeyMultibase?: string;
  public readonly publicKeyJwk?: Record<string, unknown>;

  constructor(params: VerificationMethodParams) {
    this.id = params.id;
    this.type = params.type;
    this.controller = params.controller;
    this.publicKeyMultibase = params.publicKeyMultibase;
    this.publicKeyJwk = params.publicKeyJwk;
  }

  static fromEd25519(id: string, controller: string, keyBytes: Uint8Array): VerificationMethod {
    const encoded = Buffer.from(keyBytes).toString('base64url');
    return new VerificationMethod({
      id,
      type: 'Ed25519VerificationKey2020',
      controller,
      publicKeyMultibase: `z${encoded}`,
    });
  }

  toJSON(): VerificationMethodParams {
    return {
      id: this.id,
      type: this.type,
      controller: this.controller,
      publicKeyMultibase: this.publicKeyMultibase,
      publicKeyJwk: this.publicKeyJwk,
    };
  }
}
