-- ============================================================
-- Apache Iceberg Table Definitions for KYC Vault
-- ============================================================
-- Iceberg catalog: ky-catalog (AWS Glue / Hive / REST)

CREATE DATABASE IF NOT EXISTS kyc_lakehouse;
USE kyc_lakehouse;

-- ============================================================
-- Table 1: verification_events
-- Tracks every KYC verification event end-to-end
-- ============================================================
CREATE TABLE IF NOT EXISTS kyc_lakehouse.verification_events (
    event_id            STRING        COMMENT 'UUID v4 for each event',
    session_id          STRING        COMMENT 'Verification session ID',
    applicant_did       STRING        COMMENT 'DID of the applicant',
    event_type          STRING        COMMENT 'Event type: session_started, document_uploaded, document_verified, liveness_check, fraud_assessment, compliance_report, session_completed',
    event_version       STRING        COMMENT 'Event schema version',
    credential_type     STRING        COMMENT 'Type of credential involved',
    credential_id       STRING        COMMENT 'Credential identifier',
    issuer_did          STRING        COMMENT 'DID of the credential issuer',
    jurisdiction        STRING        COMMENT 'Jurisdiction code (ISO 3166-1 alpha-2)',
    status              STRING        COMMENT 'Event status: initiated, in_progress, completed, failed, retried',
    verification_result STRING        COMMENT 'Final result: approved, rejected, manual_review, pending',
    risk_score          DOUBLE        COMMENT 'Fraud risk score 0.0-1.0',
    confidence_score    DOUBLE        COMMENT 'AI confidence score 0.0-1.0',
    processing_time_ms  BIGINT        COMMENT 'Event processing duration in milliseconds',
    duration_seconds    BIGINT        COMMENT 'Session duration in seconds',
    workflow_version    STRING        COMMENT 'KYC workflow version identifier',
    metadata            MAP<STRING, STRING> COMMENT 'Additional event metadata as key-value pairs',
    region              STRING        COMMENT 'AWS region or deployment zone',
    tenant_id           STRING        COMMENT 'Multi-tenant identifier',
    created_at          TIMESTAMP     COMMENT 'Event creation timestamp (UTC)',
    ingested_at         TIMESTAMP     COMMENT 'Data lake ingestion timestamp',
    event_date          DATE          COMMENT 'Partition date derived from created_at'
)
COMMENT 'KYC verification events data lake table'
PARTITIONED BY (event_date)
WITH (
    'format-version'                  = '2',
    'write.format.default'            = 'parquet',
    'write.parquet.compression-codec' = 'zstd',
    'write.distribution-mode'         = 'hash',
    'write.target-file-size-bytes'    = '134217728',
    'commit.manifest-merge.enabled'   = 'true',
    'history.expire.max-snapshot-age-ms' = '604800000',
    'snapshot-retention.max-snapshot-count' = '100',
    'read.split.target-size'          = '268435456',
    'write.metadata.metrics.default'  = 'truncate(16)',
    'write.parquet.row-group-size-bytes' = '104857600',
    'optimize-metrics-enabled'        = 'true'
);

