import { AppError, type ErrorContext } from './base.js'

export class DIDError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('DID_ERROR', message, context)
    this.name = 'DIDError'
  }
}

export class DIDNotFoundError extends DIDError {
  constructor(did: string, context?: ErrorContext) {
    super(`DID not found: ${did}`, { ...context, did })
    this.name = 'DIDNotFoundError'
  }
}

export class DIDMethodNotSupportedError extends DIDError {
  constructor(method: string, context?: ErrorContext) {
    super(`DID method not supported: ${method}`, { ...context, method })
    this.name = 'DIDMethodNotSupportedError'
  }
}

export class DIDResolutionFailedError extends DIDError {
  constructor(did: string, reason: string, context?: ErrorContext) {
    super(`DID resolution failed for ${did}: ${reason}`, { ...context, did, reason })
    this.name = 'DIDResolutionFailedError'
  }
}

export class DIDDeactivatedError extends DIDError {
  constructor(did: string, context?: ErrorContext) {
    super(`DID is deactivated: ${did}`, { ...context, did })
    this.name = 'DIDDeactivatedError'
  }
}

export class DIDDocumentInvalidError extends DIDError {
  constructor(did: string, validationErrors: string[], context?: ErrorContext) {
    super(`Invalid DID document: ${did}`, { ...context, did, validationErrors })
    this.name = 'DIDDocumentInvalidError'
  }
}

export class DIDKeyNotFoundError extends DIDError {
  constructor(did: string, keyId: string, context?: ErrorContext) {
    super(`Key not found in DID document: ${did}/${keyId}`, {
      ...context,
      did,
      keyId,
    })
    this.name = 'DIDKeyNotFoundError'
  }
}
