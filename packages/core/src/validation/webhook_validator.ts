export type WebhookEventType =
  | 'kyc.workflow.created'
  | 'kyc.workflow.updated'
  | 'kyc.workflow.completed'
  | 'kyc.workflow.failed'
  | 'kyc.document.uploaded'
  | 'kyc.document.verified'
  | 'kyc.document.rejected'
  | 'credential.issued'
  | 'credential.revoked'
  | 'credential.expired'
  | 'did.created'
  | 'did.updated'
  | 'did.deactivated'
  | 'billing.invoice.paid'
  | 'billing.invoice.failed'
  | 'billing.subscription.changed'
  | 'compliance.alert'
  | 'compliance.sanctions.match'
  | 'webhook.test'

export interface WebhookPayload {
  id: string
  event: WebhookEventType
  created: string
  data: Record<string, unknown>
  specversion?: string
  source?: string
  subject?: string
  datacontenttype?: string
}

export interface WebhookValidationResult {
  valid: boolean
  errors: WebhookValidationError[]
  warnings: string[]
}

export interface WebhookValidationError {
  field: string
  message: string
  code: string
}

const VALID_EVENT_TYPES: WebhookEventType[] = [
  'kyc.workflow.created',
  'kyc.workflow.updated',
  'kyc.workflow.completed',
  'kyc.workflow.failed',
  'kyc.document.uploaded',
  'kyc.document.verified',
  'kyc.document.rejected',
  'credential.issued',
  'credential.revoked',
  'credential.expired',
  'did.created',
  'did.updated',
  'did.deactivated',
  'billing.invoice.paid',
  'billing.invoice.failed',
  'billing.subscription.changed',
  'compliance.alert',
  'compliance.sanctions.match',
  'webhook.test',
]

export class WebhookValidator {
  validate(payload: unknown): WebhookValidationResult {
    const errors: WebhookValidationError[] = []
    const warnings: string[] = []

    if (!payload || typeof payload !== 'object') {
      errors.push({
        field: 'root',
        message: 'Webhook payload must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const webhook = payload as Record<string, unknown>

    this.validateId(webhook.id, errors)
    this.validateEvent(webhook.event, errors, warnings)
    this.validateCreated(webhook.created, errors)
    this.validateData(webhook.data, errors)

    if (webhook.specversion !== undefined && (typeof webhook.specversion !== 'string' || webhook.specversion.trim().length === 0)) {
      errors.push({
        field: 'specversion',
        message: 'specversion must be a non-empty string if provided',
        code: 'INVALID_SPECVERSION',
      })
    }

    if (webhook.source !== undefined && typeof webhook.source !== 'string') {
      errors.push({
        field: 'source',
        message: 'source must be a string if provided',
        code: 'INVALID_SOURCE',
      })
    }

    if (webhook.subject !== undefined && typeof webhook.subject !== 'string') {
      errors.push({
        field: 'subject',
        message: 'subject must be a string if provided',
        code: 'INVALID_SUBJECT',
      })
    }

    if (webhook.datacontenttype !== undefined) {
      if (typeof webhook.datacontenttype !== 'string') {
        errors.push({
          field: 'datacontenttype',
          message: 'datacontenttype must be a string if provided',
          code: 'INVALID_DATACONTENTTYPE',
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateId(id: unknown, errors: WebhookValidationError[]): void {
    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      errors.push({
        field: 'id',
        message: 'Webhook id is required and must be a non-empty string',
        code: 'MISSING_ID',
      })
    }
  }

  private validateEvent(event: unknown, errors: WebhookValidationError[], warnings: string[]): void {
    if (!event || typeof event !== 'string') {
      errors.push({
        field: 'event',
        message: 'Webhook event is required and must be a string',
        code: 'MISSING_EVENT',
      })
      return
    }

    if (!VALID_EVENT_TYPES.includes(event as WebhookEventType)) {
      warnings.push(`Unknown webhook event type: ${event}`)
    }
  }

  private validateCreated(created: unknown, errors: WebhookValidationError[]): void {
    if (!created || typeof created !== 'string') {
      errors.push({
        field: 'created',
        message: 'Webhook created timestamp is required and must be a string',
        code: 'MISSING_CREATED',
      })
      return
    }

    const timestamp = Date.parse(created)
    if (isNaN(timestamp)) {
      errors.push({
        field: 'created',
        message: 'created must be a valid ISO 8601 timestamp string',
        code: 'INVALID_CREATED',
      })
    }
  }

  private validateData(data: unknown, errors: WebhookValidationError[]): void {
    if (data === undefined || data === null) {
      errors.push({
        field: 'data',
        message: 'Webhook data is required',
        code: 'MISSING_DATA',
      })
      return
    }

    if (typeof data !== 'object' || Array.isArray(data)) {
      errors.push({
        field: 'data',
        message: 'Webhook data must be a non-array object',
        code: 'INVALID_DATA_TYPE',
      })
    }
  }
}

export function validateWebhookPayload(payload: unknown): WebhookValidationResult {
  return new WebhookValidator().validate(payload)
}
