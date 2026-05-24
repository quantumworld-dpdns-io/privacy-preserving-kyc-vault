export interface RegulatoryReport {
  id: string;
  reportType: ReportType;
  jurisdiction: Jurisdiction;
  period: ReportPeriod;
  generatedAt: string;
  submittedAt?: string;
  status: ReportStatus;
  data: Record<string, unknown>;
  format: ReportFormat;
}

export type ReportType =
  | 'suspicious_activity'
  | 'transaction_monitoring'
  | 'kyc_audit'
  | 'sanctions_screening'
  | 'pep_screening'
  | 'adverse_media'
  | 'aml_compliance'
  | 'data_retention'
  | 'breach_notification'
  | 'periodic_review';

export type Jurisdiction =
  | 'us_fincen'
  | 'us_fatf'
  | 'uk_fca'
  | 'eu_amld'
  | 'ca_fintrac'
  | 'au_aurac'
  | 'sg_mas'
  | 'hk_ma'
  | 'jp_fsa'
  | 'global';

export type ReportStatus =
  | 'draft'
  | 'pending_review'
  | 'submitted'
  | 'acknowledged'
  | 'rejected'
  | 'amended'
  | 'archived';

export interface ReportPeriod {
  start: string;
  end: string;
  type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
}

export interface ReportFormat {
  mimeType: string;
  schema: string;
  version: string;
  encoding: 'json' | 'xml' | 'csv' | 'pdf' | 'edifact' | 'x12';
}

export interface RegulatoryContact {
  id: string;
  jurisdiction: Jurisdiction;
  agencyName: string;
  contactEmail: string;
  contactPhone?: string;
  reportingEndpoint: string;
  authMethod: 'api_key' | 'oauth2' | 'mtls' | 'certificate';
  supportedFormats: ReportFormat[];
}

export interface FilingResult {
  reportId: string;
  jurisdiction: Jurisdiction;
  submittedAt: string;
  confirmationId?: string;
  status: 'accepted' | 'rejected' | 'pending_review';
  errors?: FilingError[];
}

export interface FilingError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ComplianceEvent {
  id: string;
  eventType: string;
  entityId: string;
  entityType: 'user' | 'transaction' | 'credential';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: string;
  resolvedAt?: string;
  metadata: Record<string, unknown>;
}

export interface ScreeningResult {
  entityId: string;
  entityName: string;
  searchType: 'sanctions' | 'pep' | 'adverse_media';
  matches: ScreeningMatch[];
  score: number;
  threshold: number;
  passed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface ScreeningMatch {
  listName: string;
  listSource: string;
  matchedName: string;
  matchScore: number;
  matchType: 'exact' | 'fuzzy' | 'alias' | 'phonetic' | 'partial';
  additionalInfo: Record<string, unknown>;
}

export interface RegulatorInterface {
  generateReport(type: ReportType, jurisdiction: Jurisdiction, period: ReportPeriod, data: Record<string, unknown>): Promise<RegulatoryReport>;
  submitReport(report: RegulatoryReport): Promise<FilingResult>;
  getReportStatus(reportId: string): Promise<ReportStatus>;
  listReports(jurisdiction: Jurisdiction, status?: ReportStatus): Promise<RegulatoryReport[]>;
  archiveReport(reportId: string): Promise<void>;
  validateReport(report: RegulatoryReport): Promise<{ valid: boolean; errors: FilingError[] }>;
}
