export type JWTAlgorithm = 'HS256' | 'HS384' | 'HS512' | 'ES256' | 'ES384' | 'ES512' | 'EdDSA' | 'RS256' | 'RS384' | 'RS512'

export interface JWTValidationOptions {
  algorithms?: JWTAlgorithm[]
  audience?: string | string[]
  issuer?: string
  subject?: string
  maxAgeMs?: number
  clockToleranceMs?: number
  requiredClaims?: string[]
}

export interface JWTValidationResult {
  valid: boolean
  errors: JWTValidationError[]
  warnings: string[]
  header?: Record<string, unknown>
  payload?: Record<string, unknown>
}

export interface JWTValidationError {
  field: string
  message: string
  code: string
}

const JWT_PART_REGEX = /^[A-Za-z0-9\-_]+$/
const SUPPORTED_ALGORITHMS: JWTAlgorithm[] = ['HS256', 'HS384', 'HS512', 'ES256', 'ES384', 'ES512', 'EdDSA', 'RS256', 'RS384', 'RS512']

export class JWTValidator {
  validate(token: string, options?: JWTValidationOptions): JWTValidationResult {
    const errors: JWTValidationError[] = []
    const warnings: string[] = []

    if (typeof token !== 'string' || token.trim().length === 0) {
      errors.push({
        field: 'token',
        message: 'JWT token must be a non-empty string',
        code: 'INVALID_TOKEN_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const parts = token.split('.')
    if (parts.length !== 3) {
      errors.push({
        field: 'token',
        message: 'JWT must have exactly 3 dot-separated parts',
        code: 'INVALID_PARTS_COUNT',
      })
      return { valid: false, errors, warnings }
    }

    for (let i = 0; i < 3; i++) {
      if (!parts[i] || parts[i]!.length === 0) {
        errors.push({
          field: `token.part[${i}]`,
          message: `JWT part ${i} must not be empty`,
          code: 'EMPTY_PART',
        })
      }
      if (parts[i] && !JWT_PART_REGEX.test(parts[i]!)) {
        errors.push({
          field: `token.part[${i}]`,
          message: `JWT part ${i} contains invalid base64url characters`,
          code: 'INVALID_BASE64URL',
        })
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings }
    }

    let header: Record<string, unknown>
    let payload: Record<string, unknown>
    try {
      header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf-8'))
      payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'))
    } catch {
      errors.push({
        field: 'token',
        message: 'Failed to decode JWT parts as JSON',
        code: 'DECODE_FAILED',
      })
      return { valid: false, errors, warnings }
    }

    this.validateHeader(header, errors, options)
    this.validatePayload(payload, errors, warnings, options)

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      header,
      payload,
    }
  }

  private validateHeader(header: Record<string, unknown>, errors: JWTValidationError[], options?: JWTValidationOptions): void {
    if (!header.alg || typeof header.alg !== 'string') {
      errors.push({
        field: 'header.alg',
        message: 'JWT header must contain an alg field',
        code: 'MISSING_ALG',
      })
      return
    }

    if (!SUPPORTED_ALGORITHMS.includes(header.alg as JWTAlgorithm)) {
      errors.push({
        field: 'header.alg',
        message: `Unsupported algorithm: ${header.alg}`,
        code: 'UNSUPPORTED_ALG',
      })
      return
    }

    if (options?.algorithms && options.algorithms.length > 0) {
      if (!options.algorithms.includes(header.alg as JWTAlgorithm)) {
        errors.push({
          field: 'header.alg',
          message: `Algorithm ${header.alg} is not in the allowed list`,
          code: 'ALG_NOT_ALLOWED',
        })
      }
    }

    if (!header.typ || header.typ !== 'JWT') {
      warnings.push('JWT header typ is missing or not set to JWT')
    }

    if (header.kid !== undefined && typeof header.kid !== 'string') {
      errors.push({
        field: 'header.kid',
        message: 'kid must be a string if present',
        code: 'INVALID_KID',
      })
    }
  }

  private validatePayload(payload: Record<string, unknown>, errors: JWTValidationError[], warnings: string[], options?: JWTValidationOptions): void {
    if (options?.requiredClaims) {
      for (const claim of options.requiredClaims) {
        if (!(claim in payload)) {
          errors.push({
            field: `payload.${claim}`,
            message: `Required claim '${claim}' is missing`,
            code: 'MISSING_CLAIM',
          })
        }
      }
    }

    if (options?.issuer && payload.iss !== options.issuer) {
      errors.push({
        field: 'payload.iss',
        message: `Issuer mismatch: expected ${options.issuer}, got ${payload.iss}`,
        code: 'ISSUER_MISMATCH',
      })
    }

    if (options?.subject && payload.sub !== options.subject) {
      errors.push({
        field: 'payload.sub',
        message: `Subject mismatch: expected ${options.subject}, got ${payload.sub}`,
        code: 'SUBJECT_MISMATCH',
      })
    }

    if (options?.audience) {
      const aud = payload.aud
      if (!aud) {
        errors.push({
          field: 'payload.aud',
          message: 'Audience claim is required but missing',
          code: 'MISSING_AUDIENCE',
        })
      } else {
        const audiences = Array.isArray(aud) ? aud : [aud]
        const expected = Array.isArray(options.audience) ? options.audience : [options.audience]
        const hasMatch = expected.some((e) => audiences.includes(e))
        if (!hasMatch) {
          errors.push({
            field: 'payload.aud',
            message: `Audience mismatch: expected one of ${expected.join(', ')}`,
            code: 'AUDIENCE_MISMATCH',
          })
        }
      }
    }

    const now = Date.now()
    const clockTolerance = options?.clockToleranceMs ?? 0

    if (payload.iat !== undefined) {
      if (typeof payload.iat !== 'number') {
        errors.push({
          field: 'payload.iat',
          message: 'iat must be a numeric timestamp',
          code: 'INVALID_IAT',
        })
      }
    }

    if (payload.nbf !== undefined) {
      if (typeof payload.nbf !== 'number') {
        errors.push({
          field: 'payload.nbf',
          message: 'nbf must be a numeric timestamp',
          code: 'INVALID_NBF',
        })
      } else {
        const nbfTime = payload.nbf * 1000
        if (now + clockTolerance < nbfTime) {
          errors.push({
            field: 'payload.nbf',
            message: 'Token is not yet valid (nbf)',
            code: 'TOKEN_NOT_YET_VALID',
          })
        }
      }
    }

    if (payload.exp !== undefined) {
      if (typeof payload.exp !== 'number') {
        errors.push({
          field: 'payload.exp',
          message: 'exp must be a numeric timestamp',
          code: 'INVALID_EXP',
        })
      } else {
        const expTime = payload.exp * 1000
        if (now > expTime + clockTolerance) {
          errors.push({
            field: 'payload.exp',
            message: 'Token has expired',
            code: 'TOKEN_EXPIRED',
          })
        }
      }
    }

    if (options?.maxAgeMs && payload.iat) {
      if (typeof payload.iat === 'number') {
        const maxAge = payload.iat * 1000 + options.maxAgeMs
        if (now > maxAge + clockTolerance) {
          errors.push({
            field: 'payload.iat',
            message: 'Token has exceeded maximum age',
            code: 'MAX_AGE_EXCEEDED',
          })
        }
      }
    }

    if (payload.jti !== undefined && typeof payload.jti !== 'string') {
      errors.push({
        field: 'payload.jti',
        message: 'jti must be a string if present',
        code: 'INVALID_JTI',
      })
    }
  }
}

export function validateJWT(token: string, options?: JWTValidationOptions): JWTValidationResult {
  return new JWTValidator().validate(token, options)
}
