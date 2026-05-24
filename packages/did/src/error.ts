export class DIDError extends Error {
  constructor(
    message: string,
    public readonly code: DIDErrorCode,
  ) {
    super(message);
    this.name = 'DIDError';
  }
}

export enum DIDErrorCode {
  InvalidDID = 'INVALID_DID',
  UnsupportedMethod = 'UNSUPPORTED_METHOD',
  NotFound = 'NOT_FOUND',
  ResolutionError = 'RESOLUTION_ERROR',
  CryptoError = 'CRYPTO_ERROR',
  SerializationError = 'SERIALIZATION_ERROR',
  KeyRotationNotAllowed = 'KEY_ROTATION_NOT_ALLOWED',
  Deactivated = 'DEACTIVATED',
  InvalidVerificationMethod = 'INVALID_VERIFICATION_METHOD',
}
