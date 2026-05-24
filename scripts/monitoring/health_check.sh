#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Comprehensive Health Check Script
# Checks all KYC Vault services, databases, and dependencies
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

EXIT_CODE=0
FAILURES=0
PASSES=0
WARNINGS=0

check() {
  local desc="$1"
  local status="$2"
  local msg="${3:-}"

  if [[ "$status" == "pass" ]]; then
    echo -e "  ${GREEN}[OK]${NC} $desc"
    PASSES=$((PASSES + 1))
  elif [[ "$status" == "warn" ]]; then
    echo -e "  ${YELLOW}[WARN]${NC} $desc - $msg"
    WARNINGS=$((WARNINGS + 1))
  else
    echo -e "  ${RED}[FAIL]${NC} $desc - $msg"
    FAILURES=$((FAILURES + 1))
    EXIT_CODE=1
  fi
}

section() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

API_BASE="${API_BASE:-https://api.kyc-vault.com/v1}"
AUTH_HEADER="Authorization: Bearer ${API_KEY:-test}"

echo "============================================"
echo "KYC Vault Comprehensive Health Check"
echo "Started: $(date)"
echo "============================================"

# ============================================================
# API Gateway
# ============================================================
section "API Gateway"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$API_BASE/health" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  check "API Health Endpoint" "pass"
else
  check "API Health Endpoint" "fail" "HTTP $HTTP_CODE"
fi

# ============================================================
# Internal Services
# ============================================================
section "Internal Services"

for svc in orchestrator credential-service ai-inference zkp-engine did-resolver webhook-relay compliance billing; do
  SVC_URL="${API_BASE}/health/${svc}"
  SVC_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$SVC_URL" 2>/dev/null || echo "000")
  if [[ "$SVC_CODE" == "200" ]]; then
    check "$svc" "pass"
  else
    check "$svc" "fail" "HTTP $SVC_CODE"
  fi
done

# ============================================================
# Database Checks
# ============================================================
section "Databases"

# PostgreSQL
if command -v psql &>/dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
  if psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
    check "PostgreSQL" "pass"
  else
    check "PostgreSQL" "fail" "Cannot connect"
  fi
else
  check "PostgreSQL" "warn" "psql or DATABASE_URL not configured"
fi

# Redis
if command -v redis-cli &>/dev/null && [[ -n "${REDIS_URL:-}" ]]; then
  if redis-cli -u "$REDIS_URL" ping &>/dev/null; then
    check "Redis" "pass"
    REDIS_MEM=$(redis-cli -u "$REDIS_URL" INFO memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2)
    check "Redis Memory: $REDIS_MEM" "pass"
  else
    check "Redis" "fail" "Cannot connect"
  fi
else
  check "Redis" "warn" "redis-cli or REDIS_URL not configured"
fi

# ============================================================
# Message Queue
# ============================================================
section "Message Queues"

if command -v kafka-topics.sh &>/dev/null; then
  check "Kafka CLI available" "pass"
else
  check "Kafka CLI" "warn" "kafka-topics.sh not found"
fi

# ============================================================
# AI Models
# ============================================================
section "AI Models"

OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
OLLAMA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$OLLAMA_HOST/api/tags" 2>/dev/null || echo "000")
if [[ "$OLLAMA_STATUS" == "200" ]]; then
  check "Ollama API" "pass"
  MODELS=$(curl -s "$OLLAMA_HOST/api/tags" 2>/dev/null | python3 -c "import sys,json; ms=[m['name'] for m in json.load(sys.stdin).get('models',[])]; print(' '.join(ms))" 2>/dev/null || echo "")
  if echo "$MODELS" | grep -q "all-MiniLM"; then
    check "all-MiniLM-L6-v2" "pass"
  else
    check "all-MiniLM-L6-v2" "warn" "Model not pulled"
  fi
  if echo "$MODELS" | grep -q "llama3.2-vision"; then
    check "llama3.2-vision" "pass"
  else
    check "llama3.2-vision" "warn" "Model not pulled"
  fi
  if echo "$MODELS" | grep -q "mistral"; then
    check "mistral" "pass"
  else
    check "mistral" "warn" "Model not pulled"
  fi
else
  check "Ollama API" "fail" "HTTP $OLLAMA_STATUS"
fi

# ============================================================
# Disk Space
# ============================================================
section "Disk Space"

USED_PCT=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [[ $USED_PCT -lt 80 ]]; then
  check "Root disk: ${USED_PCT}% used" "pass"
elif [[ $USED_PCT -lt 95 ]]; then
  check "Root disk: ${USED_PCT}% used" "warn"
else
  check "Root disk: ${USED_PCT}% used" "fail"
fi

# Data partition
if df /data &>/dev/null; then
  DATA_PCT=$(df /data | tail -1 | awk '{print $5}' | sed 's/%//')
  if [[ $DATA_PCT -lt 80 ]]; then
    check "Data disk: ${DATA_PCT}% used" "pass"
  else
    check "Data disk: ${DATA_PCT}% used" "warn"
  fi
fi

# ============================================================
# Memory
# ============================================================
section "Memory"

if command -v free &>/dev/null; then
  MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
  MEM_AVAIL=$(free -m | awk '/^Mem:/{print $7}')
  MEM_PCT=$(echo "scale=1; ($MEM_TOTAL - $MEM_AVAIL) * 100 / $MEM_TOTAL" | bc)
  if [[ $(echo "$MEM_PCT < 80" | bc) -eq 1 ]]; then
    check "Memory: ${MEM_PCT}% used (${MEM_AVAIL}M avail)" "pass"
  else
    check "Memory: ${MEM_PCT}% used" "warn"
  fi
fi

# ============================================================
# Process Health
# ============================================================
section "Process Health"

for proc in kyc-credential kyc-orchestrator kyc-ai; do
  if pgrep -f "$proc" &>/dev/null; then
    check "$proc" "pass"
  else
    check "$proc" "warn" "Process not found (may be containerized)"
  fi
done

# ============================================================
# Network
# ============================================================
section "Network Connectivity"

if command -v dig &>/dev/null; then
  if dig +short api.kyc-vault.com &>/dev/null; then
    check "DNS resolution" "pass"
  else
    check "DNS resolution" "warn" "Cannot resolve api.kyc-vault.com"
  fi
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "============================================"
echo "Health Check Complete"
echo "============================================"
echo "Passed:   $PASSES"
echo "Warnings: $WARNINGS"
echo "Failed:   $FAILURES"
echo "Status:   $([ $EXIT_CODE -eq 0 ] && echo 'HEALTHY' || echo 'UNHEALTHY')"
echo "Completed: $(date)"
echo "============================================"

exit $EXIT_CODE