-- ============================================================
-- Table 2: credential_audit
-- Immutable audit log for credential lifecycle events
-- ============================================================
CREATE TABLE IF NOT EXISTS kyc_lakehouse.credential_audit (
    audit_id            STRING        COMMENT 'UUID v4 for audit record',
    credential_id       STRING        COMMENT 'Credential identifier',
    credential_type     STRING        COMMENT 'Type: passport, drivers_license, national_id, utility_bill, bank_statement',
    did                 STRING        COMMENT 'DID of the credential subject',
    issuer_did          STRING        COMMENT 'DID of the issuing authority',
    audit_action        STRING        COMMENT 'Action: credential_issued, credential_verified, credential_rejected, credential_expired, credential_revoked, credential_updated, fraud_detected, tamper_detected',
    previous_hash       STRING        COMMENT 'SHA-256 of previous audit record (blockchain chaining)',
    current_hash        STRING        COMMENT 'SHA-256 of this audit record',
    changes             MAP<STRING, STRING> COMMENT 'Changed fields and their new values',
    actor_did           STRING        COMMENT 'DID of the entity performing the action',
    jurisdiction        STRING        COMMENT 'Jurisdiction code',
    risk_score           DOUBLE       COMMENT 'Risk score at time of audit event',
    verification_tier    STRING       COMMENT 'Tier at time: basic, standard, enhanced, enterprise',
    metadata            STRING        COMMENT 'JSON blob of additional metadata',
    tenant_id           STRING        COMMENT 'Multi-tenant identifier',
    created_at          TIMESTAMP     COMMENT 'Audit record creation timestamp',
    ingested_at         TIMESTAMP     COMMENT 'Data lake ingestion timestamp',
    audit_date          DATE          COMMENT 'Partition date derived from created_at'
)
COMMENT 'Immutable credential audit trail with cryptographic chaining'
PARTITIONED BY (audit_date)
WITH (
    'format-version'                  = '2',
    'write.format.default'            = 'parquet',
    'write.parquet.compression-codec' = 'zstd',
    'write.distribution-mode'         = 'hash',
    'write.target-file-size-bytes'    = '67108864',
    'commit.manifest-merge.enabled'   = 'true',
    'history.expire.max-snapshot-age-ms' = '2592000000',
    'snapshot-retention.max-snapshot-count' = '200',
    'write.parquet.row-group-size-bytes' = '52428800'
);

-- ============================================================
-- Table 3: platform_analytics
-- Aggregated platform metrics for billing and reporting
-- ============================================================
CREATE TABLE IF NOT EXISTS kyc_lakehouse.platform_analytics (
    metric_id           STRING        COMMENT 'UUID v4 for metric record',
    customer_id         STRING        COMMENT 'Customer/tenant identifier',
    tier                STRING        COMMENT 'Subscription tier: free, starter, professional, enterprise',
    usage_date          DATE          COMMENT 'Date of usage measurement',
    api_calls           BIGINT        COMMENT 'Total API calls for the day',
    verifications       BIGINT        COMMENT 'Total verifications processed',
    successful_verifications BIGINT   COMMENT 'Successful verification count',
    failed_verifications BIGINT       COMMENT 'Failed verification count',
    avg_response_time_ms DOUBLE       COMMENT 'Average API response time in ms',
    p99_response_time_ms DOUBLE       COMMENT 'P99 API response time in ms',
    storage_bytes        BIGINT       COMMENT 'Storage used in bytes',
    compute_seconds      BIGINT       COMMENT 'Compute time in seconds',
    ai_inference_count   BIGINT       COMMENT 'Number of AI model invocations',
    fraud_detections     BIGINT       COMMENT 'Fraud detections triggered',
    active_credentials   BIGINT       COMMENT 'Active credentials count',
    revenue_usd          DECIMAL(12,2) COMMENT 'Revenue generated in USD',
    region              STRING        COMMENT 'AWS region',
    metadata            MAP<STRING, STRING> COMMENT 'Additional analytics metadata',
    created_at          TIMESTAMP     COMMENT 'Record creation timestamp',
    ingested_at         TIMESTAMP     COMMENT 'Data lake ingestion timestamp',
    metric_month        STRING        COMMENT 'Partition: YYYY-MM derived from usage_date'
)
COMMENT 'Aggregated platform analytics for billing and operational reporting'
PARTITIONED BY (metric_month)
WITH (
    'format-version'                  = '2',
    'write.format.default'            = 'parquet',
    'write.parquet.compression-codec' = 'zstd',
    'write.distribution-mode'         = 'hash',
    'write.target-file-size-bytes'    = '67108864'
);

-- ============================================================
-- Table maintenance procedures (Spark SQL / Athena)
-- ============================================================
-- OPTIMIZE kyc_lakehouse.verification_events REWRITE DATA USING bin_pack(256 MB);
-- OPTIMIZE kyc_lakehouse.credential_audit REWRITE DATA USING bin_pack(128 MB);
-- VACUUM kyc_lakehouse.verification_events RETAIN 168 HOURS;
-- VACUUM kyc_lakehouse.credential_audit RETAIN 720 HOURS;
-- CALL kyc_lakehouse.system.rewrite_manifests('kyc_lakehouse.verification_events');
-- CALL kyc_lakehouse.system.rewrite_data_files(table => 'kyc_lakehouse.verification_events', strategy => 'sort', sort_order => 'event_date, event_type');
