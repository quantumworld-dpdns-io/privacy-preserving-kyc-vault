import { AppError, type ErrorContext } from './base.js'

export class AuthError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('AUTH_ERROR', message, context)
    this.name = 'AuthError'
  }
}

export class AuthenticationFailedError extends AuthError {
  constructor(reason: string, context?: ErrorContext) {
    super(`Authentication failed: ${reason}`, { ...context, reason })
    this.name = 'AuthenticationFailedError'
  }
}

export class AuthorizationDeniedError extends AuthError {
  constructor(resource: string, action: string, context?: ErrorContext) {
    super(`Authorization denied: ${action} on ${resource}`, {
      ...context,
      resource,
      action,
    })
    this.name = 'AuthorizationDeniedError'
  }
}

export class TokenExpiredError extends AuthError {
  constructor(tokenType: string, context?: ErrorContext) {
    super(`${tokenType} token expired`, { ...context, tokenType })
    this.name = 'TokenExpiredError'
  }
}

export class TokenInvalidError extends AuthError {
  constructor(tokenType: string, reason: string, context?: ErrorContext) {
    super(`Invalid ${tokenType} token: ${reason}`, {
      ...context,
      tokenType,
      reason,
    })
    this.name = 'TokenInvalidError'
  }
}

export class MfaRequiredError extends AuthError {
  constructor(userId: string, context?: ErrorContext) {
    super(`MFA required for user ${userId}`, { ...context, userId })
    this.name = 'MfaRequiredError'
  }
}

export class MfaFailedError extends AuthError {
  constructor(userId: string, method: string, reason: string, context?: ErrorContext) {
    super(`MFA failed for user ${userId} via ${method}: ${reason}`, {
      ...context,
      userId,
      method,
      reason,
    })
    this.name = 'MfaFailedError'
  }
}

export class SessionRevokedError extends AuthError {
  constructor(sessionId: string, context?: ErrorContext) {
    super(`Session revoked: ${sessionId}`, { ...context, sessionId })
    this.name = 'SessionRevokedError'
  }
}

export class ApiKeyRevokedError extends AuthError {
  constructor(keyId: string, context?: ErrorContext) {
    super(`API key revoked: ${keyId}`, { ...context, keyId })
    this.name = 'ApiKeyRevokedError'
  }
}

export class DidAuthChallengeExpiredError extends AuthError {
  constructor(challengeId: string, context?: ErrorContext) {
    super(`DID auth challenge expired: ${challengeId}`, {
      ...context,
      challengeId,
    })
    this.name = 'DidAuthChallengeExpiredError'
  }
}
