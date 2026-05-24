use datafusion::error::Result;
use datafusion::prelude::*;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<()> {
    // Create a DataFusion execution context
    let ctx = SessionContext::new();

    // Register Iceberg table through the REST catalog
    // Assumes Polaris or similar Iceberg REST catalog is running
    ctx.register_catalog(
        "kyc_catalog",
        Arc::new(
            datafusion::catalog::CatalogProvider::new()
                .await
                .expect("Failed to create catalog"),
        ),
    );

    // Register Parquet files directly as a data source
    ctx.register_parquet(
        "verification_events",
        "s3://kyc-vault-data/iceberg/verification_events/*.parquet",
        ParquetReadOptions::default(),
    )
    .await?;

    ctx.register_parquet(
        "credential_audit",
        "s3://kyc-vault-data/iceberg/credential_audit/*.parquet",
        ParquetReadOptions::default(),
    )
    .await?;

    ctx.register_parquet(
        "platform_analytics",
        "s3://kyc-vault-data/iceberg/platform_analytics/*.parquet",
        ParquetReadOptions::default(),
    )
    .await?;

    // ──────────────────────────────────────────────
    // Query 1: Verification funnel by credential type
    // ──────────────────────────────────────────────
    let funnel = ctx
        .sql(
            r#"
            SELECT
                credential_type,
                COUNT(DISTINCT session_id) AS total_sessions,
                COUNT(DISTINCT CASE WHEN verification_result = 'approved' THEN session_id END) AS approved,
                COUNT(DISTINCT CASE WHEN verification_result = 'rejected' THEN session_id END) AS rejected,
                ROUND(
                    COUNT(DISTINCT CASE WHEN verification_result = 'approved' THEN session_id END) * 100.0
                    / NULLIF(COUNT(DISTINCT session_id), 0), 2
                ) AS approval_rate
            FROM verification_events
            WHERE event_type = 'session_completed'
            GROUP BY credential_type
            ORDER BY total_sessions DESC
            "#,
        )
        .await?;

    println!("=== Verification Funnel by Credential Type ===");
    funnel.show().await?;

    // ──────────────────────────────────────────────
    // Query 2: Monthly issuance trends
    // ──────────────────────────────────────────────
    let issuance_trends = ctx
        .sql(
            r#"
            SELECT
                DATE_TRUNC('month', created_at)::DATE AS month,
                credential_type,
                COUNT(*) AS issued,
                COUNT(DISTINCT issuer_did) AS unique_issuers
            FROM credential_audit
            WHERE audit_action = 'credential_issued'
                AND created_at >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY month, credential_type
            ORDER BY month, issued DESC
            "#,
        )
        .await?;

    println!("\n=== Monthly Issuance Trends ===");
    issuance_trends.show().await?;

    // ──────────────────────────────────────────────
    // Query 3: Top platforms by usage and fraud rate
    // ──────────────────────────────────────────────
    let platform_stats = ctx
        .sql(
            r#"
            SELECT
                customer_id,
                tier,
                SUM(api_calls) AS total_api_calls,
                SUM(verifications) AS total_verifications,
                SUM(revenue_usd) AS total_revenue,
                SUM(fraud_detections) AS total_fraud,
                ROUND(
                    SUM(fraud_detections) * 100.0
                    / NULLIF(SUM(verifications), 0), 4
                ) AS fraud_rate_pct
            FROM platform_analytics
            WHERE usage_date >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY customer_id, tier
            ORDER BY total_revenue DESC
            LIMIT 20
            "#,
        )
        .await?;

    println!("\n=== Top 20 Platforms by Revenue ===");
    platform_stats.show().await?;

    // ──────────────────────────────────────────────
    // Query 4: Processing time percentiles
    // ──────────────────────────────────────────────
    let processing_times = ctx
        .sql(
            r#"
            SELECT
                credential_type,
                COUNT(*) AS verifications,
                ROUND(AVG(processing_time_ms), 0) AS avg_ms,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS median_ms,
                ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms), 0) AS p95_ms,
                ROUND(AVG(confidence_score), 4) AS avg_confidence
            FROM verification_events
            WHERE event_type = 'document_verified'
            GROUP BY credential_type
            ORDER BY avg_ms DESC
            "#,
        )
        .await?;

    println!("\n=== Verification Processing Times ===");
    processing_times.show().await?;

    // ──────────────────────────────────────────────
    // Query 5: Join verification events with credential audit
    // ──────────────────────────────────────────────
    let joined_analysis = ctx
        .sql(
            r#"
            SELECT
                v.credential_type,
                v.verification_result,
                COUNT(*) AS event_count,
                ROUND(AVG(v.risk_score), 4) AS avg_risk_score,
                ROUND(AVG(v.confidence_score), 4) AS avg_confidence,
                ROUND(AVG(v.processing_time_ms), 0) AS avg_processing_ms
            FROM verification_events v
            INNER JOIN credential_audit c
                ON v.credential_id = c.credential_id
            WHERE v.created_at >= CURRENT_DATE - INTERVAL '30 days'
                AND c.audit_action = 'credential_issued'
            GROUP BY v.credential_type, v.verification_result
            ORDER BY event_count DESC
            "#,
        )
        .await?;

    println!("\n=== Joined Credential + Verification Analysis ===");
    joined_analysis.show().await?;

    Ok(())
}
