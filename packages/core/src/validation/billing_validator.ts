export type BillingPlanTier = 'free' | 'starter' | 'professional' | 'enterprise'
export type BillingInterval = 'monthly' | 'yearly'
export type BillingPaymentMethod = 'card' | 'crypto' | 'invoice'
export type BillingCurrency = 'USD' | 'EUR' | 'GBP'

export interface BillingPlanInput {
  tier: BillingPlanTier
  interval: BillingInterval
  seats?: number
  addons?: string[]
  couponCode?: string
}

export interface BillingPaymentInput {
  method: BillingPaymentMethod
  currency: BillingCurrency
  amount: number
  description?: string
  metadata?: Record<string, unknown>
}

export interface BillingInvoiceInput {
  customerId: string
  items: BillingLineItem[]
  dueDate?: string
  currency?: BillingCurrency
  notes?: string
}

export interface BillingLineItem {
  description: string
  quantity: number
  unitPrice: number
  currency?: BillingCurrency
}

export interface BillingValidationResult {
  valid: boolean
  errors: BillingValidationError[]
  warnings: string[]
}

export interface BillingValidationError {
  field: string
  message: string
  code: string
}

const VALID_TIERS: BillingPlanTier[] = ['free', 'starter', 'professional', 'enterprise']
const VALID_INTERVALS: BillingInterval[] = ['monthly', 'yearly']
const VALID_PAYMENT_METHODS: BillingPaymentMethod[] = ['card', 'crypto', 'invoice']
const VALID_CURRENCIES: BillingCurrency[] = ['USD', 'EUR', 'GBP']

export class BillingValidator {
  validatePlan(input: unknown): BillingValidationResult {
    const errors: BillingValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'Billing plan input must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const plan = input as Record<string, unknown>

    if (!plan.tier || typeof plan.tier !== 'string' || !VALID_TIERS.includes(plan.tier as BillingPlanTier)) {
      errors.push({
        field: 'tier',
        message: `Billing tier must be one of: ${VALID_TIERS.join(', ')}`,
        code: 'INVALID_TIER',
      })
    }

    if (!plan.interval || typeof plan.interval !== 'string' || !VALID_INTERVALS.includes(plan.interval as BillingInterval)) {
      errors.push({
        field: 'interval',
        message: `Billing interval must be one of: ${VALID_INTERVALS.join(', ')}`,
        code: 'INVALID_INTERVAL',
      })
    }

    if (plan.seats !== undefined) {
      if (typeof plan.seats !== 'number' || !Number.isInteger(plan.seats) || plan.seats < 1) {
        errors.push({
          field: 'seats',
          message: 'seats must be a positive integer if provided',
          code: 'INVALID_SEATS',
        })
      }
    }

    if (plan.addons !== undefined) {
      if (!Array.isArray(plan.addons)) {
        errors.push({
          field: 'addons',
          message: 'addons must be an array of strings if provided',
          code: 'INVALID_ADDONS',
        })
      } else {
        for (let i = 0; i < plan.addons.length; i++) {
          if (typeof plan.addons[i] !== 'string') {
            errors.push({
              field: `addons[${i}]`,
              message: 'Each addon must be a string',
              code: 'INVALID_ADDON',
            })
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  validatePayment(input: unknown): BillingValidationResult {
    const errors: BillingValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'Billing payment input must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const payment = input as Record<string, unknown>

    if (!payment.method || typeof payment.method !== 'string' || !VALID_PAYMENT_METHODS.includes(payment.method as BillingPaymentMethod)) {
      errors.push({
        field: 'method',
        message: `Payment method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`,
        code: 'INVALID_PAYMENT_METHOD',
      })
    }

    if (!payment.currency || typeof payment.currency !== 'string' || !VALID_CURRENCIES.includes(payment.currency as BillingCurrency)) {
      errors.push({
        field: 'currency',
        message: `Currency must be one of: ${VALID_CURRENCIES.join(', ')}`,
        code: 'INVALID_CURRENCY',
      })
    }

    if (payment.amount === undefined || typeof payment.amount !== 'number' || payment.amount <= 0) {
      errors.push({
        field: 'amount',
        message: 'amount must be a positive number',
        code: 'INVALID_AMOUNT',
      })
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  validateInvoice(input: unknown): BillingValidationResult {
    const errors: BillingValidationError[] = []
    const warnings: string[] = []

    if (!input || typeof input !== 'object') {
      errors.push({
        field: 'root',
        message: 'Billing invoice input must be a non-null object',
        code: 'INVALID_TYPE',
      })
      return { valid: false, errors, warnings }
    }

    const invoice = input as Record<string, unknown>

    if (!invoice.customerId || typeof invoice.customerId !== 'string' || invoice.customerId.trim().length === 0) {
      errors.push({
        field: 'customerId',
        message: 'customerId is required and must be a non-empty string',
        code: 'MISSING_CUSTOMER_ID',
      })
    }

    if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
      errors.push({
        field: 'items',
        message: 'Invoice must have at least one line item',
        code: 'MISSING_ITEMS',
      })
    } else {
      for (let i = 0; i < invoice.items.length; i++) {
        this.validateLineItem(invoice.items[i], `items[${i}]`, errors)
      }
    }

    if (invoice.currency !== undefined && (typeof invoice.currency !== 'string' || !VALID_CURRENCIES.includes(invoice.currency as BillingCurrency))) {
      errors.push({
        field: 'currency',
        message: `Currency must be one of: ${VALID_CURRENCIES.join(', ')}`,
        code: 'INVALID_CURRENCY',
      })
    }

    if (invoice.dueDate !== undefined) {
      if (typeof invoice.dueDate !== 'string' || isNaN(Date.parse(invoice.dueDate))) {
        errors.push({
          field: 'dueDate',
          message: 'dueDate must be a valid ISO 8601 date string if provided',
          code: 'INVALID_DUE_DATE',
        })
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateLineItem(item: unknown, path: string, errors: BillingValidationError[]): void {
    if (!item || typeof item !== 'object') {
      errors.push({
        field: path,
        message: 'Each line item must be a non-null object',
        code: 'INVALID_LINE_ITEM',
      })
      return
    }

    const li = item as Record<string, unknown>

    if (!li.description || typeof li.description !== 'string' || li.description.trim().length === 0) {
      errors.push({
        field: `${path}.description`,
        message: 'Line item description is required',
        code: 'MISSING_DESCRIPTION',
      })
    }

    if (li.quantity === undefined || typeof li.quantity !== 'number' || li.quantity <= 0) {
      errors.push({
        field: `${path}.quantity`,
        message: 'Line item quantity must be a positive number',
        code: 'INVALID_QUANTITY',
      })
    }

    if (li.unitPrice === undefined || typeof li.unitPrice !== 'number' || li.unitPrice <= 0) {
      errors.push({
        field: `${path}.unitPrice`,
        message: 'Line item unitPrice must be a positive number',
        code: 'INVALID_UNIT_PRICE',
      })
    }
  }
}

export function validateBillingPlan(input: unknown): BillingValidationResult {
  return new BillingValidator().validatePlan(input)
}

export function validateBillingPayment(input: unknown): BillingValidationResult {
  return new BillingValidator().validatePayment(input)
}

export function validateBillingInvoice(input: unknown): BillingValidationResult {
  return new BillingValidator().validateInvoice(input)
}
