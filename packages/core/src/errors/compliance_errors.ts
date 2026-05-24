import { AppError, type ErrorContext } from './base.js'

export class ComplianceError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('COMPLIANCE_ERROR', message, context)
    this.name = 'ComplianceError'
  }
}

export class ComplianceRegulationNotMetError extends ComplianceError {
  constructor(regulation: string, details: string[], context?: ErrorContext) {
    super(`Compliance regulation not met: ${regulation}`, {
      ...context,
      regulation,
      details,
    })
    this.name = 'ComplianceRegulationNotMetError'
  }
}

export class ComplianceJurisdictionRestrictedError extends ComplianceError {
  constructor(jurisdiction: string, reason: string, context?: ErrorContext) {
    super(`Jurisdiction restricted: ${jurisdiction} - ${reason}`, {
      ...context,
      jurisdiction,
      reason,
    })
    this.name = 'ComplianceJurisdictionRestrictedError'
  }
}

export class ComplianceDataRetentionError extends ComplianceError {
  constructor(dataType: string, retentionPeriod: string, context?: ErrorContext) {
    super(`Data retention policy violation for ${dataType}: ${retentionPeriod}`, {
      ...context,
      dataType,
      retentionPeriod,
    })
    this.name = 'ComplianceDataRetentionError'
  }
}

export class ComplianceConsentMissingError extends ComplianceError {
  constructor(subjectId: string, purpose: string, context?: ErrorContext) {
    super(`Consent missing for ${subjectId} on purpose: ${purpose}`, {
      ...context,
      subjectId,
      purpose,
    })
    this.name = 'ComplianceConsentMissingError'
  }
}

export class ComplianceAuditTrailError extends ComplianceError {
  constructor(auditId: string, reason: string, context?: ErrorContext) {
    super(`Audit trail integrity error for ${auditId}: ${reason}`, {
      ...context,
      auditId,
      reason,
    })
    this.name = 'ComplianceAuditTrailError'
  }
}

export class ComplianceSanctionsMatchError extends ComplianceError {
  constructor(subjectId: string, sanctionsLists: string[], context?: ErrorContext) {
    super(`Sanctions list match detected for ${subjectId}`, {
      ...context,
      subjectId,
      sanctionsLists,
    })
    this.name = 'ComplianceSanctionsMatchError'
  }
}

export class ComplianceReportingError extends ComplianceError {
  constructor(reportType: string, reason: string, context?: ErrorContext) {
    super(`Compliance reporting failed for ${reportType}: ${reason}`, {
      ...context,
      reportType,
      reason,
    })
    this.name = 'ComplianceReportingError'
  }
}
