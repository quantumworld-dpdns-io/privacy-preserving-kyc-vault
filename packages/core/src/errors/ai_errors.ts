import { AppError, type ErrorContext } from './base.js'

export class AIError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('AI_ERROR', message, context)
    this.name = 'AIError'
  }
}

export class AIModelLoadError extends AIError {
  constructor(modelId: string, reason: string, context?: ErrorContext) {
    super(`Failed to load AI model ${modelId}: ${reason}`, {
      ...context,
      modelId,
      reason,
    })
    this.name = 'AIModelLoadError'
  }
}

export class AIInferenceTimeoutError extends AIError {
  constructor(modelId: string, timeoutMs: number, context?: ErrorContext) {
    super(`AI inference timed out for ${modelId} after ${timeoutMs}ms`, {
      ...context,
      modelId,
      timeoutMs,
    })
    this.name = 'AIInferenceTimeoutError'
  }
}

export class AIInferenceFailedError extends AIError {
  constructor(modelId: string, reason: string, context?: ErrorContext) {
    super(`AI inference failed for ${modelId}: ${reason}`, {
      ...context,
      modelId,
      reason,
    })
    this.name = 'AIInferenceFailedError'
  }
}

export class AIOutputValidationError extends AIError {
  constructor(modelId: string, validationErrors: string[], context?: ErrorContext) {
    super(`AI output validation failed for ${modelId}`, {
      ...context,
      modelId,
      validationErrors,
    })
    this.name = 'AIOutputValidationError'
  }
}

export class AIBiasDetectionError extends AIError {
  constructor(modelId: string, biasFlags: string[], context?: ErrorContext) {
    super(`AI bias detected in model ${modelId}: ${biasFlags.join(', ')}`, {
      ...context,
      modelId,
      biasFlags,
    })
    this.name = 'AIBiasDetectionError'
  }
}

export class AIModelNotAvailableError extends AIError {
  constructor(modelId: string, context?: ErrorContext) {
    super(`AI model not available: ${modelId}`, {
      ...context,
      modelId,
    })
    this.name = 'AIModelNotAvailableError'
  }
}

export class AIQuotaExceededError extends AIError {
  constructor(modelId: string, quota: number, usage: number, context?: ErrorContext) {
    super(`AI inference quota exceeded for ${modelId}: ${usage}/${quota}`, {
      ...context,
      modelId,
      quota,
      usage,
    })
    this.name = 'AIQuotaExceededError'
  }
}
