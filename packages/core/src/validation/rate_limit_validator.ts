export type RateLimitStrategy = 'token_bucket' | 'leaky_bucket' | 'fixed_window' | 'sliding_window' | 'concurrent'

export interface RateLimitConfig {
  strategy: RateLimitStrategy
  maxRequests: number
  windowMs: number
  maxConcurrent?: number
  burstSize?: number
  refillRate?: number
  refillIntervalMs?: number
  keyPrefix?: string
}

export interface RateLimitValidationResult {
  valid: boolean
  errors: RateLimitValidationError[]
  warnings: string[]
}

export interface RateLimitValidationError {
  field: string
  message: string
  code: string
}

const VALID_STRATEGIES: RateLimitStrategy[] = ['token_bucket', 'leaky_bucket', 'fixed_window', 'sliding_window', 'concurrent']

export class RateLimitValidator {
  validate(config: unknown): RateLimitValidationResult {
    const errors: RateLimitValidationError[] = []
    const warnings: string[] = []

    if (!config || typeof config !== 'object') {
      errors.push({
        field: 'root',
        message: 'Rate limit config must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const cfg = config as Record<string, unknown>

    this.validateStrategy(cfg.strategy, errors)
    this.validateMaxRequests(cfg.maxRequests, errors)
    this.validateWindowMs(cfg.windowMs, errors)
    this.validateMaxConcurrent(cfg.strategy as RateLimitStrategy | undefined, cfg.maxConcurrent, errors, warnings)
    this.validateBurstSize(cfg.strategy as RateLimitStrategy | undefined, cfg.burstSize, cfg.maxRequests, errors, warnings)
    this.validateRefillConfig(cfg, errors, warnings)

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateStrategy(strategy: unknown, errors: RateLimitValidationError[]): void {
    if (!strategy || typeof strategy !== 'string') {
      errors.push({
        field: 'strategy',
        message: 'Rate limit strategy is required',
        code: 'MISSING_STRATEGY',
      })
      return
    }

    if (!VALID_STRATEGIES.includes(strategy as RateLimitStrategy)) {
      errors.push({
        field: 'strategy',
        message: `Strategy must be one of: ${VALID_STRATEGIES.join(', ')}`,
        code: 'INVALID_STRATEGY',
      })
    }
  }

  private validateMaxRequests(maxRequests: unknown, errors: RateLimitValidationError[]): void {
    if (maxRequests === undefined || maxRequests === null) {
      errors.push({
        field: 'maxRequests',
        message: 'maxRequests is required',
        code: 'MISSING_MAX_REQUESTS',
      })
      return
    }

    if (typeof maxRequests !== 'number' || !Number.isInteger(maxRequests) || maxRequests < 1) {
      errors.push({
        field: 'maxRequests',
        message: 'maxRequests must be a positive integer',
        code: 'INVALID_MAX_REQUESTS',
      })
    }
  }

  private validateWindowMs(windowMs: unknown, errors: RateLimitValidationError[]): void {
    if (windowMs === undefined || windowMs === null) {
      errors.push({
        field: 'windowMs',
        message: 'windowMs is required',
        code: 'MISSING_WINDOW_MS',
      })
      return
    }

    if (typeof windowMs !== 'number' || !Number.isInteger(windowMs) || windowMs < 1) {
      errors.push({
        field: 'windowMs',
        message: 'windowMs must be a positive integer',
        code: 'INVALID_WINDOW_MS',
      })
    }

    if (windowMs !== undefined && typeof windowMs === 'number' && windowMs > 86400000) {
      errors.push({
        field: 'windowMs',
        message: 'windowMs must not exceed 24 hours (86400000ms)',
        code: 'WINDOW_TOO_LARGE',
      })
    }
  }

  private validateMaxConcurrent(strategy: RateLimitStrategy | undefined, maxConcurrent: unknown, errors: RateLimitValidationError[], warnings: string[]): void {
    if (maxConcurrent === undefined) {
      if (strategy === 'concurrent') {
        errors.push({
          field: 'maxConcurrent',
          message: 'maxConcurrent is required for concurrent strategy',
          code: 'MISSING_MAX_CONCURRENT',
        })
      }
      return
    }

    if (typeof maxConcurrent !== 'number' || !Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      errors.push({
        field: 'maxConcurrent',
        message: 'maxConcurrent must be a positive integer',
        code: 'INVALID_MAX_CONCURRENT',
      })
    }

    if (strategy !== 'concurrent' && maxConcurrent !== undefined) {
      warnings.push('maxConcurrent is only used with concurrent strategy')
    }
  }

  private validateBurstSize(strategy: RateLimitStrategy | undefined, burstSize: unknown, maxRequests: unknown, errors: RateLimitValidationError[], warnings: string[]): void {
    if (burstSize === undefined) return

    if (typeof burstSize !== 'number' || !Number.isInteger(burstSize) || burstSize < 1) {
      errors.push({
        field: 'burstSize',
        message: 'burstSize must be a positive integer if provided',
        code: 'INVALID_BURST_SIZE',
      })
      return
    }

    if (typeof maxRequests === 'number' && burstSize < maxRequests) {
      warnings.push('burstSize should typically be >= maxRequests for effective bursting')
    }

    if (strategy !== 'token_bucket' && strategy !== 'leaky_bucket') {
      warnings.push('burstSize is typically used with token_bucket or leaky_bucket strategies')
    }
  }

  private validateRefillConfig(cfg: Record<string, unknown>, errors: RateLimitValidationError[], warnings: string[]): void {
    if (cfg.refillRate !== undefined) {
      if (typeof cfg.refillRate !== 'number' || cfg.refillRate <= 0) {
        errors.push({
          field: 'refillRate',
          message: 'refillRate must be a positive number if provided',
          code: 'INVALID_REFILL_RATE',
        })
      }
    }

    if (cfg.refillIntervalMs !== undefined) {
      if (typeof cfg.refillIntervalMs !== 'number' || !Number.isInteger(cfg.refillIntervalMs) || cfg.refillIntervalMs < 1) {
        errors.push({
          field: 'refillIntervalMs',
          message: 'refillIntervalMs must be a positive integer if provided',
          code: 'INVALID_REFILL_INTERVAL',
        })
      }
    }

    if ((cfg.refillRate !== undefined) !== (cfg.refillIntervalMs !== undefined)) {
      warnings.push('refillRate and refillIntervalMs should typically be provided together')
    }

    if (cfg.keyPrefix !== undefined && (typeof cfg.keyPrefix !== 'string' || cfg.keyPrefix.trim().length === 0)) {
      errors.push({
        field: 'keyPrefix',
        message: 'keyPrefix must be a non-empty string if provided',
        code: 'INVALID_KEY_PREFIX',
      })
    }
  }
}

export function validateRateLimitConfig(config: unknown): RateLimitValidationResult {
  return new RateLimitValidator().validate(config)
}
