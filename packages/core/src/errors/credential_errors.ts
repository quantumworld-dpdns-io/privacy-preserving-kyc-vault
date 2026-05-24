import { AppError, type ErrorContext } from './base.js'

export class CredentialError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('CREDENTIAL_ERROR', message, context)
    this.name = 'CredentialError'
  }
}

export class CredentialNotFoundError extends CredentialError {
  constructor(credentialId: string, context?: ErrorContext) {
    super(`Credential not found: ${credentialId}`, { ...context, credentialId })
    this.name = 'CredentialNotFoundError'
  }
}

export class CredentialExpiredError extends CredentialError {
  constructor(credentialId: string, expiresAt: string, context?: ErrorContext) {
    super(`Credential expired: ${credentialId} at ${expiresAt}`, {
      ...context,
      credentialId,
      expiresAt,
    })
    this.name = 'CredentialExpiredError'
  }
}

export class CredentialRevokedError extends CredentialError {
  constructor(credentialId: string, revokedAt: string, context?: ErrorContext) {
    super(`Credential revoked: ${credentialId} at ${revokedAt}`, {
      ...context,
      credentialId,
      revokedAt,
    })
    this.name = 'CredentialRevokedError'
  }
}

export class CredentialSignatureInvalidError extends CredentialError {
  constructor(credentialId: string, context?: ErrorContext) {
    super(`Invalid credential signature: ${credentialId}`, { ...context, credentialId })
    this.name = 'CredentialSignatureInvalidError'
  }
}

export class CredentialSchemaValidationError extends CredentialError {
  constructor(credentialId: string, schemaErrors: string[], context?: ErrorContext) {
    super(`Credential schema validation failed: ${credentialId}`, {
      ...context,
      credentialId,
      schemaErrors,
    })
    this.name = 'CredentialSchemaValidationError'
  }
}

export class CredentialIssuerNotTrustedError extends CredentialError {
  constructor(issuerDid: string, context?: ErrorContext) {
    super(`Credential issuer not trusted: ${issuerDid}`, { ...context, issuerDid })
    this.name = 'CredentialIssuerNotTrustedError'
  }
}
