#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Compliance Audit Report Generator
# Parses the audit log and generates a compliance report
# covering GDPR, SOC 2, PCI-DSS, and internal policy.
# ============================================================

AUDIT_LOG="${AUDIT_LOG:-/var/log/kyc-vault/audit.log}"
OUTPUT_DIR="${OUTPUT_DIR:-./reports}"
REPORT_DATE=$(date +%Y-%m-%d)
REPORT_FILE="${OUTPUT_DIR}/compliance-audit-${REPORT_DATE}.md"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TOTAL_EVENTS=0
CRITICAL_EVENTS=0
HIGH_EVENTS=0
MEDIUM_EVENTS=0
LOW_EVENTS=0
DENIED_EVENTS=0
FAILED_AUTH=0
GDPR_VIOLATIONS=0
CCPA_VIOLATIONS=0
PCI_VIOLATIONS=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -l, --log FILE       Audit log file path (default: /var/log/kyc-vault/audit.log)
  -o, --output DIR     Output directory (default: ./reports)
  -d, --days N         Only include last N days (default: all)
  -f, --format FORMAT  Output format: markdown, json, html (default: markdown)
  -h, --help           Show this help message
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -l|--log) AUDIT_LOG="$2"; shift 2 ;;
    -o|--output) OUTPUT_DIR="$2"; shift 2 ;;
    -d|--days) DAYS_FILTER="$2"; shift 2 ;;
    -f|--format) OUTPUT_FORMAT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

mkdir -p "$OUTPUT_DIR"

if [[ ! -f "$AUDIT_LOG" ]]; then
  echo -e "${RED}Error: Audit log not found: $AUDIT_LOG${NC}"
  exit 1
fi

if command -v jq &>/dev/null; then
  PARSE_CMD="jq -c ."
else
  PARSE_CMD="cat"
fi

echo -e "${BLUE}Generating compliance audit report...${NC}"
echo "  Audit log: $AUDIT_LOG"
echo "  Output:    $REPORT_FILE"

while IFS= read -r line; do
  TOTAL_EVENTS=$((TOTAL_EVENTS + 1))

  SEVERITY=$(echo "$line" | $PARSE_CMD 2>/dev/null | grep -o '"severity":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  OUTCOME=$(echo "$line" | $PARSE_CMD 2>/dev/null | grep -o '"outcome":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
  REGULATION=$(echo "$line" | $PARSE_CMD 2>/dev/null | grep -o '"regulation":"[^"]*"' | cut -d'"' -f4 || echo "")

  case "$SEVERITY" in
    critical) CRITICAL_EVENTS=$((CRITICAL_EVENTS + 1)) ;;
    high) HIGH_EVENTS=$((HIGH_EVENTS + 1)) ;;
    medium) MEDIUM_EVENTS=$((MEDIUM_EVENTS + 1)) ;;
    low) LOW_EVENTS=$((LOW_EVENTS + 1)) ;;
  esac

  if [[ "$OUTCOME" == "denied" ]]; then
    DENIED_EVENTS=$((DENIED_EVENTS + 1))
  fi

  if echo "$line" | grep -q "auth_failure\|authentication_failed\|invalid_token"; then
    FAILED_AUTH=$((FAILED_AUTH + 1))
  fi

  case "$REGULATION" in
    GDPR) GDPR_VIOLATIONS=$((GDPR_VIOLATIONS + 1)) ;;
    CCPA) CCPA_VIOLATIONS=$((CCPA_VIOLATIONS + 1)) ;;
    PCI) PCI_VIOLATIONS=$((PCI_VIOLATIONS + 1)) ;;
  esac
done < <($PARSE_CMD < "$AUDIT_LOG" 2>/dev/null || cat "$AUDIT_LOG")

cat > "$REPORT_FILE" <<EOF
# Compliance Audit Report

**Generated:** $(date -u '+%Y-%m-%dT%H:%M:%SZ')
**Audit Log:** $AUDIT_LOG
**Period:** $([ -n "${DAYS_FILTER:-}" ] && echo "Last $DAYS_FILTER days" || echo "All time")

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Events | $TOTAL_EVENTS |
| Critical Events | $CRITICAL_EVENTS |
| High Events | $HIGH_EVENTS |
| Medium Events | $MEDIUM_EVENTS |
| Low Events | $LOW_EVENTS |
| Denied Requests | $DENIED_EVENTS |
| Failed Auth Attempts | $FAILED_AUTH |

