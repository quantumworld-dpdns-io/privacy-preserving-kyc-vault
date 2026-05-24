import crypto from 'crypto';
import {
  RegulatoryReport,
  ReportType,
  Jurisdiction,
  ReportPeriod,
  ReportStatus,
  FilingResult,
  FilingError,
  RegulatorInterface,
} from './regulator_interface.js';

interface ReportTemplate {
  type: ReportType;
  jurisdiction: Jurisdiction;
  schema: Record<string, unknown>;
  requiredFields: string[];
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    type: 'suspicious_activity',
    jurisdiction: 'us_fincen',
    schema: {
      sarId: 'string',
      filingEntity: { name: 'string', ein: 'string' },
      subject: { name: 'string', address: 'string', identification: 'string' },
      suspiciousActivity: { type: 'string', description: 'string', dateRange: 'object' },
      totalAmount: 'number',
      currency: 'string',
    },
    requiredFields: ['sarId', 'filingEntity', 'subject', 'suspiciousActivity'],
  },
  {
    type: 'kyc_audit',
    jurisdiction: 'global',
    schema: {
      auditId: 'string',
      period: 'object',
      totalVerifications: 'number',
      passedVerifications: 'number',
      failedVerifications: 'number',
      averageProcessingTime: 'number',
      breakdownByMethod: 'object',
      breakdownByCountry: 'object',
      rejectionReasons: 'array',
    },
    requiredFields: ['auditId', 'period', 'totalVerifications', 'passedVerifications', 'failedVerifications'],
  },
  {
    type: 'sanctions_screening',
    jurisdiction: 'global',
    schema: {
      screeningId: 'string',
      totalScreened: 'number',
      totalMatches: 'number',
      falsePositives: 'number',
      confirmedMatches: 'number',
      matchesByList: 'object',
      averageResponseTime: 'number',
    },
    requiredFields: ['screeningId', 'totalScreened', 'totalMatches'],
  },
  {
    type: 'aml_compliance',
    jurisdiction: 'uk_fca',
    schema: {
      referenceNumber: 'string',
      firmName: 'string',
      reportingPeriod: 'object',
      totalTransactions: 'number',
      suspiciousReports: 'number',
      thresholdReports: 'number',
      currencyExchangeReports: 'number',
      notes: 'string',
    },
    requiredFields: ['referenceNumber', 'firmName', 'reportingPeriod'],
  },
];

export class ReportGenerator implements RegulatorInterface {
  private reports: Map<string, RegulatoryReport> = new Map();

  async generateReport(
    type: ReportType,
    jurisdiction: Jurisdiction,
    period: ReportPeriod,
    data: Record<string, unknown>,
  ): Promise<RegulatoryReport> {
    const template = REPORT_TEMPLATES.find((t) => t.type === type && t.jurisdiction === jurisdiction);

    const report: RegulatoryReport = {
      id: `RPT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      reportType: type,
      jurisdiction,
      period,
      generatedAt: new Date().toISOString(),
      status: 'draft',
      data,
      format: {
        mimeType: 'application/json',
        schema: template?.schema ? `${type}-${jurisdiction}-${period.type}` : 'generic',
        version: '1.0.0',
        encoding: 'json',
      },
    };

    this.reports.set(report.id, report);
    return report;
  }

  async submitReport(report: RegulatoryReport): Promise<FilingResult> {
    const stored = this.reports.get(report.id);
    if (!stored) {
      return {
        reportId: report.id,
        jurisdiction: report.jurisdiction,
        submittedAt: new Date().toISOString(),
        status: 'rejected',
        errors: [{ code: 'NOT_FOUND', message: 'Report not found', severity: 'error' }],
      };
    }

    const validation = await this.validateReport(report);
    if (!validation.valid) {
      return {
        reportId: report.id,
        jurisdiction: report.jurisdiction,
        submittedAt: new Date().toISOString(),
        status: 'rejected',
        errors: validation.errors,
      };
    }

    stored.status = 'submitted';
    stored.submittedAt = new Date().toISOString();
    this.reports.set(report.id, stored);

    return {
      reportId: report.id,
      jurisdiction: report.jurisdiction,
      submittedAt: stored.submittedAt,
      confirmationId: `CONF-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
      status: 'pending_review',
    };
  }

  async getReportStatus(reportId: string): Promise<ReportStatus> {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }
    return report.status;
  }

  async listReports(jurisdiction: Jurisdiction, status?: ReportStatus): Promise<RegulatoryReport[]> {
    const results: RegulatoryReport[] = [];
    for (const report of this.reports.values()) {
      if (report.jurisdiction !== jurisdiction) continue;
      if (status && report.status !== status) continue;
      results.push(report);
    }
    return results.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  }

  async archiveReport(reportId: string): Promise<void> {
    const report = this.reports.get(reportId);
    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }
    report.status = 'archived';
    this.reports.set(reportId, report);
  }

  async validateReport(report: RegulatoryReport): Promise<{ valid: boolean; errors: FilingError[] }> {
    const errors: FilingError[] = [];

    if (!report.reportType) {
      errors.push({ code: 'MISSING_TYPE', message: 'Report type is required', severity: 'error' });
    }

    if (!report.jurisdiction) {
      errors.push({ code: 'MISSING_JURISDICTION', message: 'Jurisdiction is required', severity: 'error' });
    }

    if (!report.period?.start || !report.period?.end) {
      errors.push({ code: 'INVALID_PERIOD', message: 'Report period must have start and end dates', severity: 'error' });
    }

    if (!report.data || Object.keys(report.data).length === 0) {
      errors.push({ code: 'EMPTY_DATA', message: 'Report data cannot be empty', severity: 'error' });
    }

    const template = REPORT_TEMPLATES.find(
      (t) => t.type === report.reportType && t.jurisdiction === report.jurisdiction,
    );

    if (template) {
      for (const field of template.requiredFields) {
        if (!(field in report.data)) {
          errors.push({
            code: 'MISSING_FIELD',
            message: `Required field '${field}' is missing for report type ${report.reportType}`,
            field,
            severity: 'error',
          });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

export function generatePeriod(type: ReportPeriod['type'], start?: string, end?: string): ReportPeriod {
  const now = new Date();
  const endDate = end ? new Date(end) : now;
  let startDate: Date;

  switch (type) {
    case 'daily':
      startDate = start ? new Date(start) : new Date(endDate.getTime() - 86400000);
      break;
    case 'weekly':
      startDate = start ? new Date(start) : new Date(endDate.getTime() - 7 * 86400000);
      break;
    case 'monthly':
      startDate = start ? new Date(start) : new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
      break;
    case 'quarterly':
      startDate = start ? new Date(start) : new Date(endDate.getFullYear(), endDate.getMonth() - 3, 1);
      break;
    case 'yearly':
      startDate = start ? new Date(start) : new Date(endDate.getFullYear() - 1, endDate.getMonth(), 1);
      break;
    default:
      startDate = start ? new Date(start) : new Date(endDate.getTime() - 30 * 86400000);
  }

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    type,
  };
}
