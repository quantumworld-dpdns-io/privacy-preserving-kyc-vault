import crypto from 'crypto';

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, unknown>;
  proof?: Proof;
}

export interface Proof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  jws?: string;
  proofValue?: string;
}

export interface JwtPayload {
  sub: string;
  iss: string;
  iat: number;
  exp?: number;
  vc?: {
    '@context': string[];
    type: string[];
    credentialSubject: Record<string, unknown>;
  };
}

export type CredentialFormat = 'jsonld' | 'jwt' | 'vc';

export interface ConversionResult {
  success: boolean;
  output: string;
  format: CredentialFormat;
  warnings: string[];
}

export class FormatConverter {
  private supportedContexts: Set<string> = new Set([
    'https://www.w3.org/2018/credentials/v1',
    'https://www.w3.org/ns/credentials/v2',
    'https://w3id.org/security/suites/ed25519-2020/v1',
    'https://w3id.org/security/suites/secp256k1-2019/v1',
  ]);

  private supportedTypes: Set<string> = new Set([
    'VerifiableCredential',
    'KycBasic',
    'KycAdvanced',
    'AgeCredential',
    'IdentityCredential',
    'AddressCredential',
  ]);

  registerContext(context: string): void {
    this.supportedContexts.add(context);
  }

  registerType(type: string): void {
    this.supportedTypes.add(type);
  }

  async convert(input: string, targetFormat: CredentialFormat): Promise<ConversionResult> {
    const sourceFormat = this.detectFormat(input);
    const warnings: string[] = [];

    if (sourceFormat === targetFormat) {
      return { success: true, output: input, format: targetFormat, warnings: ['Input and output formats are the same'] };
    }

    switch (targetFormat) {
      case 'jsonld':
        return this.toJsonLd(input, sourceFormat, warnings);
      case 'jwt':
        return this.toJwt(input, sourceFormat, warnings);
      case 'vc':
        return this.toVc(input, sourceFormat, warnings);
      default:
        throw new Error(`Unsupported target format: ${targetFormat}`);
    }
  }

  detectFormat(input: string): CredentialFormat {
    const trimmed = input.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed['@context']) return 'jsonld';
        if (parsed.vc || parsed.vp) return 'jwt';
        if (parsed.type && Array.isArray(parsed.type) && parsed.type.includes('VerifiableCredential')) return 'vc';
        return 'vc';
      } catch {
        return 'jwt';
      }
    }
    if (trimmed.startsWith('ey')) return 'jwt';
    return 'jwt';
  }

  private async toJsonLd(input: string, sourceFormat: CredentialFormat, warnings: string[]): Promise<ConversionResult> {
    if (sourceFormat === 'jsonld') {
      return { success: true, output: input, format: 'jsonld', warnings };
    }

    if (sourceFormat === 'jwt') {
      const payload = this.decodeJwt(input);
      if (!payload.vc) {
        warnings.push('JWT payload has no vc claim; converting as minimal credential');
      }

      const vc: VerifiableCredential = {
        '@context': payload.vc?.['@context'] || ['https://www.w3.org/2018/credentials/v1'],
        id: `urn:uuid:${crypto.randomUUID()}`,
        type: ['VerifiableCredential', ...(payload.vc?.type || [])],
        issuer: payload.iss,
        issuanceDate: new Date(payload.iat * 1000).toISOString(),
        credentialSubject: payload.vc?.credentialSubject || { id: payload.sub },
      };

      if (payload.exp) {
        vc.expirationDate = new Date(payload.exp * 1000).toISOString();
      }

      return {
        success: true,
        output: JSON.stringify(vc, null, 2),
        format: 'jsonld',
        warnings,
      };
    }

    return this.toJsonLd(input, 'jwt', warnings);
  }

  private async toJwt(input: string, sourceFormat: CredentialFormat, warnings: string[]): Promise<ConversionResult> {
    if (sourceFormat === 'jwt') {
      return { success: true, output: input, format: 'jwt', warnings };
    }

    const vc: VerifiableCredential = JSON.parse(input);
    const payload: JwtPayload = {
      sub: (vc.credentialSubject?.id as string) || vc.credentialSubject?.id || '',
      iss: typeof vc.issuer === 'string' ? vc.issuer : (vc.issuer as Record<string, string>)?.id || '',
      iat: Math.floor(new Date(vc.issuanceDate).getTime() / 1000),
      vc: {
        '@context': vc['@context'],
        type: vc.type.filter((t) => t !== 'VerifiableCredential'),
        credentialSubject: { ...vc.credentialSubject },
      },
    };

    if (vc.expirationDate) {
      payload.exp = Math.floor(new Date(vc.expirationDate).getTime() / 1000);
    }

    const header = { alg: 'EdDSA', typ: 'JWT', kid: vc.proof?.verificationMethod };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;

    return {
      success: true,
      output: unsigned,
      format: 'jwt',
      warnings: [...warnings, 'JWT is unsigned; signing required before use'],
    };
  }

  private async toVc(input: string, sourceFormat: CredentialFormat, warnings: string[]): Promise<ConversionResult> {
    if (sourceFormat === 'vc') {
      return { success: true, output: input, format: 'vc', warnings };
    }

    if (sourceFormat === 'jwt') {
      const payload = this.decodeJwt(input);
      const vc: VerifiableCredential = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        id: `urn:uuid:${crypto.randomUUID()}`,
        type: ['VerifiableCredential', ...(payload.vc?.type || ['KycBasic'])],
        issuer: payload.iss,
        issuanceDate: new Date(payload.iat * 1000).toISOString(),
        credentialSubject: payload.vc?.credentialSubject || { id: payload.sub },
      };
      if (payload.exp) {
        vc.expirationDate = new Date(payload.exp * 1000).toISOString();
      }
      return { success: true, output: JSON.stringify(vc, null, 2), format: 'vc', warnings };
    }

    const parsed = JSON.parse(input);
    const vc: VerifiableCredential = {
      '@context': parsed['@context'] || ['https://www.w3.org/2018/credentials/v1'],
      id: parsed.id || `urn:uuid:${crypto.randomUUID()}`,
      type: Array.isArray(parsed.type) ? parsed.type : ['VerifiableCredential', parsed.type || 'KycBasic'],
      issuer: parsed.issuer,
      issuanceDate: parsed.issuanceDate || parsed.issuedAt,
      credentialSubject: parsed.credentialSubject || parsed.attributes || parsed,
      proof: parsed.proof,
    };
    if (parsed.expirationDate || parsed.expiresAt) {
      vc.expirationDate = parsed.expirationDate || parsed.expiresAt;
    }
    return { success: true, output: JSON.stringify(vc, null, 2), format: 'vc', warnings };
  }

  decodeJwt(jwt: string): JwtPayload {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return payload as JwtPayload;
  }

  private base64UrlEncode(data: string): string {
    return Buffer.from(data)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
