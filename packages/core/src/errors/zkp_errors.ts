import { AppError, type ErrorContext } from './base.js'

export class ZKPError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('ZKP_ERROR', message, context)
    this.name = 'ZKPError'
  }
}

export class ZKPProofGenerationError extends ZKPError {
  constructor(circuitId: string, reason: string, context?: ErrorContext) {
    super(`ZKP proof generation failed for ${circuitId}: ${reason}`, {
      ...context,
      circuitId,
      reason,
    })
    this.name = 'ZKPProofGenerationError'
  }
}

export class ZKPProofVerificationError extends ZKPError {
  constructor(proofId: string, reason: string, context?: ErrorContext) {
    super(`ZKP proof verification failed for ${proofId}: ${reason}`, {
      ...context,
      proofId,
      reason,
    })
    this.name = 'ZKPProofVerificationError'
  }
}

export class ZKPCircuitCompilationError extends ZKPError {
  constructor(circuitId: string, compileErrors: string[], context?: ErrorContext) {
    super(`ZKP circuit compilation failed for ${circuitId}`, {
      ...context,
      circuitId,
      compileErrors,
    })
    this.name = 'ZKPCircuitCompilationError'
  }
}

export class ZKPWitnessGenerationError extends ZKPError {
  constructor(circuitId: string, inputErrors: string[], context?: ErrorContext) {
    super(`ZKP witness generation failed for ${circuitId}`, {
      ...context,
      circuitId,
      inputErrors,
    })
    this.name = 'ZKPWitnessGenerationError'
  }
}

export class ZKPCrsNotFoundError extends ZKPError {
  constructor(circuitId: string, context?: ErrorContext) {
    super(`ZKP CRS not found for circuit: ${circuitId}`, {
      ...context,
      circuitId,
    })
    this.name = 'ZKPCrsNotFoundError'
  }
}

export class ZKPInvalidPublicInputsError extends ZKPError {
  constructor(circuitId: string, validationErrors: string[], context?: ErrorContext) {
    super(`Invalid ZKP public inputs for ${circuitId}`, {
      ...context,
      circuitId,
      validationErrors,
    })
    this.name = 'ZKPInvalidPublicInputsError'
  }
}
