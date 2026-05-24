import { AppError, type ErrorContext } from './base.js'

export class PQCError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('PQC_ERROR', message, context)
    this.name = 'PQCError'
  }
}

export class PQCKeyGenerationError extends PQCError {
  constructor(algorithm: string, reason: string, context?: ErrorContext) {
    super(`PQC key generation failed for ${algorithm}: ${reason}`, {
      ...context,
      algorithm,
      reason,
    })
    this.name = 'PQCKeyGenerationError'
  }
}

export class PQCEncryptionError extends PQCError {
  constructor(algorithm: string, reason: string, context?: ErrorContext) {
    super(`PQC encryption failed for ${algorithm}: ${reason}`, {
      ...context,
      algorithm,
      reason,
    })
    this.name = 'PQCEncryptionError'
  }
}

export class PQCProofError extends PQCError {
  constructor(protocol: string, reason: string, context?: ErrorContext) {
    super(`PQC proof operation failed for ${protocol}: ${reason}`, {
      ...context,
      protocol,
      reason,
    })
    this.name = 'PQCProofError'
  }
}

export class PQCParameterInvalidError extends PQCError {
  constructor(algorithm: string, paramErrors: string[], context?: ErrorContext) {
    super(`Invalid PQC parameters for ${algorithm}`, {
      ...context,
      algorithm,
      paramErrors,
    })
    this.name = 'PQCParameterInvalidError'
  }
}

export class PQCAlgorithmNotSupportedError extends PQCError {
  constructor(algorithm: string, context?: ErrorContext) {
    super(`PQC algorithm not supported: ${algorithm}`, {
      ...context,
      algorithm,
    })
    this.name = 'PQCAlgorithmNotSupportedError'
  }
}

export class PQCSecurityLevelInsufficientError extends PQCError {
  constructor(algorithm: string, level: number, minimum: number, context?: ErrorContext) {
    super(`PQC security level insufficient for ${algorithm}: ${level} < ${minimum}`, {
      ...context,
      algorithm,
      level,
      minimum,
    })
    this.name = 'PQCSecurityLevelInsufficientError'
  }
}
