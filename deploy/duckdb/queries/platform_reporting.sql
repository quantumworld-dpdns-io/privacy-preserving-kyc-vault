-- Per-Platform Usage, Revenue & Fraud Rate Reporting

CREATE SCHEMA IF NOT EXISTS platform_reporting;

-- Monthly platform usage summary
SELECT
    metric_month,
    customer_id,
    tier,
    SUM(api_calls) AS total_api_calls,
    SUM(verifications) AS total_verifications,
    SUM(successful_verifications) AS successful_verifications,
    SUM(failed_verifications) AS failed_verifications,
    ROUND(SUM(failed_verifications) * 100.0 / NULLIF(SUM(verifications), 0), 2) AS failure_rate,
    ROUND(AVG(avg_response_time_ms), 0) AS avg_response_time_ms,
    MAX(p99_response_time_ms) AS max_p99_response_time_ms,
    SUM(storage_bytes) AS total_storage_bytes,
    SUM(compute_seconds) AS total_compute_seconds,
    SUM(ai_inference_count) AS total_ai_inferences,
    SUM(fraud_detections) AS total_fraud_detections,
    SUM(revenue_usd) AS total_revenue_usd
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ALL
ORDER BY metric_month DESC, total_revenue_usd DESC;

-- Per-platform fraud rate trends
SELECT
    customer_id,
    date_trunc('month', usage_date) AS month,
    SUM(verifications) AS total_verifications,
    SUM(fraud_detections) AS fraud_detections,
    ROUND(SUM(fraud_detections) * 100.0 / NULLIF(SUM(verifications), 0), 4) AS fraud_rate_pct,
    SUM(ai_inference_count) AS ai_inferences,
    tier
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY ALL
ORDER BY customer_id, month;

-- Tier breakdown: revenue and usage
SELECT
    tier,
    COUNT(DISTINCT customer_id) AS customers,
    SUM(api_calls) AS api_calls,
    SUM(verifications) AS verifications,
    SUM(revenue_usd) AS revenue,
    ROUND(SUM(revenue_usd) / NULLIF(SUM(verifications), 0), 4) AS revenue_per_verification,
    ROUND(SUM(fraud_detections) * 100.0 / NULLIF(SUM(verifications), 0), 4) AS fraud_rate,
    ROUND(AVG(avg_response_time_ms), 0) AS avg_response_time_ms,
    SUM(storage_bytes) AS storage_bytes,
    SUM(compute_seconds) AS compute_seconds
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY tier
ORDER BY revenue DESC;

-- Top 20 customers by revenue (trailing 12 months)
SELECT
    customer_id,
    tier,
    SUM(api_calls) AS api_calls,
    SUM(verifications) AS verifications,
    SUM(revenue_usd) AS revenue,
    ROUND(SUM(revenue_usd) / NULLIF(SUM(verifications), 0), 4) AS rpv,
    ROUND(AVG(avg_response_time_ms), 0) AS avg_latency_ms,
    SUM(fraud_detections) AS fraud_detections,
    ROUND(SUM(fraud_detections) * 100.0 / NULLIF(SUM(verifications), 0), 4) AS fraud_rate
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ALL
ORDER BY revenue DESC
LIMIT 20;

-- Monthly new customer acquisition
WITH first_usage AS (
    SELECT
        customer_id,
        MIN(usage_date) AS first_active_date,
        tier
    FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
    GROUP BY customer_id, tier
)
SELECT
    date_trunc('month', first_active_date) AS acquisition_month,
    tier,
    COUNT(DISTINCT customer_id) AS new_customers
FROM first_usage
WHERE first_active_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY ALL
ORDER BY acquisition_month DESC, tier;

-- Platform-wide SLA compliance (response time by tier)
SELECT
    tier,
    COUNT(*) AS measurement_days,
    ROUND(AVG(avg_response_time_ms), 0) AS avg_response_ms,
    ROUND(AVG(p99_response_time_ms), 0) AS avg_p99_ms,
    ROUND(COUNT(CASE WHEN p99_response_time_ms < 1000 THEN 1 END) * 100.0 / COUNT(*), 2) AS pct_under_1s,
    ROUND(COUNT(CASE WHEN p99_response_time_ms < 2000 THEN 1 END) * 100.0 / COUNT(*), 2) AS pct_under_2s,
    ROUND(COUNT(CASE WHEN p99_response_time_ms < 5000 THEN 1 END) * 100.0 / COUNT(*), 2) AS pct_under_5s
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tier
ORDER BY tier;

-- Region distribution of platform usage
SELECT
    region,
    COUNT(DISTINCT customer_id) AS customers,
    SUM(api_calls) AS api_calls,
    SUM(verifications) AS verifications,
    SUM(revenue_usd) AS revenue,
    ROUND(SUM(revenue_usd) * 100.0 / SUM(SUM(revenue_usd)) OVER (), 2) AS revenue_share_pct
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY region
ORDER BY revenue DESC;

-- Fraud detection rate by region
SELECT
    region,
    SUM(verifications) AS verifications,
    SUM(fraud_detections) AS fraud_detections,
    ROUND(SUM(fraud_detections) * 100.0 / NULLIF(SUM(verifications), 0), 4) AS fraud_rate_pct,
    SUM(ai_inference_count) AS ai_inferences,
    ROUND(SUM(ai_inference_count) * 1.0 / NULLIF(SUM(verifications), 0), 2) AS inferences_per_verification
FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
WHERE usage_date >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY region
ORDER BY fraud_rate_pct DESC;

-- Export: monthly revenue snapshot
COPY (
    SELECT
        metric_month,
        tier,
        region,
        COUNT(DISTINCT customer_id) AS active_customers,
        SUM(api_calls) AS api_calls,
        SUM(verifications) AS verifications,
        SUM(revenue_usd) AS revenue,
        SUM(fraud_detections) AS fraud_detections
    FROM read_parquet('s3://kyc-vault-data/iceberg/platform_analytics/*.parquet')
    WHERE usage_date >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY ALL
    ORDER BY metric_month, revenue DESC
) TO 'reports/monthly_revenue_snapshot.csv' (HEADER, DELIMITER ',');
