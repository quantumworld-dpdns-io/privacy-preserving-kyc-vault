export interface DIDDocument {
  '@context'?: string | string[]
  id: string
  alsoKnownAs?: string[]
  controller?: string | string[]
  verificationMethod?: DIDVerificationMethod[]
  authentication?: (string | DIDVerificationEmbedded)[]
  assertionMethod?: (string | DIDVerificationEmbedded)[]
  keyAgreement?: (string | DIDVerificationEmbedded)[]
  capabilityInvocation?: (string | DIDVerificationEmbedded)[]
  capabilityDelegation?: (string | DIDVerificationEmbedded)[]
  service?: DIDService[]
  created?: string
  updated?: string
  [key: string]: unknown
}

export interface DIDVerificationMethod {
  id: string
  type: string
  controller: string
  publicKeyMultibase?: string
  publicKeyJwk?: Record<string, unknown>
  [key: string]: unknown
}

export type DIDVerificationEmbedded = string | DIDVerificationMethod

export interface DIDService {
  id: string
  type: string | string[]
  serviceEndpoint: string | string[] | Record<string, unknown>
  [key: string]: unknown
}

export interface DIDValidationResult {
  valid: boolean
  errors: DIDValidationError[]
  warnings: string[]
}

export interface DIDValidationError {
  field: string
  message: string
  code: string
}

const DID_REGEX = /^did:([a-z0-9]+):([a-zA-Z0-9._:%-]+)$/
const DID_METHOD_REGEX = /^[a-z0-9]+$/

export class DIDValidator {
  validate(did: string): DIDValidationResult {
    const errors: DIDValidationError[] = []
    const warnings: string[] = []

    if (typeof did !== 'string') {
      errors.push({
        field: 'did',
        message: 'DID must be a string',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    if (did.length > 2048) {
      errors.push({
        field: 'did',
        message: 'DID string exceeds maximum length of 2048 characters',
        code: 'DID_TOO_LONG',
      })
    }

    const match = did.match(DID_REGEX)
    if (!match) {
      errors.push({
        field: 'did',
        message: 'DID must conform to the format did:method:specific-identifier',
        code: 'INVALID_DID_FORMAT',
      })
      return { valid: false, errors, warnings }
    }

    const method = match[1]!
    const specificId = match[2]!

    if (!DID_METHOD_REGEX.test(method)) {
      errors.push({
        field: 'did',
        message: 'DID method must contain only lowercase alphanumeric characters',
        code: 'INVALID_METHOD',
      })
    }

    if (specificId.length < 1) {
      errors.push({
        field: 'did',
        message: 'DID specific identifier must not be empty',
        code: 'EMPTY_SPECIFIC_ID',
      })
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  validateDocument(doc: unknown): DIDValidationResult {
    const errors: DIDValidationError[] = []
    const warnings: string[] = []

    if (!doc || typeof doc !== 'object') {
      errors.push({
        field: 'document',
        message: 'DID document must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const document = doc as Record<string, unknown>

    if (!document.id || typeof document.id !== 'string') {
      errors.push({
        field: 'id',
        message: 'DID document must have a string id field',
        code: 'MISSING_ID',
      })
    } else {
      const idResult = this.validate(document.id)
      errors.push(...idResult.errors)
    }

    if (document.controller !== undefined) {
      if (typeof document.controller === 'string') {
        const ctrlResult = this.validate(document.controller)
        errors.push(...ctrlResult.errors)
      } else if (Array.isArray(document.controller)) {
        for (let i = 0; i < document.controller.length; i++) {
          if (typeof document.controller[i] === 'string') {
            const ctrlResult = this.validate(document.controller[i] as string)
            errors.push(...ctrlResult.errors.map((e) => ({ ...e, field: `controller[${i}]` })))
          }
        }
      } else {
        errors.push({
          field: 'controller',
          message: 'controller must be a string or array of strings',
          code: 'INVALID_CONTROLLER',
        })
      }
    }

    if (document.verificationMethod !== undefined) {
      if (!Array.isArray(document.verificationMethod)) {
        errors.push({
          field: 'verificationMethod',
          message: 'verificationMethod must be an array',
          code: 'INVALID_VERIFICATION_METHOD',
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }
}

export function validateDID(did: string): DIDValidationResult {
  return new DIDValidator().validate(did)
}

export function validateDIDDocument(doc: unknown): DIDValidationResult {
  return new DIDValidator().validateDocument(doc)
}
