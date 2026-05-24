#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Database Backup Script
# Supports: PostgreSQL, SQLite, S3 upload
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

BACKUP_DIR="${BACKUP_DIR:-/var/backups/kyc-vault}"
S3_BUCKET="${S3_BUCKET:-s3://kyc-vault-backups}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-kycvault}"
DB_USER="${DB_USER:-kyc_admin}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"
PG_BIN="${PG_BIN:-$(command -v pg_dump 2>/dev/null || echo /usr/lib/postgresql/16/bin/pg_dump)}"

usage() {
  echo "Usage: $0 [--db=<name>] [--host=<host>] [--port=<port>] [--s3-bucket=<bucket>]"
  echo "       [--backup-dir=<dir>] [--retention-days=<days>]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db=*) DB_NAME="${1#*=}" ;;
    --host=*) DB_HOST="${1#*=}" ;;
    --port=*) DB_PORT="${1#*=}" ;;
    --s3-bucket=*) S3_BUCKET="${1#*=}" ;;
    --backup-dir=*) BACKUP_DIR="${1#*=}" ;;
    --retention-days=*) RETENTION_DAYS="${1#*=}" ;;
    --help) usage ;;
    *) log_error "Unknown option: $1"; usage ;;
  esac
  shift
done

mkdir -p "$BACKUP_DIR"

log_info "Starting backup of $DB_NAME@$DB_HOST:$DB_PORT"
log_info "Backup file: $BACKUP_FILE"

# Perform backup
if command -v pg_dump &>/dev/null || [[ -x "$PG_BIN" ]]; then
  log_info "Using pg_dump for PostgreSQL backup"
  PGPASSWORD="${DB_PASSWORD}" "$PG_BIN" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --verbose \
    --file="${BACKUP_FILE%.gz}" 2>&1 | tail -5

  gzip "${BACKUP_FILE%.gz}"
else
  log_error "pg_dump not found. Install postgresql-client or set PG_BIN"
  exit 1
fi

BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
log_info "Backup size: $((BACKUP_SIZE / 1024 / 1024)) MB"

# Upload to S3
if command -v aws &>/dev/null; then
  S3_KEY="database/${DB_NAME}-${TIMESTAMP}.sql.gz"
  log_info "Uploading to $S3_BUCKET/$S3_KEY"
  aws s3 cp "$BACKUP_FILE" "${S3_BUCKET}/${S3_KEY}" --storage-class STANDARD_IA
  log_info "Upload complete"
else
  log_warn "AWS CLI not found; skipping S3 upload"
fi

# Retention cleanup
log_info "Cleaning up backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

if command -v aws &>/dev/null; then
  aws s3 ls "${S3_BUCKET}/database/" | while read -r line; do
    DATE=$(echo "$line" | awk '{print $1}')
    FILE=$(echo "$line" | awk '{print $4}')
    if [[ -n "$DATE" && -n "$FILE" ]]; then
      FILE_AGE=$(( ( $(date +%s) - $(date -d "$DATE" +%s) ) / 86400 ))
      if [[ $FILE_AGE -gt $RETENTION_DAYS ]]; then
        aws s3 rm "${S3_BUCKET}/database/${FILE}"
        log_info "Removed old backup: $FILE"
      fi
    fi
  done
fi

log_info "Backup complete: $BACKUP_FILE"
echo "BACKUP_FILE=$BACKUP_FILE"
echo "BACKUP_SIZE_MB=$((BACKUP_SIZE / 1024 / 1024))"
