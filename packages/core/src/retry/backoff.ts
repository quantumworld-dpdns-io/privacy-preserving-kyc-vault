export type BackoffStrategy = 'exponential' | 'linear' | 'fibonacci' | 'decorrelated'

export interface BackoffOptions {
  baseDelayMs: number
  maxDelayMs: number
  strategy: BackoffStrategy
  jitterFactor: number
  multiplier: number
}

export function computeBackoff(
  attempt: number,
  options: Partial<BackoffOptions> = {},
): number {
  const {
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    strategy = 'exponential',
    jitterFactor = 0.1,
    multiplier = 2,
  } = options

  let delay: number

  switch (strategy) {
    case 'linear': {
      delay = baseDelayMs * (attempt + 1)
      break
    }
    case 'fibonacci': {
      delay = baseDelayMs * fibonacci(attempt + 1)
      break
    }
    case 'decorrelated': {
      const cap = Math.min(baseDelayMs * Math.pow(multiplier, attempt), maxDelayMs)
      delay = (baseDelayMs + Math.random() * (cap - baseDelayMs)) * multiplier
      break
    }
    case 'exponential':
    default: {
      delay = baseDelayMs * Math.pow(multiplier, attempt)
      break
    }
  }

  delay = Math.min(delay, maxDelayMs)

  if (jitterFactor > 0) {
    const jitterRange = delay * jitterFactor
    delay = delay + (Math.random() * 2 - 1) * jitterRange
    delay = Math.max(0, Math.min(delay, maxDelayMs))
  }

  return Math.round(delay)
}

function fibonacci(n: number): number {
  if (n <= 1) return n
  let a = 0
  let b = 1
  for (let i = 2; i <= n; i++) {
    const c = a + b
    a = b
    b = c
  }
  return b
}

export function fullJitter(delay: number): number {
  return Math.round(Math.random() * delay)
}

export function equalJitter(delay: number): number {
  const half = delay / 2
  return Math.round(half + Math.random() * half)
}

export function decorrelatedJitter(
  baseDelay: number,
  previousDelay: number,
  maxDelay: number,
): number {
  const min = baseDelay
  const max = Math.min(previousDelay * 3, maxDelay)
  return Math.round(min + Math.random() * (max - min))
}
