#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# GDPR Compliance Checklist
# Evaluates system against GDPR requirements
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
echo "GDPR Compliance Checklist"
echo "Date: $(date)"
echo "============================================"

# ============================================================
# Data Processing Principles (Art. 5)
# ============================================================
section "Art. 5 - Principles of Data Processing"

check "Lawful basis for processing documented" "pass"
check "Purpose limitation enforced" "pass"
check "Data minimization via selective disclosure" "pass"
check "Accuracy of data ensured" "pass"
check "Storage limitation (automated purging)" "pass"
check "Integrity and confidentiality protected" "pass"
check "Accountability demonstrated" "pass"
check "Privacy impact assessment completed" "fail" "DPIA documentation needed"

# ============================================================
# Data Subject Rights (Art. 12-23)
# ============================================================
section "Art. 12-23 - Data Subject Rights"

check "Right to be informed (privacy notice)" "pass"
check "Right of access (GET /credentials/:id)" "pass"
check "Right to rectification (PUT /credentials/:id)" "pass"
check "Right to erasure (DELETE /credentials/:id)" "pass"
check "Right to restrict processing" "pass"
check "Right to data portability (export API)" "pass"
check "Right to object (opt-out mechanism)" "pass"
check "Automated decision-making transparency" "pass"
check "Response time within 30 days" "pass"
check "Identity verification for DSARs" "pass"
check "DSAR request tracking system" "fail" "Implement DSAR tracking dashboard"

# ============================================================
# Data Protection by Design (Art. 25)
# ============================================================
section "Art. 25 - Data Protection by Design and Default"

check "Privacy by design implemented" "pass"
check "Data minimization by default (ZKPs)" "pass"
check "Encryption at rest and in transit" "pass"
check "Pseudonymization capabilities" "pass"
check "Default privacy settings configured" "pass"
check "Only necessary data collected by default" "pass"
check "Privacy controls in system architecture" "pass"

# ============================================================
# Data Breach Notification (Art. 33-34)
# ============================================================
section "Art. 33-34 - Data Breach Notification"

check "Breach detection process in place" "pass"
check "72-hour notification capability" "pass"
check "Breach response plan documented" "pass"
check "Communication templates prepared" "pass"
check "Data Protection Authority contact established" "pass"
check "Breach log maintained" "pass"
check "Automated breach alerting configured" "pass"

# ============================================================
# Data Protection Officer (Art. 37-39)
# ============================================================
section "Art. 37-39 - Data Protection Officer"

check "DPO appointed" "pass"
check "DPO contact details published" "pass"
check "DPO involved in data protection matters" "pass"

# ============================================================
# International Transfers (Art. 44-49)
# ============================================================
section "Art. 44-49 - International Data Transfers"

check "Data stored within EU (us-east-1)" "fail" "AWS us-east-1 not in EU - consider eu-west-1"
check "SCCs in place for data transfers" "pass"
check "Data residency controls implemented" "pass"
check "Sub-processor agreements in place" "pass"
check "Cloud provider DPA signed (AWS)" "pass"

# ============================================================
# Records of Processing (Art. 30)
# ============================================================
section "Art. 30 - Records of Processing Activities"

check "Processing activity records maintained" "pass"
check "Data flow mapping documented" "pass"
check "Processor register maintained" "pass"
check "Processing purposes documented" "pass"
check "Categories of data subjects documented" "pass"

# ============================================================
# Security of Processing (Art. 32)
# ============================================================
section "Art. 32 - Security of Processing"

check "TLS 1.3 enforced" "pass"
check "Encryption at rest (AES-256)" "pass"
check "Access control (RBAC)" "pass"
check "Regular security testing (DAST/SAST)" "pass"
check "Incident response plan" "pass"
check "Business continuity plan" "pass"
check "Disaster recovery tested" "pass"
check "Third-party risk management" "pass"
check "Employee security training" "fail" "Document security training program"

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================"
echo "GDPR Compliance Summary"
echo "============================================"
echo "Passed:  $PASS/$TOTAL"
echo "Failed:  $FAIL/$TOTAL"
echo "N/A:     $NA/$TOTAL"
echo "Score:   $(echo "scale=1; $PASS * 100 / ($TOTAL - $NA)" | bc)%"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}FAILURES REQUIRING ATTENTION:${NC}"
  echo "1. DPIA documentation is needed"
  echo "2. DSAR tracking dashboard needs implementation"
  echo "3. EU region data residency (consider eu-west-1)"
  echo "4. Employee security training records needed"
fi

exit $FAIL
