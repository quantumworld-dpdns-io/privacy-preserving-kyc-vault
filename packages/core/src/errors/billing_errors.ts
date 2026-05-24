import { AppError, type ErrorContext } from './base.js'

export class BillingError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('BILLING_ERROR', message, context)
    this.name = 'BillingError'
  }
}

export class BillingInsufficientCreditsError extends BillingError {
  constructor(walletId: string, available: number, required: number, context?: ErrorContext) {
    super(`Insufficient credits in wallet ${walletId}: ${available} < ${required}`, {
      ...context,
      walletId,
      available,
      required,
    })
    this.name = 'BillingInsufficientCreditsError'
  }
}

export class BillingInvoiceError extends BillingError {
  constructor(invoiceId: string, reason: string, context?: ErrorContext) {
    super(`Invoice error for ${invoiceId}: ${reason}`, {
      ...context,
      invoiceId,
      reason,
    })
    this.name = 'BillingInvoiceError'
  }
}

export class BillingPaymentFailedError extends BillingError {
  constructor(paymentMethod: string, gatewayMessage: string, context?: ErrorContext) {
    super(`Payment failed via ${paymentMethod}: ${gatewayMessage}`, {
      ...context,
      paymentMethod,
      gatewayMessage,
    })
    this.name = 'BillingPaymentFailedError'
  }
}

export class BillingPlanLimitExceededError extends BillingError {
  constructor(plan: string, limit: string, current: number, max: number, context?: ErrorContext) {
    super(`Plan limit exceeded for ${plan}/${limit}: ${current}/${max}`, {
      ...context,
      plan,
      limit,
      current,
      max,
    })
    this.name = 'BillingPlanLimitExceededError'
  }
}

export class BillingSubscriptionCancelledError extends BillingError {
  constructor(subscriptionId: string, context?: ErrorContext) {
    super(`Subscription cancelled: ${subscriptionId}`, {
      ...context,
      subscriptionId,
    })
    this.name = 'BillingSubscriptionCancelledError'
  }
}

export class BillingTrialExpiredError extends BillingError {
  constructor(organizationId: string, trialEndedAt: string, context?: ErrorContext) {
    super(`Trial expired for organization ${organizationId} at ${trialEndedAt}`, {
      ...context,
      organizationId,
      trialEndedAt,
    })
    this.name = 'BillingTrialExpiredError'
  }
}

export class BillingRefundError extends BillingError {
  constructor(transactionId: string, reason: string, context?: ErrorContext) {
    super(`Refund failed for transaction ${transactionId}: ${reason}`, {
      ...context,
      transactionId,
      reason,
    })
    this.name = 'BillingRefundError'
  }
}
