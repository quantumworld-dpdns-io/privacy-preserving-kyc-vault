#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Database Restore Script
# Restores PostgreSQL database from backup
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

BACKUP_FILE=""
S3_BUCKET="${S3_BUCKET:-s3://kyc-vault-backups}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-kycvault}"
DB_USER="${DB_USER:-kyc_admin}"
TARGET_DB="${TARGET_DB:-}"
DROP_EXISTING=false
PG_BIN="${PG_BIN:-$(command -v pg_restore 2>/dev/null || echo /usr/lib/postgresql/16/bin/pg_restore)}"

usage() {
  echo "Usage: $0 --backup-file=<file> [--target-db=<name>] [--host=<host>]"
  echo "       [--port=<port>] [--drop-existing] [--s3-bucket=<bucket>]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-file=*) BACKUP_FILE="${1#*=}" ;;
    --target-db=*) TARGET_DB="${1#*=}" ;;
    --host=*) DB_HOST="${1#*=}" ;;
    --port=*) DB_PORT="${1#*=}" ;;
    --drop-existing) DROP_EXISTING=true ;;
    --s3-bucket=*) S3_BUCKET="${1#*=}" ;;
    --help) usage ;;
    *) log_error "Unknown option: $1"; usage ;;
  esac
  shift
done

if [[ -z "$BACKUP_FILE" ]]; then
  log_error "--backup-file is required"
  usage
fi

# Download from S3 if needed
if [[ "$BACKUP_FILE" == s3://* ]]; then
  if ! command -v aws &>/dev/null; then
    log_error "AWS CLI required for S3 downloads"
    exit 1
  fi
  LOCAL_FILE="/tmp/kyc-restore-$(basename "$BACKUP_FILE")"
  log_info "Downloading from S3: $BACKUP_FILE"
  aws s3 cp "$BACKUP_FILE" "$LOCAL_FILE"
  BACKUP_FILE="$LOCAL_FILE"
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  log_error "Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Determine compression and format
if [[ "$BACKUP_FILE" == *.gz ]]; then
  DECOMPRESS="gunzip -c"
  RESTORE_FILE="${BACKUP_FILE%.gz}"
else
  DECOMPRESS="cat"
  RESTORE_FILE="$BACKUP_FILE"
fi

TARGET_DB="${TARGET_DB:-${DB_NAME}_restore_$(date +%Y%m%d_%H%M%S)}"

log_info "Starting restore to database: $TARGET_DB"
log_info "Source backup: $BACKUP_FILE"

# Create target database
log_info "Creating database: $TARGET_DB"
if [[ "$DROP_EXISTING" == true ]]; then
  PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" 2>/dev/null || true
fi

PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE \"$TARGET_DB\" WITH ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8';"

# Restore from backup
log_info "Restoring data..."
if [[ "$RESTORE_FILE" != "$BACKUP_FILE" ]]; then
  # Compressed - pipe decompressed to pg_restore
  $DECOMPRESS "$BACKUP_FILE" | PGPASSWORD="${DB_PASSWORD}" "$PG_BIN" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$TARGET_DB" \
    --verbose \
    --jobs=4 \
    --no-owner \
    --no-privileges 2>&1 | tail -10
else
  PGPASSWORD="${DB_PASSWORD}" "$PG_BIN" \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$TARGET_DB" \
    --verbose \
    --jobs=4 \
    --no-owner \
    --no-privileges \
    "$RESTORE_FILE" 2>&1 | tail -10
fi

# Verify restore
log_info "Verifying restore..."
PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" \
  -c "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';"

PGPASSWORD="${DB_PASSWORD}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TARGET_DB" \
  -c "SELECT count(*) AS credential_count FROM credentials;" 2>/dev/null || true

log_info "Restore complete: $TARGET_DB"
echo "RESTORED_DB=$TARGET_DB"
echo "RESTORE_FILE=$BACKUP_FILE"

# Cleanup temp file
if [[ -f /tmp/kyc-restore-* ]]; then
  rm -f /tmp/kyc-restore-*
fi
