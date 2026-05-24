export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  failureThreshold: number
  successThreshold: number
  timeoutMs: number
  halfOpenMaxRequests?: number
  monitorIntervalMs?: number
}

export interface CircuitBreakerStats {
  state: CircuitState
  failureCount: number
  successCount: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
  openedAt: number | null
  halfOpenAt: number | null
  totalFailures: number
  totalSuccesses: number
  totalTimeouts: number
  totalShortCircuits: number
}

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private successCount = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private openedAt: number | null = null
  private halfOpenAt: number | null = null
  private totalFailures = 0
  private totalSuccesses = 0
  private totalTimeouts = 0
  private totalShortCircuits = 0
  private halfOpenRequests = 0
  private readonly failureThreshold: number
  private readonly successThreshold: number
  private readonly timeoutMs: number
  private readonly halfOpenMaxRequests: number
  private readonly monitorIntervalMs: number
  private monitorTimer: ReturnType<typeof setInterval> | null = null
  private onStateChange?: (from: CircuitState, to: CircuitState) => void

  constructor(options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold
    this.successThreshold = options.successThreshold
    this.timeoutMs = options.timeoutMs
    this.halfOpenMaxRequests = options.halfOpenMaxRequests ?? 1
    this.monitorIntervalMs = options.monitorIntervalMs ?? 0
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open')
      } else {
        this.totalShortCircuits++
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open for ${this.timeoutMs}ms`,
        )
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  onSuccess(): void {
    this.lastSuccessTime = Date.now()
    this.totalSuccesses++

    if (this.state === 'half-open') {
      this.successCount++
      this.halfOpenRequests = 0
      if (this.successCount >= this.successThreshold) {
        this.reset()
      }
    } else if (this.state === 'closed') {
      this.failureCount = Math.max(0, this.failureCount - 1)
    }
  }

  onFailure(): void {
    this.lastFailureTime = Date.now()
    this.totalFailures++
    this.halfOpenRequests = 0

    if (this.state === 'half-open') {
      this.transitionTo('open')
      return
    }

    this.failureCount++
    if (this.state === 'closed' && this.failureCount >= this.failureThreshold) {
      this.transitionTo('open')
    }
  }

  onTimeout(): void {
    this.totalTimeouts++
    this.onFailure()
  }

  private shouldAttemptReset(): boolean {
    if (!this.openedAt) return false
    return Date.now() - this.openedAt >= this.timeoutMs
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state
    this.state = newState

    if (newState === 'open') {
      this.failureCount = 0
      this.successCount = 0
      this.openedAt = Date.now()
      this.halfOpenAt = null
      if (this.monitorIntervalMs > 0) {
        this.startMonitor()
      }
    } else if (newState === 'half-open') {
      this.failureCount = 0
      this.successCount = 0
      this.halfOpenAt = Date.now()
      this.halfOpenRequests = 0
      this.stopMonitor()
    }

    this.onStateChange?.(oldState, newState)
  }

  private reset(): void {
    const oldState = this.state
    this.state = 'closed'
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.openedAt = null
    this.halfOpenAt = null
    this.halfOpenRequests = 0
    this.stopMonitor()
    this.onStateChange?.(oldState, 'closed')
  }

  private startMonitor(): void {
    this.stopMonitor()
    this.monitorTimer = setInterval(() => {
      if (this.state === 'open' && this.shouldAttemptReset()) {
        this.transitionTo('half-open')
      }
    }, this.monitorIntervalMs)
  }

  private stopMonitor(): void {
    if (this.monitorTimer !== null) {
      clearInterval(this.monitorTimer)
      this.monitorTimer = null
    }
  }

  getState(): CircuitState {
    return this.state
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      halfOpenAt: this.halfOpenAt,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      totalTimeouts: this.totalTimeouts,
      totalShortCircuits: this.totalShortCircuits,
    }
  }

  onStateChangeHandler(handler: (from: CircuitState, to: CircuitState) => void): void {
    this.onStateChange = handler
  }

  destroy(): void {
    this.stopMonitor()
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitBreakerOpenError'
  }
}

export function circuitBreaker<T>(
  fn: () => Promise<T>,
  options: CircuitBreakerOptions,
): Promise<T> {
  const breaker = new CircuitBreaker(options)
  return breaker.execute(fn)
}
