export type RetryMode = 'fixed' | 'exponential' | 'linear' | 'immediate'

export interface RetryPolicyConfig {
  maxRetries: number
  mode: RetryMode
  baseDelayMs: number
  maxDelayMs: number
  timeoutMs?: number
  retryableStatusCodes?: number[]
  retryableErrorCodes?: string[]
  jitter: boolean
  jitterFactor?: number
}

export class RetryPolicy {
  public readonly maxRetries: number
  public readonly mode: RetryMode
  public readonly baseDelayMs: number
  public readonly maxDelayMs: number
  public readonly timeoutMs?: number
  public readonly retryableStatusCodes: ReadonlySet<number>
  public readonly retryableErrorCodes: ReadonlySet<string>
  public readonly jitter: boolean
  public readonly jitterFactor: number

  constructor(config: Partial<RetryPolicyConfig> = {}) {
    this.maxRetries = config.maxRetries ?? 3
    this.mode = config.mode ?? 'exponential'
    this.baseDelayMs = config.baseDelayMs ?? 1000
    this.maxDelayMs = config.maxDelayMs ?? 30000
    this.timeoutMs = config.timeoutMs
    this.retryableStatusCodes = new Set(config.retryableStatusCodes ?? [408, 429, 500, 502, 503, 504])
    this.retryableErrorCodes = new Set(config.retryableErrorCodes ?? [])
    this.jitter = config.jitter ?? true
    this.jitterFactor = config.jitterFactor ?? 0.1
  }

  getDelay(attempt: number): number {
    if (this.mode === 'immediate') return 0
    if (this.mode === 'fixed') return this.baseDelayMs

    let delay: number
    if (this.mode === 'linear') {
      delay = this.baseDelayMs * (attempt + 1)
    } else {
      delay = this.baseDelayMs * Math.pow(2, attempt)
    }

    return Math.min(delay, this.maxDelayMs)
  }

  shouldRetry(attempt: number, statusCode?: number, errorCode?: string): boolean {
    if (attempt >= this.maxRetries) return false
    if (statusCode !== undefined && !this.retryableStatusCodes.has(statusCode)) return false
    if (errorCode !== undefined && this.retryableErrorCodes.size > 0 && !this.retryableErrorCodes.has(errorCode)) return false
    return true
  }

  getTotalTimeoutMs(): number {
    if (this.timeoutMs !== undefined) return this.timeoutMs
    let total = 0
    for (let i = 0; i < this.maxRetries; i++) {
      total += this.getDelay(i)
    }
    return total
  }

  withConfig(overrides: Partial<RetryPolicyConfig>): RetryPolicy {
    return new RetryPolicy({
      maxRetries: this.maxRetries,
      mode: this.mode,
      baseDelayMs: this.baseDelayMs,
      maxDelayMs: this.maxDelayMs,
      timeoutMs: this.timeoutMs,
      retryableStatusCodes: Array.from(this.retryableStatusCodes),
      retryableErrorCodes: Array.from(this.retryableErrorCodes),
      jitter: this.jitter,
      jitterFactor: this.jitterFactor,
      ...overrides,
    })
  }

  static defaults: RetryPolicyConfig = {
    maxRetries: 3,
    mode: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitter: true,
    jitterFactor: 0.1,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  }
}
