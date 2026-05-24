import { AppError, type ErrorContext } from './base.js'

export class TEEError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('TEE_ERROR', message, context)
    this.name = 'TEEError'
  }
}

export class TEEAttestationError extends TEEError {
  constructor(enclaveId: string, reason: string, context?: ErrorContext) {
    super(`TEE attestation failed for ${enclaveId}: ${reason}`, {
      ...context,
      enclaveId,
      reason,
    })
    this.name = 'TEEAttestationError'
  }
}

export class TEEEnclaveCreationError extends TEEError {
  constructor(reason: string, context?: ErrorContext) {
    super(`TEE enclave creation failed: ${reason}`, {
      ...context,
      reason,
    })
    this.name = 'TEEEnclaveCreationError'
  }
}

export class TEESealError extends TEEError {
  constructor(operation: string, reason: string, context?: ErrorContext) {
    super(`TEE seal operation ${operation} failed: ${reason}`, {
      ...context,
      operation,
      reason,
    })
    this.name = 'TEESealError'
  }
}

export class TEEUnsealError extends TEEError {
  constructor(operation: string, reason: string, context?: ErrorContext) {
    super(`TEE unseal operation ${operation} failed: ${reason}`, {
      ...context,
      operation,
      reason,
    })
    this.name = 'TEEUnsealError'
  }
}

export class TEEMemoryEncryptionError extends TEEError {
  constructor(reason: string, context?: ErrorContext) {
    super(`TEE memory encryption error: ${reason}`, {
      ...context,
      reason,
    })
    this.name = 'TEEMemoryEncryptionError'
  }
}

export class TEEQuoteVerificationError extends TEEError {
  constructor(reason: string, context?: ErrorContext) {
    super(`TEE quote verification failed: ${reason}`, {
      ...context,
      reason,
    })
    this.name = 'TEEQuoteVerificationError'
  }
}

export class TEERemoteAttestationError extends TEEError {
  constructor(targetEnclaveId: string, reason: string, context?: ErrorContext) {
    super(`TEE remote attestation failed for ${targetEnclaveId}: ${reason}`, {
      ...context,
      targetEnclaveId,
      reason,
    })
    this.name = 'TEERemoteAttestationError'
  }
}