## Regulatory Compliance Summary

| Regulation | Violations |
|------------|-----------|
| GDPR | $GDPR_VIOLATIONS |
| CCPA | $CCPA_VIOLATIONS |
| PCI-DSS | $PCI_VIOLATIONS |

## Event Breakdown by Severity

- **Critical ($CRITICAL_EVENTS):** Immediate investigation required
- **High ($HIGH_EVENTS):** Requires review within 24 hours
- **Medium ($MEDIUM_EVENTS):** Standard monitoring
- **Low ($LOW_EVENTS):** Informational

## Key Findings

EOF

if [[ $CRITICAL_EVENTS -gt 0 ]]; then
  {
    echo "### Critical Events Requiring Attention"
    echo ""
    echo "| Timestamp | Event | User | Action | Resolution |"
    echo "|-----------|-------|------|--------|------------|"
    $PARSE_CMD < "$AUDIT_LOG" 2>/dev/null | while IFS= read -r evt; do
      SEV=$(echo "$evt" | grep -o '"severity":"[^"]*"' | cut -d'"' -f4 || echo "")
      if [[ "$SEV" == "critical" ]]; then
        TS=$(echo "$evt" | grep -o '"timestamp":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
        USER=$(echo "$evt" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
        ACTION=$(echo "$evt" | grep -o '"action":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
        RESULT=$(echo "$evt" | grep -o '"outcome":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
        echo "| $TS | $ACTION | $USER | $ACTION | $RESULT |"
      fi
    done
    echo ""
  } >> "$REPORT_FILE"
fi

{
  echo "## Recommendations"
  echo ""
} >> "$REPORT_FILE"

if [[ $GDPR_VIOLATIONS -gt 0 ]]; then
  echo "- **GDPR:** $GDPR_VIOLATIONS violations found. Review data processing activities for EU data subjects." >> "$REPORT_FILE"
fi
if [[ $CCPA_VIOLATIONS -gt 0 ]]; then
  echo "- **CCPA:** $CCPA_VIOLATIONS violations found. Verify opt-out mechanisms and data deletion processes." >> "$REPORT_FILE"
fi
if [[ $PCI_VIOLATIONS -gt 0 ]]; then
  echo "- **PCI-DSS:** $PCI_VIOLATIONS violations found. Ensure financial data is properly scoped and protected." >> "$REPORT_FILE"
fi
if [[ $DENIED_EVENTS -gt 0 ]]; then
  echo "- **Access Denials:** $DENIED_EVENTS requests denied. Review access patterns and RBAC configurations." >> "$REPORT_FILE"
fi
if [[ $FAILED_AUTH -gt 0 ]]; then
  echo "- **Failed Authentication:** $FAILED_AUTH attempts failed. Investigate potential brute force or credential stuffing." >> "$REPORT_FILE"
fi

{
  echo ""
  echo "## Raw Statistics"
  echo ""
  echo '```'
  echo "Total Events:       $TOTAL_EVENTS"
  echo "Critical:           $CRITICAL_EVENTS"
  echo "High:               $HIGH_EVENTS"
  echo "Medium:             $MEDIUM_EVENTS"
  echo "Low:                $LOW_EVENTS"
  echo "Denied:             $DENIED_EVENTS"
  echo "Failed Auth:        $FAILED_AUTH"
  echo "GDPR Violations:    $GDPR_VIOLATIONS"
  echo "CCPA Violations:    $CCPA_VIOLATIONS"
  echo "PCI Violations:     $PCI_VIOLATIONS"
  echo '```'
  echo ""
  echo "---"
  echo "*Report generated by compliance/audit_report.sh*"
} >> "$REPORT_FILE"

echo -e "${GREEN}Compliance audit report generated:${NC} $REPORT_FILE"
echo ""
echo "Summary: $TOTAL_EVENTS events, $CRITICAL_EVENTS critical, $DENIED_EVENTS denied, $FAILED_AUTH auth failures"
echo "Regulatory: $GDPR_VIOLATIONS GDPR, $CCPA_VIOLATIONS CCPA, $PCI_VIOLATIONS PCI violations"

exit $((CRITICAL_EVENTS > 0 ? 1 : 0))
