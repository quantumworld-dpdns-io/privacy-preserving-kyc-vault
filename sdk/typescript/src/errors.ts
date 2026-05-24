export class KYCError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "KYCError";
  }

  static fromHttpResponse(status: number, body: unknown): KYCError {
    const data = body as Record<string, unknown> | undefined;
    const code = (data?.error as ErrorCode) || ErrorCode.UNKNOWN;
    const message = (data?.message as string) || `HTTP ${status}`;
    return new KYCError(message, code, status, data as Record<string, unknown>);
  }

  static notFound(resource: string, id: string): KYCError {
    return new KYCError(
      `${resource} '${id}' not found`,
      ErrorCode.NOT_FOUND,
      404,
      { resource, id },
    );
  }

  static unauthorized(reason?: string): KYCError {
    return new KYCError(
      reason || "Unauthorized",
      ErrorCode.UNAUTHORIZED,
      401,
    );
  }

  static validation(field: string, reason: string): KYCError {
    return new KYCError(
      `Validation error: ${field} - ${reason}`,
      ErrorCode.VALIDATION_ERROR,
      400,
      { field, reason },
    );
  }

  static rateLimited(retryAfter: number): KYCError {
    return new KYCError(
      `Rate limited, retry after ${retryAfter}s`,
      ErrorCode.RATE_LIMITED,
      429,
      { retryAfter },
    );
  }

  isNotFound(): boolean {
    return this.code === ErrorCode.NOT_FOUND;
  }

  isUnauthorized(): boolean {
    return this.code === ErrorCode.UNAUTHORIZED;
  }

  isValidation(): boolean {
    return this.code === ErrorCode.VALIDATION_ERROR;
  }

  isRateLimited(): boolean {
    return this.code === ErrorCode.RATE_LIMITED;
  }
}

export enum ErrorCode {
  UNKNOWN = "UNKNOWN",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  RATE_LIMITED = "RATE_LIMITED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  BAD_REQUEST = "BAD_REQUEST",
  CONFLICT = "CONFLICT",
  TIMEOUT = "TIMEOUT",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  INVALID_CREDENTIAL = "INVALID_CREDENTIAL",
  EXPIRED_CREDENTIAL = "EXPIRED_CREDENTIAL",
  REVOKED_CREDENTIAL = "REVOKED_CREDENTIAL",
  INVALID_PROOF = "INVALID_PROOF",
  DID_RESOLUTION_FAILED = "DID_RESOLUTION_FAILED",
  UNSUPPORTED_DID_METHOD = "UNSUPPORTED_DID_METHOD",
  CRYPTOGRAPHIC_ERROR = "CRYPTOGRAPHIC_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIER_NOT_ALLOWED = "TIER_NOT_ALLOWED",
  INSUFFICIENT_ATTRIBUTES = "INSUFFICIENT_ATTRIBUTES",
}

export class CredentialError extends KYCError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INVALID_CREDENTIAL,
    details?: Record<string, unknown>,
  ) {
    super(message, code, 400, details);
    this.name = "CredentialError";
  }

  static expired(id: string): CredentialError {
    return new CredentialError(
      `Credential '${id}' is expired`,
      ErrorCode.EXPIRED_CREDENTIAL,
      { credentialId: id },
    );
  }

  static revoked(id: string): CredentialError {
    return new CredentialError(
      `Credential '${id}' has been revoked`,
      ErrorCode.REVOKED_CREDENTIAL,
      { credentialId: id },
    );
  }

  static invalidProof(id: string): CredentialError {
    return new CredentialError(
      `Invalid proof for credential '${id}'`,
      ErrorCode.INVALID_PROOF,
      { credentialId: id },
    );
  }
}

export class DIDError extends KYCError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DID_RESOLUTION_FAILED,
    details?: Record<string, unknown>,
  ) {
    super(message, code, 400, details);
    this.name = "DIDError";
  }

  static resolutionFailed(did: string, reason: string): DIDError {
    return new DIDError(
      `Failed to resolve DID '${did}': ${reason}`,
      ErrorCode.DID_RESOLUTION_FAILED,
      { did, reason },
    );
  }

  static unsupportedMethod(method: string): DIDError {
    return new DIDError(
      `Unsupported DID method: '${method}'`,
      ErrorCode.UNSUPPORTED_DID_METHOD,
      { method },
    );
  }
}

export function isKYCError(error: unknown): error is KYCError {
  return error instanceof KYCError;
}

export function toKYCError(error: unknown): KYCError {
  if (error instanceof KYCError) return error;
  if (error instanceof Error) {
    return new KYCError(error.message, ErrorCode.UNKNOWN, 500);
  }
  return new KYCError(String(error), ErrorCode.UNKNOWN, 500);
}
