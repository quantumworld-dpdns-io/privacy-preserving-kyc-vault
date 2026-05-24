import { AppError, type ErrorContext } from './base.js'

export class KYCError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('KYC_ERROR', message, context)
    this.name = 'KYCError'
  }
}

export class KYCWorkflowNotFoundError extends KYCError {
  constructor(workflowId: string, context?: ErrorContext) {
    super(`KYC workflow not found: ${workflowId}`, { ...context, workflowId })
    this.name = 'KYCWorkflowNotFoundError'
  }
}

export class KYCWorkflowStateError extends KYCError {
  constructor(workflowId: string, currentState: string, expectedState: string, context?: ErrorContext) {
    super(`Invalid KYC workflow state transition for ${workflowId}: ${currentState} -> ${expectedState}`, {
      ...context,
      workflowId,
      currentState,
      expectedState,
    })
    this.name = 'KYCWorkflowStateError'
  }
}

export class KYCDocumentRejectedError extends KYCError {
  constructor(documentId: string, reason: string, context?: ErrorContext) {
    super(`KYC document rejected: ${documentId} - ${reason}`, {
      ...context,
      documentId,
      reason,
    })
    this.name = 'KYCDocumentRejectedError'
  }
}

export class KYCVerificationFailedError extends KYCError {
  constructor(subjectId: string, checksFailed: string[], context?: ErrorContext) {
    super(`KYC verification failed for ${subjectId}`, {
      ...context,
      subjectId,
      checksFailed,
    })
    this.name = 'KYCVerificationFailedError'
  }
}

export class KYCThresholdNotMetError extends KYCError {
  constructor(level: string, score: number, threshold: number, context?: ErrorContext) {
    super(`KYC trust threshold not met for level ${level}: ${score} < ${threshold}`, {
      ...context,
      level,
      score,
      threshold,
    })
    this.name = 'KYCThresholdNotMetError'
  }
}

export class KYCProviderError extends KYCError {
  constructor(provider: string, providerMessage: string, context?: ErrorContext) {
    super(`KYC provider error from ${provider}: ${providerMessage}`, {
      ...context,
      provider,
      providerMessage,
    })
    this.name = 'KYCProviderError'
  }
}

export class KYCAMLMatchError extends KYCError {
  constructor(subjectId: string, matchDetails: string[], context?: ErrorContext) {
    super(`AML match detected for ${subjectId}`, {
      ...context,
      subjectId,
      matchDetails,
    })
    this.name = 'KYCAMLMatchError'
  }
}
