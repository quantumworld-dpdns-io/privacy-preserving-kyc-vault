#!/usr/bin/env bash
set -euo pipefail

# MinIO bucket setup for KYC Vault data lake
# Creates buckets with appropriate lifecycle policies and versioning

MINIO_ALIAS="${MINIO_ALIAS:-kyc}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minioadmin}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minioadmin}"

echo "==> Configuring MinIO client alias"
mc alias set "${MINIO_ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}"

# ── Data Lake Buckets ──────────────────────────────────────────

declare -A BUCKETS
BUCKETS=(
    ["kyc-vault-raw"]="Raw incoming credential data"
    ["kyc-vault-iceberg"]="Iceberg table data (Parquet + metadata)"
    ["kyc-vault-audit"]="Immutable audit log storage"
    ["kyc-vault-artifacts"]="ML models, configs, and deployment artifacts"
    ["kyc-vault-temp"]="Temporary staging area for ETL operations"
)

for bucket in "${!BUCKETS[@]}"; do
    desc="${BUCKETS[$bucket]}"
    echo "==> Creating bucket: ${bucket} (${desc})"
    mc mb "${MINIO_ALIAS}/${bucket}" 2>/dev/null || echo "  Bucket '${bucket}' already exists"

    # Enable versioning for all data lake buckets
    mc version enable "${MINIO_ALIAS}/${bucket}"
    echo "  Versioning enabled: ${bucket}"
done

# ── Lifecycle Policies ─────────────────────────────────────────

# Raw data: transition to cold storage after 30 days, expire after 1 year
mc ilm rule add "${MINIO_ALIAS}/kyc-vault-raw" \
    --filter "" \
    --expire-days "365" \
    --transition-days "30" \
    --transition-storage-class "GLACIER" \
    --id "raw-retention" \
    --noncurrent-transition-days "7" \
    --noncurrent-transition-storage-class "GLACIER" \
    --noncurrent-expire-days "90"

# Iceberg data: retain for long-term analytics
mc ilm rule add "${MINIO_ALIAS}/kyc-vault-iceberg" \
    --filter "" \
    --expire-days "2555" \
    --noncurrent-expire-days "90" \
    --id "iceberg-retention" \
    --expired-object-delete-markers "true"

# Audit data: regulatory compliance requires 7-year retention
mc ilm rule add "${MINIO_ALIAS}/kyc-vault-audit" \
    --filter "" \
    --expire-days "2555" \
    --noncurrent-expire-days "180" \
    --id "audit-retention-7yr"

# Temp data: clean up after 7 days
mc ilm rule add "${MINIO_ALIAS}/kyc-vault-temp" \
    --filter "" \
    --expire-days "7" \
    --id "temp-cleanup"

echo "==> Lifecycle policies applied"

# ── Encryption Settings ────────────────────────────────────────
# Enable SSE-S3 for all buckets by default
for bucket in "${!BUCKETS[@]}"; do
    mc encrypt set sse-s3 "${MINIO_ALIAS}/${bucket}"
    echo "  SSE-S3 encryption enabled: ${bucket}"
done

# ── Access Policy ──────────────────────────────────────────────
# Apply the IAM policy for credential bucket access
mc admin policy create "${MINIO_ALIAS}" credential-access deploy/minio/iam_policy.json
echo "==> IAM policy 'credential-access' created"

# Create a user for credential services
mc admin user add "${MINIO_ALIAS}" credential-service "${MINIO_ACCESS_KEY}"
mc admin policy set "${MINIO_ALIAS}" credential-access user=credential-service
echo "==> User 'credential-service' created with credential-access policy"

# ── Notification Setup (optional) ──────────────────────────────
# Enable bucket notification for Iceberg table changes
mc event add "${MINIO_ALIAS}/kyc-vault-iceberg" arn:minio:sqs::1:kafka \
    --event "put,delete,replica" \
    --prefix "events/" \
    --suffix ".parquet" 2>/dev/null || echo "  Bucket notification setup skipped (Kafka sink not configured)"

echo "==> MinIO setup complete!"
