export interface CredentialSubject {
  id: string
  [key: string]: unknown
}

export interface CredentialInput {
  type: string | string[]
  issuer: string
  subject: CredentialSubject
  expirationDate?: string
  issuanceDate?: string
  credentialSchema?: { id: string; type: string }
  [key: string]: unknown
}

export interface CredentialValidationResult {
  valid: boolean
  errors: CredentialValidationError[]
  warnings: string[]
}

export interface CredentialValidationError {
  field: string
  message: string
  code: string
}

export class CredentialValidator {
  validate(input: unknown): CredentialValidationResult {
    const errors: CredentialValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'Credential input must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const credential = input as Record<string, unknown>

    this.validateType(credential, errors)
    this.validateIssuer(credential, errors)
    this.validateSubject(credential, errors)
    this.validateDates(credential, errors, warnings)

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  private validateType(credential: Record<string, unknown>, errors: CredentialValidationError[]): void {
    const type = credential.type
    if (!type) {
      errors.push({
        field: 'type',
        message: 'Credential type is required',
        code: 'MISSING_TYPE',
      })
      return
    }

    if (typeof type === 'string') {
      if (type.trim().length === 0) {
        errors.push({
          field: 'type',
          message: 'Credential type must not be empty',
          code: 'EMPTY_TYPE',
        })
      }
    } else if (Array.isArray(type)) {
      if (type.length === 0) {
        errors.push({
          field: 'type',
          message: 'Credential type array must not be empty',
          code: 'EMPTY_TYPE_ARRAY',
        })
      }
      for (let i = 0; i < type.length; i++) {
        if (typeof type[i] !== 'string' || type[i]!.trim().length === 0) {
          errors.push({
            field: `type[${i}]`,
            message: 'Each credential type must be a non-empty string',
            code: 'INVALID_TYPE_ELEMENT',
          })
        }
      }
    } else {
      errors.push({
        field: 'type',
        message: 'Credential type must be a string or array of strings',
        code: 'INVALID_TYPE_FORMAT',
      })
    }
  }

  private validateIssuer(credential: Record<string, unknown>, errors: CredentialValidationError[]): void {
    const issuer = credential.issuer
    if (!issuer) {
      errors.push({
        field: 'issuer',
        message: 'Credential issuer is required',
        code: 'MISSING_ISSUER',
      })
      return
    }

    if (typeof issuer !== 'string' || issuer.trim().length === 0) {
      errors.push({
        field: 'issuer',
        message: 'Credential issuer must be a non-empty string (DID or URL)',
        code: 'INVALID_ISSUER',
      })
    }
  }

  private validateSubject(credential: Record<string, unknown>, errors: CredentialValidationError[]): void {
    const subject = credential.subject
    if (!subject) {
      errors.push({
        field: 'subject',
        message: 'Credential subject is required',
        code: 'MISSING_SUBJECT',
      })
      return
    }

    if (typeof subject !== 'object' || subject === null) {
      errors.push({
        field: 'subject',
        message: 'Credential subject must be a non-null object',
        code: 'INVALID_SUBJECT',
      })
      return
    }

    const sub = subject as Record<string, unknown>
    if (!sub.id || typeof sub.id !== 'string' || sub.id.trim().length === 0) {
      errors.push({
        field: 'subject.id',
        message: 'Credential subject id is required and must be a non-empty string',
        code: 'MISSING_SUBJECT_ID',
      })
    }
  }

  private validateDates(credential: Record<string, unknown>, errors: CredentialValidationError[], warnings: string[]): void {
    const issuanceDate = credential.issuanceDate
    if (issuanceDate !== undefined) {
      if (typeof issuanceDate !== 'string' || isNaN(Date.parse(issuanceDate))) {
        errors.push({
          field: 'issuanceDate',
          message: 'issuanceDate must be a valid ISO 8601 date string',
          code: 'INVALID_ISSUANCE_DATE',
        })
      }
    }

    const expirationDate = credential.expirationDate
    if (expirationDate !== undefined) {
      if (typeof expirationDate !== 'string' || isNaN(Date.parse(expirationDate))) {
        errors.push({
          field: 'expirationDate',
          message: 'expirationDate must be a valid ISO 8601 date string',
          code: 'INVALID_EXPIRATION_DATE',
        })
      } else if (issuanceDate && Date.parse(expirationDate) <= Date.parse(issuanceDate as string)) {
        warnings.push('expirationDate should be after issuanceDate')
      }
    }
  }
}

export function validateCredential(input: unknown): CredentialValidationResult {
  return new CredentialValidator().validate(input)
}
