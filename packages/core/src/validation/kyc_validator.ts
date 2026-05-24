export type KYCCountryCode = string
export type KYCDocumentType = 'passport' | 'national_id' | 'drivers_license' | 'residence_permit' | 'voter_id' | 'other'

export interface KYCSubjectInput {
  id: string
  legalName?: string
  dateOfBirth?: string
  nationality?: KYCCountryCode
  countryOfResidence?: KYCCountryCode
  email?: string
  phone?: string
}

export interface KYCDocumentInput {
  type: KYCDocumentType
  country: KYCCountryCode
  number?: string
  issuedDate?: string
  expirationDate?: string
  issuerAuthority?: string
  fileHashes?: string[]
}

export interface KYCWorkflowInput {
  subject: KYCSubjectInput
  documents: KYCDocumentInput[]
  level: string
  metadata?: Record<string, unknown>
}

export interface KYCValidationResult {
  valid: boolean
  errors: KYCValidationError[]
  warnings: string[]
}

export interface KYCValidationError {
  field: string
  message: string
  code: string
}

const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class KYCValidator {
  validateWorkflow(input: unknown): KYCValidationResult {
    const errors: KYCValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'KYC workflow input must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const workflow = input as Record<string, unknown>

    this.validateSubject(workflow.subject as KYCSubjectInput | undefined, errors, warnings)
    this.validateDocuments(workflow.documents, errors, warnings)
    this.validateLevel(workflow.level, errors)

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateSubject(subject: unknown, errors: KYCValidationError[], warnings: string[]): void {
    if (!subject || typeof subject !== 'object') {
      errors.push({
        field: 'subject',
        message: 'KYC subject is required and must be an object',
        code: 'MISSING_SUBJECT',
      })
      return
    }

    const s = subject as Record<string, unknown>

    if (!s.id || typeof s.id !== 'string' || s.id.trim().length === 0) {
      errors.push({
        field: 'subject.id',
        message: 'Subject id is required and must be a non-empty string',
        code: 'MISSING_SUBJECT_ID',
      })
    }

    if (s.legalName !== undefined && (typeof s.legalName !== 'string' || s.legalName.trim().length === 0)) {
      errors.push({
        field: 'subject.legalName',
        message: 'legalName must be a non-empty string if provided',
        code: 'INVALID_LEGAL_NAME',
      })
    }

    if (s.dateOfBirth !== undefined) {
      if (typeof s.dateOfBirth !== 'string' || !DATE_REGEX.test(s.dateOfBirth)) {
        errors.push({
          field: 'subject.dateOfBirth',
          message: 'dateOfBirth must be a valid date in YYYY-MM-DD format',
          code: 'INVALID_DATE_OF_BIRTH',
        })
      } else if (isNaN(Date.parse(s.dateOfBirth))) {
        errors.push({
          field: 'subject.dateOfBirth',
          message: 'dateOfBirth is not a valid calendar date',
          code: 'INVALID_DATE_OF_BIRTH',
        })
      }
    }

    if (s.nationality !== undefined && (typeof s.nationality !== 'string' || !COUNTRY_CODE_REGEX.test(s.nationality))) {
      errors.push({
        field: 'subject.nationality',
        message: 'nationality must be a valid ISO 3166-1 alpha-2 country code',
        code: 'INVALID_NATIONALITY',
      })
    }

    if (s.countryOfResidence !== undefined && (typeof s.countryOfResidence !== 'string' || !COUNTRY_CODE_REGEX.test(s.countryOfResidence))) {
      errors.push({
        field: 'subject.countryOfResidence',
        message: 'countryOfResidence must be a valid ISO 3166-1 alpha-2 country code',
        code: 'INVALID_COUNTRY_OF_RESIDENCE',
      })
    }

    if (s.email !== undefined && (typeof s.email !== 'string' || !EMAIL_REGEX.test(s.email))) {
      errors.push({
        field: 'subject.email',
        message: 'email must be a valid email address if provided',
        code: 'INVALID_EMAIL',
      })
    }
  }

  private validateDocuments(documents: unknown, errors: KYCValidationError[], warnings: string[]): void {
    if (!Array.isArray(documents)) {
      errors.push({
        field: 'documents',
        message: 'KYC documents must be an array',
        code: 'MISSING_DOCUMENTS',
      })
      return
    }

    if (documents.length === 0) {
      errors.push({
        field: 'documents',
        message: 'At least one KYC document is required',
        code: 'EMPTY_DOCUMENTS',
      })
      return
    }

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      if (!doc || typeof doc !== 'object') {
        errors.push({
          field: `documents[${i}]`,
          message: 'Each document must be a non-null object',
          code: 'INVALID_DOCUMENT',
        })
        continue
      }

      const d = doc as Record<string, unknown>

      const validTypes: KYCDocumentType[] = ['passport', 'national_id', 'drivers_license', 'residence_permit', 'voter_id', 'other']
      if (!d.type || typeof d.type !== 'string' || !validTypes.includes(d.type as KYCDocumentType)) {
        errors.push({
          field: `documents[${i}].type`,
          message: `Document type must be one of: ${validTypes.join(', ')}`,
          code: 'INVALID_DOCUMENT_TYPE',
        })
      }

      if (d.country !== undefined && (typeof d.country !== 'string' || !COUNTRY_CODE_REGEX.test(d.country as string))) {
        errors.push({
          field: `documents[${i}].country`,
          message: 'Document country must be a valid ISO 3166-1 alpha-2 code',
          code: 'INVALID_DOCUMENT_COUNTRY',
        })
      }

      if (d.expirationDate !== undefined) {
        if (typeof d.expirationDate !== 'string' || !DATE_REGEX.test(d.expirationDate as string)) {
          errors.push({
            field: `documents[${i}].expirationDate`,
            message: 'expirationDate must be in YYYY-MM-DD format',
            code: 'INVALID_EXPIRATION_DATE',
          })
        }
      }
    }
  }

  private validateLevel(level: unknown, errors: KYCValidationError[]): void {
    if (!level || typeof level !== 'string' || level.trim().length === 0) {
      errors.push({
        field: 'level',
        message: 'KYC verification level is required',
        code: 'MISSING_LEVEL',
      })
    }
  }
}

export function validateKYCWorkflow(input: unknown): KYCValidationResult {
  return new KYCValidator().validateWorkflow(input)
}
