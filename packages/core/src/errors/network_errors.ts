import { AppError, type ErrorContext } from './base.js'

export class NetworkError extends AppError {
  public readonly statusCode?: number
  public readonly retryable: boolean

  constructor(message: string, context?: ErrorContext & { statusCode?: number; retryable?: boolean }) {
    super('NETWORK_ERROR', message, context)
    this.name = 'NetworkError'
    this.statusCode = context?.statusCode
    this.retryable = context?.retryable ?? false
  }
}

export class NetworkTimeoutError extends NetworkError {
  constructor(url: string, timeoutMs: number, context?: ErrorContext) {
    super(`Network timeout for ${url} after ${timeoutMs}ms`, {
      ...context,
      url,
      timeoutMs,
      retryable: true,
    })
    this.name = 'NetworkTimeoutError'
  }
}

export class NetworkConnectionError extends NetworkError {
  constructor(url: string, reason: string, context?: ErrorContext) {
    super(`Network connection failed for ${url}: ${reason}`, {
      ...context,
      url,
      reason,
      retryable: true,
    })
    this.name = 'NetworkConnectionError'
  }
}

export class NetworkDnsError extends NetworkError {
  constructor(hostname: string, reason: string, context?: ErrorContext) {
    super(`DNS resolution failed for ${hostname}: ${reason}`, {
      ...context,
      hostname,
      reason,
      retryable: true,
    })
    this.name = 'NetworkDnsError'
  }
}

export class NetworkTlsError extends NetworkError {
  constructor(hostname: string, reason: string, context?: ErrorContext) {
    super(`TLS handshake failed for ${hostname}: ${reason}`, {
      ...context,
      hostname,
      reason,
      retryable: false,
    })
    this.name = 'NetworkTlsError'
  }
}

export class NetworkRateLimitError extends NetworkError {
  constructor(url: string, retryAfterMs: number, context?: ErrorContext) {
    super(`Rate limited by ${url}`, {
      ...context,
      url,
      retryAfterMs,
      retryable: true,
    })
    this.name = 'NetworkRateLimitError'
    this.statusCode = 429
  }
}

export class NetworkHttpError extends NetworkError {
  constructor(url: string, statusCode: number, statusText: string, context?: ErrorContext) {
    super(`HTTP ${statusCode} ${statusText} for ${url}`, {
      ...context,
      url,
      statusCode,
      retryable: statusCode >= 500 || statusCode === 429,
    })
    this.name = 'NetworkHttpError'
    this.statusCode = statusCode
  }
}

export class NetworkDnsOverHttpsError extends NetworkError {
  constructor(reason: string, context?: ErrorContext) {
    super(`DNS-over-HTTPS query failed: ${reason}`, {
      ...context,
      reason,
      retryable: true,
    })
    this.name = 'NetworkDnsOverHttpsError'
  }
}
