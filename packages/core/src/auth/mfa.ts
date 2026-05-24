import * as crypto from 'node:crypto';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;

export interface TOTPSecret {
  secret: string;
  uri: string;
  qrCodeUrl?: string;
}

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  createdAt: number;
}

export interface MFAMethod {
  type: 'totp' | 'webauthn' | 'email' | 'sms' | 'backup_code';
  id: string;
  enabled: boolean;
  verifiedAt?: number;
}

export interface MFAVerification {
  verified: boolean;
  method?: string;
  error?: string;
}

export interface BackupCodes {
  codes: string[];
  hashed: string[];
  createdAt: number;
}

function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

export function generateTOTPSecret(issuer: string, account: string): TOTPSecret {
  const secretBytes = crypto.randomBytes(20);
  const secret = base32Encode(secretBytes);
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
  return { secret, uri };
}

export function generateTOTPCode(secret: string, timestamp: number = Date.now()): string {
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const key = Buffer.from(secret, 'ascii');
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function verifyTOTPCode(secret: string, code: string, timestamp: number = Date.now()): boolean {
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const expected = generateTOTPCode(secret, timestamp + i * TOTP_STEP_SECONDS * 1000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      return true;
    }
  }
  return false;
}

export function generateBackupCodes(count: number = 10): BackupCodes {
  const codes: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-');
    codes.push(code);
    hashed.push(crypto.createHash('sha256').update(code).digest('hex'));
  }
  return { codes, hashed, createdAt: Date.now() };
}

export function verifyBackupCode(code: string, hashedCodes: string[]): { valid: boolean; index?: number } {
  const inputHash = crypto.createHash('sha256').update(code).digest('hex');
  for (let i = 0; i < hashedCodes.length; i++) {
    if (crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(hashedCodes[i]!))) {
      return { valid: true, index: i };
    }
  }
  return { valid: false };
}

export interface WebAuthnRegistrationOptions {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  timeout: number;
  attestation: 'none' | 'indirect' | 'direct';
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    requireResidentKey: boolean;
    residentKey: 'preferred' | 'required' | 'discouraged';
    userVerification: 'preferred' | 'required' | 'discouraged';
  };
}

export interface WebAuthnAuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials: { id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }[];
  timeout: number;
  userVerification: 'preferred' | 'required' | 'discouraged';
}

export function createWebAuthnRegistrationOptions(rpName: string, rpId: string, userId: string, userName: string): WebAuthnRegistrationOptions {
  return {
    challenge: crypto.randomBytes(32).toString('base64url'),
    rp: { name: rpName, id: rpId },
    user: { id: userId, name: userName, displayName: userName },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'preferred',
    },
  };
}

export function createWebAuthnAuthenticationOptions(rpId: string, credentials: WebAuthnCredential[]): WebAuthnAuthenticationOptions {
  return {
    challenge: crypto.randomBytes(32).toString('base64url'),
    rpId,
    allowCredentials: credentials.map((c) => ({
      id: c.id,
      type: 'public-key' as const,
      transports: c.transports,
    })),
    timeout: 60000,
    userVerification: 'preferred',
  };
}

type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid';

export function verifyWebAuthnAssertion(
  credentialId: string,
  signature: string,
  authenticatorData: string,
  clientDataJSON: string,
  storedCredential: WebAuthnCredential,
): MFAVerification {
  try {
    const clientData = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf-8'));
    if (clientData.type !== 'webauthn.get') {
      return { verified: false, error: 'Invalid assertion type' };
    }

    const dataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
    const signedData = Buffer.concat([
      Buffer.from(authenticatorData, 'base64url'),
      dataHash,
    ]);

    const verify = crypto.createVerify('sha256');
    verify.update(signedData);
    verify.end();
    const isValid = verify.verify(
      Buffer.from(storedCredential.publicKey, 'base64url'),
      Buffer.from(signature, 'base64url'),
    );

    return {
      verified: isValid,
      method: 'webauthn',
      error: isValid ? undefined : 'Invalid WebAuthn signature',
    };
  } catch (err) {
    return { verified: false, error: (err as Error).message };
  }
}

export function verifyMFAChallenge(
  method: 'totp' | 'webauthn' | 'backup_code',
  challenge: string,
  secretOrCodes: string | string[],
): MFAVerification {
  switch (method) {
    case 'totp': {
      const valid = verifyTOTPCode(secretOrCodes as string, challenge);
      return { verified: valid, method: 'totp', error: valid ? undefined : 'Invalid TOTP code' };
    }
    case 'backup_code': {
      const result = verifyBackupCode(challenge, secretOrCodes as string[]);
      return {
        verified: result.valid,
        method: 'backup_code',
        error: result.valid ? undefined : 'Invalid backup code',
      };
    }
    default:
      return { verified: false, error: `Unsupported MFA method: ${method}` };
  }
}
