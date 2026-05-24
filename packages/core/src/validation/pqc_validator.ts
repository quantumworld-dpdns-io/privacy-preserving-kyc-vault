export interface PQCParameterSet {
  algorithm: PQCAlgorithm
  variant?: string
  securityLevel?: number
  keySize?: number
  signatureSize?: number
  ephemeralKeySize?: number
  kemVariant?: string
}

export type PQCAlgorithm =
  | 'KYBER'
  | 'DILITHIUM'
  | 'FALCON'
  | 'SPHINCS_PLUS'
  | 'BIKE'
  | 'HQC'
  | 'NTRU_PRIME'
  | 'NTRU'

export interface PQCValidationResult {
  valid: boolean
  errors: PQCValidationError[]
  warnings: string[]
}

export interface PQCValidationError {
  field: string
  message: string
  code: string
}

const ALGORITHM_NAMES: PQCAlgorithm[] = [
  'KYBER',
  'DILITHIUM',
  'FALCON',
  'SPHINCS_PLUS',
  'BIKE',
  'HQC',
  'NTRU_PRIME',
  'NTRU',
]

const ALGORITHM_SECURITY_LEVELS: Record<PQCAlgorithm, { min: number; max: number }> = {
  KYBER: { min: 1, max: 5 },
  DILITHIUM: { min: 1, max: 5 },
  FALCON: { min: 1, max: 5 },
  SPHINCS_PLUS: { min: 1, max: 5 },
  BIKE: { min: 1, max: 5 },
  HQC: { min: 1, max: 5 },
  NTRU_PRIME: { min: 1, max: 5 },
  NTRU: { min: 1, max: 5 },
}

export class PQCValidator {
  validateParameterSet(input: unknown): PQCValidationResult {
    const errors: PQCValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'PQC parameter set must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const params = input as Record<string, unknown>

    this.validateAlgorithm(params.algorithm, errors)
    this.validateSecurityLevel(params.algorithm as PQCAlgorithm | undefined, params.securityLevel, errors, warnings)
    this.validateKeySizes(params, errors, warnings)

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateAlgorithm(algorithm: unknown, errors: PQCValidationError[]): void {
    if (!algorithm || typeof algorithm !== 'string') {
      errors.push({
        field: 'algorithm',
        message: 'PQC algorithm is required and must be a string',
        code: 'MISSING_ALGORITHM',
      })
      return
    }

    if (!ALGORITHM_NAMES.includes(algorithm as PQCAlgorithm)) {
      errors.push({
        field: 'algorithm',
        message: `Unsupported PQC algorithm: ${algorithm}. Supported: ${ALGORITHM_NAMES.join(', ')}`,
        code: 'UNSUPPORTED_ALGORITHM',
      })
    }
  }

  private validateSecurityLevel(algorithm: PQCAlgorithm | undefined, level: unknown, errors: PQCValidationError[], warnings: string[]): void {
    if (level === undefined) return
    if (typeof level !== 'number' || !Number.isInteger(level)) {
      errors.push({
        field: 'securityLevel',
        message: 'securityLevel must be an integer',
        code: 'INVALID_SECURITY_LEVEL_TYPE',
      })
      return
    }

    if (algorithm) {
      const bounds = ALGORITHM_SECURITY_LEVELS[algorithm]
      if (bounds && (level < bounds.min || level > bounds.max)) {
        errors.push({
          field: 'securityLevel',
          message: `securityLevel for ${algorithm} must be between ${bounds.min} and ${bounds.max}`,
          code: 'SECURITY_LEVEL_OUT_OF_RANGE',
        })
      }
    }
  }

  private validateKeySizes(params: Record<string, unknown>, errors: PQCValidationError[], warnings: string[]): void {
    if (params.keySize !== undefined) {
      if (typeof params.keySize !== 'number' || !Number.isInteger(params.keySize) || params.keySize <= 0) {
        errors.push({
          field: 'keySize',
          message: 'keySize must be a positive integer if provided',
          code: 'INVALID_KEY_SIZE',
        })
      }
    }

    if (params.signatureSize !== undefined) {
      if (typeof params.signatureSize !== 'number' || !Number.isInteger(params.signatureSize) || params.signatureSize <= 0) {
        errors.push({
          field: 'signatureSize',
          message: 'signatureSize must be a positive integer if provided',
          code: 'INVALID_SIGNATURE_SIZE',
        })
      }
    }

    if (params.ephemeralKeySize !== undefined) {
      if (typeof params.ephemeralKeySize !== 'number' || !Number.isInteger(params.ephemeralKeySize) || params.ephemeralKeySize <= 0) {
        errors.push({
          field: 'ephemeralKeySize',
          message: 'ephemeralKeySize must be a positive integer if provided',
          code: 'INVALID_EPHEMERAL_KEY_SIZE',
        })
      }
    }
  }
}

export function validatePQCParameters(input: unknown): PQCValidationResult {
  return new PQCValidator().validateParameterSet(input)
}
