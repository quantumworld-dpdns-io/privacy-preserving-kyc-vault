export interface ZKPProofRequest {
  circuitId: string
  publicInputs: Record<string, unknown>
  privateInputs?: string[]
  proofType?: 'groth16' | 'plonk' | 'fflonk' | 'ultraplonk' | 'stark'
  options?: Record<string, unknown>
}

export interface ZKPVerificationRequest {
  proof: unknown
  publicInputs: Record<string, unknown>
  circuitId: string
  verificationKey?: unknown
}

export interface ZKPValidationResult {
  valid: boolean
  errors: ZKPValidationError[]
  warnings: string[]
}

export interface ZKPValidationError {
  field: string
  message: string
  code: string
}

const SUPPORTED_PROOF_TYPES = ['groth16', 'plonk', 'fflonk', 'ultraplonk', 'stark']
const CIRCUIT_ID_REGEX = /^[a-zA-Z0-9_\-./]+$/

export class ZKPValidator {
  validateProofRequest(input: unknown): ZKPValidationResult {
    const errors: ZKPValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'ZKP proof request must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const req = input as Record<string, unknown>

    this.validateCircuitId(req.circuitId, errors)
    this.validatePublicInputs(req.publicInputs, errors, warnings)

    if (req.proofType !== undefined) {
      if (typeof req.proofType !== 'string' || !SUPPORTED_PROOF_TYPES.includes(req.proofType)) {
        errors.push({
          field: 'proofType',
          message: `proofType must be one of: ${SUPPORTED_PROOF_TYPES.join(', ')}`,
          code: 'INVALID_PROOF_TYPE',
        })
      }
    }

    if (req.privateInputs !== undefined) {
      if (!Array.isArray(req.privateInputs)) {
        errors.push({
          field: 'privateInputs',
          message: 'privateInputs must be an array of strings',
          code: 'INVALID_PRIVATE_INPUTS',
        })
      } else {
        for (let i = 0; i < req.privateInputs.length; i++) {
          if (typeof req.privateInputs[i] !== 'string') {
            errors.push({
              field: `privateInputs[${i}]`,
              message: 'Each private input must be a string',
              code: 'INVALID_PRIVATE_INPUT',
            })
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  validateVerificationRequest(input: unknown): ZKPValidationResult {
    const errors: ZKPValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'ZKP verification request must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const req = input as Record<string, unknown>

    this.validateCircuitId(req.circuitId, errors)

    if (req.proof === undefined || req.proof === null) {
      errors.push({
        field: 'proof',
        message: 'Proof is required for verification',
        code: 'MISSING_PROOF',
      })
    }

    this.validatePublicInputs(req.publicInputs, errors, warnings)

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateCircuitId(circuitId: unknown, errors: ZKPValidationError[]): void {
    if (!circuitId || typeof circuitId !== 'string') {
      errors.push({
        field: 'circuitId',
        message: 'circuitId is required and must be a string',
        code: 'MISSING_CIRCUIT_ID',
      })
      return
    }

    if (circuitId.trim().length === 0) {
      errors.push({
        field: 'circuitId',
        message: 'circuitId must not be empty',
        code: 'EMPTY_CIRCUIT_ID',
      })
    }

    if (circuitId.length > 256) {
      errors.push({
        field: 'circuitId',
        message: 'circuitId must not exceed 256 characters',
        code: 'CIRCUIT_ID_TOO_LONG',
      })
    }

    if (!CIRCUIT_ID_REGEX.test(circuitId)) {
      errors.push({
        field: 'circuitId',
        message: 'circuitId contains invalid characters',
        code: 'INVALID_CIRCUIT_ID_CHARS',
      })
    }
  }

  private validatePublicInputs(publicInputs: unknown, errors: ZKPValidationError[], warnings: string[]): void {
    if (publicInputs === undefined || publicInputs === null) {
      errors.push({
        field: 'publicInputs',
        message: 'publicInputs is required',
        code: 'MISSING_PUBLIC_INPUTS',
      })
      return
    }

    if (typeof publicInputs !== 'object' || Array.isArray(publicInputs)) {
      errors.push({
        field: 'publicInputs',
        message: 'publicInputs must be a non-array object',
        code: 'INVALID_PUBLIC_INPUTS_TYPE',
      })
      return
    }

    if (Object.keys(publicInputs as Record<string, unknown>).length === 0) {
      warnings.push('publicInputs is an empty object')
    }
  }
}

export function validateZKPProofRequest(input: unknown): ZKPValidationResult {
  return new ZKPValidator().validateProofRequest(input)
}

export function validateZKPVerificationRequest(input: unknown): ZKPValidationResult {
  return new ZKPValidator().validateVerificationRequest(input)
}
