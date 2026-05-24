-- ============================================================
-- DuckDB KYC Analytics Queries
-- ============================================================
-- Load required extensions
INSTALL json;
LOAD json;

-- ============================================================
-- SCHEMA DEFINITIONS
-- ============================================================

CREATE SCHEMA IF NOT EXISTS kyc_analytics;

-- Credentials fact table
CREATE OR REPLACE VIEW kyc_analytics.credential_summary AS
SELECT
    credential_type,
    issuer_did,
    jurisdiction,
    verification_status,
    COUNT(*) AS credential_count,
    AVG(risk_score) AS avg_risk_score,
    MIN(issuance_date) AS earliest_issuance,
    MAX(issuance_date) AS latest_issuance
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
GROUP BY ALL;

-- ============================================================
-- ANALYTICS QUERIES
-- ============================================================

-- Q1: KYC Verification funnel
WITH funnel AS (
    SELECT
        COUNT(DISTINCT session_id) AS total_sessions,
        COUNT(DISTINCT CASE WHEN status = 'completed' THEN session_id END) AS completed_sessions,
        COUNT(DISTINCT CASE WHEN verification_result = 'approved' THEN session_id END) AS approved_sessions,
        COUNT(DISTINCT CASE WHEN verification_result = 'rejected' THEN session_id END) AS rejected_sessions
    FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
    WHERE event_type = 'session_completed'
)
SELECT
    total_sessions,
    completed_sessions,
    ROUND(completed_sessions * 100.0 / total_sessions, 2) AS completion_rate,
    approved_sessions,
    ROUND(approved_sessions * 100.0 / NULLIF(completed_sessions, 0), 2) AS approval_rate,
    rejected_sessions,
    ROUND(rejected_sessions * 100.0 / NULLIF(completed_sessions, 0), 2) AS rejection_rate
FROM funnel;

-- Q2: Average verification time by credential type
SELECT
    credential_type,
    COUNT(*) AS verifications,
    AVG(processing_time_ms) AS avg_time_ms,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY processing_time_ms) AS median_time_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) AS p95_time_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY processing_time_ms) AS p99_time_ms
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'document_verified'
GROUP BY credential_type
ORDER BY avg_time_ms DESC;

-- Q3: Fraud detection rate over time (monthly)
SELECT
    date_trunc('month', detected_at) AS month,
    indicator_type,
    severity,
    COUNT(*) AS detection_count
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
WHERE audit_action IN ('fraud_detected', 'suspicious_activity')
GROUP BY ALL
ORDER BY month DESC, detection_count DESC;

-- Q4: Top issuing jurisdictions by credential volume
SELECT
    jurisdiction,
    COUNT(*) AS credential_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage,
    ROUND(AVG(risk_score), 4) AS avg_risk_score,
    COUNT(DISTINCT issuer_did) AS unique_issuers
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
GROUP BY jurisdiction
ORDER BY credential_count DESC
LIMIT 20;

-- Q5: Platform revenue metrics (if billing enabled)
SELECT
    date_trunc('month', usage_date) AS month,
    tier,
    COUNT(DISTINCT customer_id) AS active_customers,
    SUM(api_calls) AS total_api_calls,
    SUM(verifications) AS total_verifications,
    SUM(revenue_usd) AS total_revenue
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ALL
ORDER BY month;

-- Q6: Credential expiration tracking
SELECT
    credential_type,
    COUNT(*) AS total,
    COUNT(CASE WHEN expiration_date < CURRENT_DATE THEN 1 END) AS expired,
    COUNT(CASE WHEN expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' THEN 1 END) AS expiring_30d,
    COUNT(CASE WHEN expiration_date BETWEEN CURRENT_DATE + INTERVAL '31 days' AND CURRENT_DATE + INTERVAL '90 days' THEN 1 END) AS expiring_90d
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
GROUP BY credential_type;

-- Q7: Verification workflow performance
SELECT
    workflow_version,
    COUNT(*) AS session_count,
    ROUND(AVG(duration_seconds), 2) AS avg_duration_seconds,
    ROUND(APPROXIMATE_MEDIAN(duration_seconds), 2) AS median_duration_seconds,
    ROUND(AVG(confidence_score), 4) AS avg_confidence
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'session_completed'
GROUP BY workflow_version
ORDER BY workflow_version;

-- Q8: Data quality metrics
SELECT
    'credentials' AS table_name,
    COUNT(*) AS row_count,
    COUNT(CASE WHEN credential_id IS NULL THEN 1 END) AS null_credential_ids,
    COUNT(CASE WHEN did IS NULL THEN 1 END) AS null_dids,
    COUNT(DISTINCT did) AS unique_subjects,
    COUNT(DISTINCT credential_type) AS unique_types
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet');

-- Q9: Peak usage hours analysis
SELECT
    EXTRACT(hour FROM created_at) AS hour_of_day,
    COUNT(*) AS event_count,
    ROUND(AVG(processing_time_ms), 0) AS avg_processing_ms
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
GROUP BY ALL
ORDER BY event_count DESC;

-- Q10: Multi-credential verification patterns
SELECT
    num_credentials,
    COUNT(*) AS session_count,
    ROUND(AVG(risk_score), 4) AS avg_risk_score,
    ROUND(AVG(confidence_score), 4) AS avg_confidence
FROM (
    SELECT
        session_id,
        COUNT(*) AS num_credentials,
        AVG(risk_score) AS risk_score,
        AVG(confidence_score) AS confidence_score
    FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
    WHERE event_type IN ('document_verified', 'session_completed')
    GROUP BY session_id
) sub
GROUP BY num_credentials
ORDER BY num_credentials;

-- ============================================================
-- EXPORT FOR REPORTING
-- ============================================================
COPY (
    SELECT * FROM kyc_analytics.credential_summary
) TO 'reports/credential_summary.csv' (HEADER, DELIMITER ',');
