-- Credential Issuance Trends & Verification Statistics

CREATE SCHEMA IF NOT EXISTS credential_analytics;

-- Issuance trends by credential type over time
WITH issuance_trends AS (
    SELECT
        date_trunc('month', created_at) AS issuance_month,
        credential_type,
        jurisdiction,
        COUNT(*) AS credentials_issued,
        COUNT(DISTINCT issuer_did) AS unique_issuers,
        COUNT(DISTINCT did) AS unique_subjects
    FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
    WHERE audit_action = 'credential_issued'
    GROUP BY ALL
)
SELECT
    issuance_month,
    credential_type,
    jurisdiction,
    credentials_issued,
    unique_issuers,
    unique_subjects,
    ROUND(credentials_issued * 100.0 / SUM(credentials_issued) OVER (PARTITION BY issuance_month), 2) AS pct_of_month,
    SUM(credentials_issued) OVER (
        PARTITION BY credential_type, jurisdiction
        ORDER BY issuance_month
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_issued
FROM issuance_trends
ORDER BY issuance_month DESC, credentials_issued DESC;

-- Month-over-month issuance growth
SELECT
    credential_type,
    date_trunc('month', created_at) AS month,
    COUNT(*) AS issued,
    LAG(COUNT(*)) OVER (PARTITION BY credential_type ORDER BY date_trunc('month', created_at)) AS prev_month,
    ROUND(
        (COUNT(*) - LAG(COUNT(*)) OVER (PARTITION BY credential_type ORDER BY date_trunc('month', created_at)))
        * 100.0 / NULLIF(LAG(COUNT(*)) OVER (PARTITION BY credential_type ORDER BY date_trunc('month', created_at)), 0),
        2
    ) AS mom_growth_pct
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
WHERE audit_action = 'credential_issued'
GROUP BY credential_type, month
ORDER BY credential_type, month;

-- Verification success/failure rates by credential type
SELECT
    credential_type,
    COUNT(*) AS total_verifications,
    COUNT(CASE WHEN verification_result = 'approved' THEN 1 END) AS approved,
    COUNT(CASE WHEN verification_result = 'rejected' THEN 1 END) AS rejected,
    COUNT(CASE WHEN verification_result = 'manual_review' THEN 1 END) AS manual_review,
    ROUND(COUNT(CASE WHEN verification_result = 'approved' THEN 1 END) * 100.0 / COUNT(*), 2) AS approval_rate,
    ROUND(COUNT(CASE WHEN verification_result = 'rejected' THEN 1 END) * 100.0 / COUNT(*), 2) AS rejection_rate,
    ROUND(COUNT(CASE WHEN verification_result = 'manual_review' THEN 1 END) * 100.0 / COUNT(*), 2) AS manual_review_rate,
    ROUND(AVG(risk_score), 4) AS avg_risk_score,
    ROUND(AVG(confidence_score), 4) AS avg_confidence_score
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'document_verified'
GROUP BY credential_type
ORDER BY total_verifications DESC;

-- Hourly verification volume distribution
SELECT
    EXTRACT(hour FROM created_at) AS hour_of_day,
    credential_type,
    COUNT(*) AS verifications,
    ROUND(AVG(processing_time_ms), 0) AS avg_processing_ms,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS median_processing_ms
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'document_verified'
    AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY ALL
ORDER BY hour_of_day, verifications DESC;

-- Daily issuance volume (last 90 days)
SELECT
    CAST(created_at AS DATE) AS issuance_date,
    credential_type,
    COUNT(*) AS daily_issued,
    ROUND(AVG(risk_score), 4) AS avg_risk_score
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
WHERE audit_action = 'credential_issued'
    AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY ALL
ORDER BY issuance_date;

-- Verification processing time percentiles
SELECT
    credential_type,
    COUNT(*) AS sample_size,
    ROUND(AVG(processing_time_ms), 0) AS avg_ms,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS p25_ms,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS median_ms,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS p75_ms,
    ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS p90_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS p95_ms,
    ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS p99_ms,
    ROUND(AVG(confidence_score), 4) AS avg_confidence
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'document_verified'
GROUP BY credential_type
ORDER BY sample_size DESC;

-- Credential revocation and expiration summary
SELECT
    credential_type,
    COUNT(*) AS total_audited,
    COUNT(CASE WHEN audit_action = 'credential_revoked' THEN 1 END) AS revoked,
    COUNT(CASE WHEN audit_action = 'credential_expired' THEN 1 END) AS expired,
    ROUND(COUNT(CASE WHEN audit_action IN ('credential_revoked', 'credential_expired') THEN 1 END) * 100.0 / COUNT(*), 2) AS inactive_rate,
    COUNT(DISTINCT issuer_did) AS unique_issuers
FROM read_parquet('s3://kyc-vault-data/iceberg/credential_audit/*.parquet')
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY credential_type
ORDER BY inactive_rate DESC;
