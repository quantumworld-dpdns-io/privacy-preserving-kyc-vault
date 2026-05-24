-- KYC Pipeline Throughput, Conversion Rates & Review Time Analytics

CREATE SCHEMA IF NOT EXISTS kyc_pipeline;

-- Pipeline throughput: sessions by stage and status
WITH pipeline_stages AS (
    SELECT
        event_type,
        status,
        COUNT(DISTINCT session_id) AS sessions,
        ROUND(AVG(processing_time_ms), 0) AS avg_processing_ms,
        ROUND(AVG(duration_seconds), 0) AS avg_duration_seconds
    FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY ALL
)
SELECT
    event_type,
    status,
    sessions,
    avg_processing_ms,
    avg_duration_seconds,
    ROUND(sessions * 100.0 / SUM(sessions) OVER (), 2) AS pct_of_total
FROM pipeline_stages
ORDER BY sessions DESC;

-- End-to-end conversion funnel
WITH funnel AS (
    SELECT
        COUNT(DISTINCT session_id) AS sessions_started,
        COUNT(DISTINCT CASE WHEN event_type = 'document_uploaded' THEN session_id END) AS documents_uploaded,
        COUNT(DISTINCT CASE WHEN event_type = 'document_verified' THEN session_id END) AS documents_verified,
        COUNT(DISTINCT CASE WHEN event_type = 'liveness_check' THEN session_id END) AS liveness_checked,
        COUNT(DISTINCT CASE WHEN event_type = 'fraud_assessment' THEN session_id END) AS fraud_assessed,
        COUNT(DISTINCT CASE WHEN event_type = 'session_completed' AND verification_result = 'approved' THEN session_id END) AS approved,
        COUNT(DISTINCT CASE WHEN event_type = 'session_completed' AND verification_result = 'rejected' THEN session_id END) AS rejected
    FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND event_type IN ('session_started', 'document_uploaded', 'document_verified',
                           'liveness_check', 'fraud_assessment', 'session_completed')
)
SELECT
    'session_started' AS stage, sessions_started AS count,
    ROUND(100.0, 2) AS retention_pct, ROUND(100.0, 2) AS conversion_from_start
UNION ALL
SELECT
    'document_uploaded', documents_uploaded,
    ROUND(documents_uploaded * 100.0 / sessions_started, 2),
    ROUND(documents_uploaded * 100.0 / sessions_started, 2)
UNION ALL
SELECT
    'document_verified', documents_verified,
    ROUND(documents_verified * 100.0 / NULLIF(documents_uploaded, 0), 2),
    ROUND(documents_verified * 100.0 / sessions_started, 2)
UNION ALL
SELECT
    'liveness_check', liveness_checked,
    ROUND(liveness_checked * 100.0 / NULLIF(documents_verified, 0), 2),
    ROUND(liveness_checked * 100.0 / sessions_started, 2)
UNION ALL
SELECT
    'fraud_assessment', fraud_assessed,
    ROUND(fraud_assessed * 100.0 / NULLIF(liveness_checked, 0), 2),
    ROUND(fraud_assessed * 100.0 / sessions_started, 2)
UNION ALL
SELECT
    'approved', approved,
    ROUND(approved * 100.0 / NULLIF(fraud_assessed, 0), 2),
    ROUND(approved * 100.0 / sessions_started, 2)
UNION ALL
SELECT
    'rejected', rejected,
    ROUND(rejected * 100.0 / NULLIF(fraud_assessed, 0), 2),
    ROUND(rejected * 100.0 / sessions_started, 2);

-- Average review time by workflow version and credential type
SELECT
    workflow_version,
    credential_type,
    COUNT(*) AS sessions,
    ROUND(AVG(duration_seconds), 2) AS avg_review_time_seconds,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_seconds), 2) AS median_review_time_seconds,
    ROUND(AVG(processing_time_ms), 0) AS avg_processing_ms,
    ROUND(COUNT(CASE WHEN verification_result = 'approved' THEN 1 END) * 100.0 / COUNT(*), 2) AS approval_rate,
    ROUND(COUNT(CASE WHEN verification_result = 'manual_review' THEN 1 END) * 100.0 / COUNT(*), 2) AS manual_review_rate
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'session_completed'
    AND created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY ALL
ORDER BY avg_review_time_seconds DESC;

-- Daily conversion rate trend (last 90 days)
SELECT
    CAST(created_at AS DATE) AS review_date,
    COUNT(DISTINCT session_id) AS sessions,
    ROUND(COUNT(DISTINCT CASE WHEN verification_result = 'approved' THEN session_id END) * 100.0
        / NULLIF(COUNT(DISTINCT session_id), 0), 2) AS conversion_rate,
    ROUND(COUNT(DISTINCT CASE WHEN verification_result = 'rejected' THEN session_id END) * 100.0
        / NULLIF(COUNT(DISTINCT session_id), 0), 2) AS rejection_rate,
    ROUND(COUNT(DISTINCT CASE WHEN verification_result = 'manual_review' THEN session_id END) * 100.0
        / NULLIF(COUNT(DISTINCT session_id), 0), 2) AS manual_review_rate,
    AVG(duration_seconds) AS avg_duration_seconds
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'session_completed'
    AND created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY review_date
ORDER BY review_date;

-- Bottleneck detection: stages with highest latency
SELECT
    event_type,
    COUNT(*) AS events,
    ROUND(AVG(processing_time_ms), 0) AS avg_processing_ms,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS median_processing_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS p95_processing_ms,
    ROUND(AVG(duration_seconds), 0) AS avg_duration_sec,
    ROUND(COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*), 2) AS failure_rate
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY event_type
ORDER BY avg_processing_ms DESC;

-- Review time by operator/actor (manual review performance)
SELECT
    actor_did AS reviewer_did,
    COUNT(*) AS reviews_completed,
    ROUND(AVG(processing_time_ms), 0) AS avg_review_time_ms,
    ROUND(COUNT(CASE WHEN verification_result = 'approved' THEN 1 END) * 100.0 / COUNT(*), 2) AS approval_rate,
    ROUND(COUNT(CASE WHEN verification_result = 'rejected' THEN 1 END) * 100.0 / COUNT(*), 2) AS rejection_rate
FROM read_parquet('s3://kyc-vault-data/iceberg/verification_events/*.parquet')
WHERE event_type = 'session_completed'
    AND verification_result IN ('approved', 'rejected')
    AND actor_did IS NOT NULL
GROUP BY reviewer_did
ORDER BY reviews_completed DESC;
