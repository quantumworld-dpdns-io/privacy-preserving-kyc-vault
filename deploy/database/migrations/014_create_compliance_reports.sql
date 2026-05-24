CREATE TYPE report_status AS ENUM ('requested', 'generating', 'completed', 'failed');
CREATE TYPE report_type AS ENUM (
    'audit_trail', 'consent_audit', 'kyc_audit', 'data_export',
    'gdpr_export', 'ccpa_export', 'access_report', 'deletion_report',
    'monthly_summary', 'quarterly_summary', 'annual_summary',
    'aml_suspicious_activity', 'sanctions_screening'
);

CREATE TABLE IF NOT EXISTS compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id UUID,
    report_type report_type NOT NULL,
    status report_status NOT NULL DEFAULT 'requested',
    parameters JSONB DEFAULT '{}'::jsonb,
    filters JSONB DEFAULT '{}'::jsonb,
    file_path TEXT,
    file_hash VARCHAR(128),
    file_size_bytes BIGINT,
    record_count BIGINT,
    generated_by_did VARCHAR(512),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_reports_type ON compliance_reports (report_type);
CREATE INDEX idx_compliance_reports_status ON compliance_reports (status);
CREATE INDEX idx_compliance_reports_platform ON compliance_reports (platform_id);
CREATE INDEX idx_compliance_reports_requested ON compliance_reports (requested_at);
CREATE INDEX idx_compliance_reports_expires ON compliance_reports (expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_reports()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE compliance_reports
    SET status = 'failed',
        error_message = 'Report expired',
        updated_at = now()
    WHERE status IN ('requested', 'generating')
      AND expires_at IS NOT NULL
      AND expires_at < now();

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
