export type ErrorCode = string & { __brand?: 'ErrorCode' }

export interface ErrorContext {
  [key: string]: unknown
  cause?: Error
  timestamp?: number
  requestId?: string
  component?: string
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly context: ErrorContext
  public readonly timestamp: number

  constructor(code: string, message: string, context?: ErrorContext) {
    super(message)
    this.name = 'AppError'
    this.code = code as ErrorCode
    this.timestamp = Date.now()
    this.context = { ...context, timestamp: this.timestamp }

    if (context?.cause && context.cause instanceof Error) {
      this.cause = context.cause
    }

    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    }
  }

  static fromJSON(json: Record<string, unknown>): AppError {
    const err = new AppError(
      json.code as string,
      json.message as string,
      json.context as ErrorContext,
    )
    if (json.stack) err.stack = json.stack as string
    return err
  }
}
