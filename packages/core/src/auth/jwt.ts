import * as crypto from 'node:crypto';

export interface JWTHeader {
  alg: 'EdDSA' | 'HS256' | 'HS384' | 'HS512';
  typ: 'JWT';
  kid?: string;
}

export interface JWTPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface JWTSigningKey {
  type: 'ed25519' | 'hmac';
  key: crypto.KeyLike | string;
  kid?: string;
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

function decodeBase64url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function createJWT(
  payload: JWTPayload,
  signingKey: JWTSigningKey,
  headerOverrides?: Partial<JWTHeader>,
): string {
  const header: JWTHeader = {
    alg: signingKey.type === 'ed25519' ? 'EdDSA' : 'HS256',
    typ: 'JWT',
    kid: signingKey.kid,
    ...headerOverrides,
  };

  const headerEncoded = base64url(Buffer.from(JSON.stringify(header)));
  const payloadEncoded = base64url(Buffer.from(JSON.stringify(payload)));
  const data = `${headerEncoded}.${payloadEncoded}`;

  let signature: Buffer;
  if (signingKey.type === 'ed25519') {
    const sign = crypto.createSign('sha256');
    sign.update(data);
    sign.end();
    signature = sign.sign(signingKey.key as crypto.KeyLike);
  } else {
    const hmac = crypto.createHmac('sha256', signingKey.key as string);
    hmac.update(data);
    signature = hmac.digest();
  }

  return `${data}.${base64url(signature)}`;
}

export function verifyJWT(
  token: string,
  key: JWTSigningKey,
  options?: { aud?: string | string[]; iss?: string; maxAgeMs?: number },
): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerEncoded = parts[0]!;
    const payloadEncoded = parts[1]!;
    const signatureEncoded = parts[2]!;

    const header: JWTHeader = JSON.parse(
      decodeBase64url(headerEncoded).toString('utf-8'),
    );
    const payload: JWTPayload = JSON.parse(
      decodeBase64url(payloadEncoded).toString('utf-8'),
    );

    const data = `${headerEncoded}.${payloadEncoded}`;
    const sig = decodeBase64url(signatureEncoded);

    let isValid: boolean;
    if (key.type === 'ed25519') {
      const verify = crypto.createVerify('sha256');
      verify.update(data);
      verify.end();
      isValid = verify.verify(key.key as crypto.KeyLike, sig);
    } else {
      const hmac = crypto.createHmac('sha256', key.key as string);
      hmac.update(data);
      const expected = hmac.digest();
      isValid = crypto.timingSafeEqual(sig, expected);
    }

    if (!isValid) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now >= payload.exp) return null;
    if (payload.nbf && now < payload.nbf) return null;
    if (options?.maxAgeMs && payload.iat) {
      if (Date.now() > (payload.iat + options.maxAgeMs / 1000) * 1000) return null;
    }
    if (options?.iss && payload.iss !== options.iss) return null;
    if (options?.aud) {
      const aud = payload.aud;
      if (!aud) return null;
      const audiences = Array.isArray(aud) ? aud : [aud];
      const expected = Array.isArray(options.aud) ? options.aud : [options.aud];
      if (!expected.some((e) => audiences.includes(e))) return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function decodeJWT(token: string): { header: JWTHeader; payload: JWTPayload } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return {
      header: JSON.parse(decodeBase64url(parts[0]!).toString('utf-8')),
      payload: JSON.parse(decodeBase64url(parts[1]!).toString('utf-8')),
    };
  } catch {
    return null;
  }
}

export function generateJWTId(): string {
  return crypto.randomUUID();
}

export function createEd25519KeyPair(): { publicKey: Buffer; privateKey: Buffer } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKey, privateKey };
}
