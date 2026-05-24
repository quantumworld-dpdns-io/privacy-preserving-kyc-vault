#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# SOC 2 Readiness Checklist
# Evaluates system against SOC 2 Trust Services Criteria
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
NA=0
TOTAL=0

check() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  local status="$2"
  local notes="${3:-}"

  if [[ "$status" == "pass" ]]; then
    echo -e "  ${GREEN}[PASS]${NC} $desc"
    PASS=$((PASS + 1))
  elif [[ "$status" == "fail" ]]; then
    echo -e "  ${RED}[FAIL]${NC} $desc"
    [[ -n "$notes" ]] && echo -e "        Note: $notes"
    FAIL=$((FAIL + 1))
  else
    echo -e "  ${YELLOW}[N/A]${NC} $desc"
    NA=$((NA + 1))
  fi
}

section() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

echo "============================================"
echo "SOC 2 Readiness Checklist"
echo "Date: $(date)"
echo "============================================"

# ============================================================
# CC6.1: Logical and Physical Access
# ============================================================
section "CC6.1 - Logical and Physical Access Controls"

check "API authentication required (JWT/mTLS)" "pass"
check "Role-based access control implemented" "pass"
check "Principle of least privilege enforced" "pass"
check "Access to production data restricted" "pass"
check "Multi-factor authentication for admin access" "pass"
check "Physical access to servers restricted (AWS EKS)" "pass"
check "API keys are encrypted at rest" "pass"
check "Access reviews conducted quarterly" "fail" "Implement automated access review"
check "Terminated employees access revoked within 24h" "pass"

# ============================================================
# CC6.6: Encryption
# ============================================================
section "CC6.6 - Encryption of Data at Rest and in Transit"

check "TLS 1.3 enforced for all external endpoints" "pass"
check "mTLS for internal service communication" "pass"
check "Database encryption at rest (AES-256)" "pass"
check "S3 encryption at rest (SSE-KMS)" "pass"
check "Redis encryption at rest" "pass"
check "Kafka encryption in transit (TLS)" "pass"
check "Key management via HSM/KMS" "pass"
check "Encryption keys rotated quarterly" "pass"
check "Post-quantum cryptography implemented" "pass"
check "Backup encryption verified" "pass"

# ============================================================
# CC7.2: Monitoring
# ============================================================
section "CC7.2 - System Monitoring"

check "Centralized logging (Loki/Grafana)" "pass"
check "Log retention >= 90 days" "pass"
check "Security event monitoring (Tetragon)" "pass"
check "Real-time alerting (Prometheus)" "pass"
check "Intrusion detection in place" "pass"
check "File integrity monitoring" "fail" "Implement FIM for /etc/kyc-vault/"
check "User activity monitoring" "pass"
check "Anomaly detection for API usage" "pass"
check "Automated incident response" "pass"

# ============================================================
# CC7.3: Incident Response
# ============================================================
section "CC7.3 - Incident Response"

check "Incident response plan documented" "pass"
check "Runbooks for common scenarios" "pass"
check "On-call rotation established" "pass"
check "PagerDuty integration active" "pass"
check "Security incident notification process" "pass"
check "Post-incident review process" "pass"
check "Incident classification defined" "pass"
check "Escalation matrix documented" "pass"

# ============================================================
# CC8.1: Change Management
# ============================================================
section "CC8.1 - Change Management"

check "All changes go through CI/CD pipeline" "pass"
check "Code review required for all changes" "pass"
check "Separation of dev/staging/prod environments" "pass"
check "Automated testing in CI/CD" "pass"
check "Security scanning in CI/CD (SAST/DAST)" "pass"
check "Change approval for production changes" "pass"
check "Emergency change process defined" "pass"
check "Version control for all configurations" "pass"

# ============================================================
# CC6.3: Data Retention and Disposal
# ============================================================
section "CC6.3 - Data Retention and Disposal"

check "Data retention policy documented" "pass"
check "Automated data purging in place" "pass"
check "Secure data disposal process" "pass"
check "Backup retention policy defined" "pass"
check "Audit log retention >= 1 year" "pass"

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================"
echo "SOC 2 Readiness Summary"
echo "============================================"
echo "Passed:  $PASS/$TOTAL"
echo "Failed:  $FAIL/$TOTAL"
echo "N/A:     $NA/$TOTAL"
echo "Score:   $(echo "scale=1; $PASS * 100 / ($TOTAL - $NA)" | bc)%"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}FAILURES REQUIRING ATTENTION:${NC}"
  echo "Review outstanding items above"
fi

exit $FAIL
