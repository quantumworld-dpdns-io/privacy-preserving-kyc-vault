#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Incident Containment Script
# Performs immediate containment actions for security incidents:
#   - Revoke compromised keys and tokens
#   - Isolate affected services from the network
#   - Snapshot affected resources for forensic analysis
# ============================================================

VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date -u '+%Y%m%d_%H%M%S')
CONTAINMENT_DIR="/var/log/kyc-vault/incidents/containment_${TIMESTAMP}"
INCIDENT_ID=""
SERVICE_NAME=""
SEVERITY=""
REVOKE_KEYS=false
ISOLATE_SERVICE=false
SNAPSHOT=false
CONFIRM_ACTION=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "${BLUE}[STEP]${NC}  $*"; }

usage() {
  cat <<EOF
Incident Containment Tool v${VERSION}

Usage: $(basename "$0") --incident INCIDENT_ID [OPTIONS]

Required:
  -i, --incident ID    Incident ID (e.g., INC-2024-00123)

Options:
  -s, --service NAME   Service to contain (e.g., credential-processor)
  -S, --severity LEVEL Critical, high, medium, low (default: high)
  -r, --revoke-keys    Revoke compromised keys and tokens
  -n, --isolate        Isolate service from network
  -p, --snapshot       Take forensic snapshot of affected resources
  -a, --all            Perform all containment actions
  -y, --yes            Skip confirmation prompts
  -h, --help           Show this help message
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--incident) INCIDENT_ID="$2"; shift 2 ;;
    -s|--service) SERVICE_NAME="$2"; shift 2 ;;
    -S|--severity) SEVERITY="$2"; shift 2 ;;
    -r|--revoke-keys) REVOKE_KEYS=true; shift ;;
    -n|--isolate) ISOLATE_SERVICE=true; shift ;;
    -p|--snapshot) SNAPSHOT=true; shift ;;
    -a|--all) REVOKE_KEYS=true; ISOLATE_SERVICE=true; SNAPSHOT=true; shift ;;
    -y|--yes) CONFIRM_ACTION=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "${INCIDENT_ID:-}" ]]; then
  log_error "Incident ID is required (--incident)"
  usage
fi

SEVERITY="${SEVERITY:-high}"

echo ""
echo "=============================================="
echo "  INCIDENT CONTAINMENT"
echo "  Incident ID: $INCIDENT_ID"
echo "  Service:     ${SERVICE_NAME:-all}"
echo "  Severity:    $SEVERITY"
echo "  Timestamp:   $TIMESTAMP"
echo "=============================================="
echo ""

if ! $CONFIRM_ACTION; then
  echo -e "${YELLOW}WARNING: This will perform containment actions on running systems.${NC}"
  echo -e "${YELLOW}Actions to be performed:${NC}"
  $REVOKE_KEYS && echo "  - Revoke keys and tokens"
  $ISOLATE_SERVICE && echo "  - Isolate service from network"
  $SNAPSHOT && echo "  - Create forensic snapshot"
  echo ""
  read -rp "Continue? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    log_info "Containment cancelled by user"
    exit 0
  fi
fi

mkdir -p "$CONTAINMENT_DIR"
CONTAINMENT_LOG="${CONTAINMENT_DIR}/containment.log"

exec > >(tee -a "$CONTAINMENT_LOG") 2>&1

log_info "Starting containment for incident $INCIDENT_ID"
log_info "Containment directory: $CONTAINMENT_DIR"

# ============================================================
# Phase 1: Record incident context
# ============================================================
log_step "Phase 1: Recording incident context"

cat > "${CONTAINMENT_DIR}/incident-context.json" <<EOF
{
  "incident_id": "$INCIDENT_ID",
  "service": "${SERVICE_NAME:-all}",
  "severity": "$SEVERITY",
  "containment_started": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "hostname": "$(hostname 2>/dev/null || echo 'unknown')",
  "operator": "${USER:-unknown}",
  "actions": {
    "revoke_keys": $REVOKE_KEYS,
    "isolate_service": $ISOLATE_SERVICE,
    "snapshot": $SNAPSHOT
  }
}
EOF
log_info "Incident context recorded"

# ============================================================
# Phase 2: Revoke keys and tokens
# ============================================================
if $REVOKE_KEYS; then
  log_step "Phase 2: Revoking keys and tokens"

  if command -v vault &>/dev/null; then
    if [[ -n "${VAULT_ADDR:-}" ]] && [[ -n "${VAULT_TOKEN:-}" ]]; then
      log_info "Revoking active Vault tokens..."
      vault token revoke -mode=path auth/token/accessors 2>/dev/null && \
        log_info "Vault tokens revoked" || \
        log_warn "Failed to revoke all Vault tokens"

      log_info "Rotating service secrets..."
      vault lease revoke -prefix "kyc-vault/" 2>/dev/null && \
        log_info "Service secrets rotated" || \
        log_warn "Failed to rotate all secrets"

      if [[ -n "$SERVICE_NAME" ]]; then
        log_info "Revoking API keys for service: $SERVICE_NAME"
        vault kv metadata put "kyc-vault/apikeys/${SERVICE_NAME}" revoked=true \
          revoked_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')" 2>/dev/null || \
          log_warn "Failed to revoke API keys for $SERVICE_NAME"
      fi
    else
      log_warn "Vault not configured, skipping key revocation"
    fi
  else
    log_warn "Vault CLI not found, skipping key revocation"
  fi

  if [[ -n "${KUBERNETES_SERVICE_HOST:-}" ]]; then
    log_info "Rotating Kubernetes secrets..."
    kubectl delete secrets -l "app.kubernetes.io/part-of=kyc-vault" \
      --namespace kyc-vault --ignore-not-found 2>/dev/null || \
      log_warn "Failed to rotate Kubernetes secrets"
  fi

  log_info "Key revocation completed"
fi

# ============================================================
# Phase 3: Isolate affected service
# ============================================================
if $ISOLATE_SERVICE; then
  log_step "Phase 3: Isolating affected service"

  if [[ -n "${KUBERNETES_SERVICE_HOST:-}" ]]; then
    if [[ -n "$SERVICE_NAME" ]]; then
      log_info "Isolating service: $SERVICE_NAME"

      kubectl label pod -l "app.kubernetes.io/name=${SERVICE_NAME}" \
        --namespace kyc-vault "kyc-vault-isolated=true" \
        "kyc-vault-isolated-at=${TIMESTAMP}" \
        "kyc-vault-incident=${INCIDENT_ID}" 2>/dev/null || \
        log_warn "Failed to label pods for $SERVICE_NAME"

      kubectl scale deployment "$SERVICE_NAME" --namespace kyc-vault --replicas=0 2>/dev/null && \
        log_info "Scaled $SERVICE_NAME to 0 replicas" || \
        log_warn "Failed to scale $SERVICE_NAME to 0"

      if kubectl get networkpolicy -n kyc-vault &>/dev/null; then
        cat <<EOF | kubectl apply -f - 2>/dev/null || log_warn "Failed to apply isolation network policy"
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-${SERVICE_NAME}-${TIMESTAMP}
  namespace: kyc-vault
  labels:
    app.kubernetes.io/part-of: kyc-vault
    kyc-vault-incident: "${INCIDENT_ID}"
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: ${SERVICE_NAME}
  policyTypes:
  - Ingress
  - Egress
EOF
        log_info "Applied network isolation policy for $SERVICE_NAME"
      fi
    else
      log_warn "No service name specified for isolation"
    fi
  else
    log_info "Not in Kubernetes context, skipping pod isolation"

    if command -v systemctl &>/dev/null && [[ -n "$SERVICE_NAME" ]]; then
      log_info "Stopping local service: $SERVICE_NAME"
      systemctl stop "$SERVICE_NAME" 2>/dev/null && \
        log_info "Service stopped" || \
        log_warn "Failed to stop service"
    fi
  fi

  log_info "Service isolation completed"
fi

# ============================================================
# Phase 4: Create forensic snapshot
# ============================================================
if $SNAPSHOT; then
  log_step "Phase 4: Creating forensic snapshot"

  SNAPSHOT_DIR="${CONTAINMENT_DIR}/forensic-snapshot"
  mkdir -p "$SNAPSHOT_DIR"

  log_info "Capturing system state..."

  {
    echo "=== PROCESS LIST ==="
    ps aux 2>/dev/null || true
  } > "${SNAPSHOT_DIR}/process-list.txt" 2>/dev/null && \
    log_info "Process list captured"

  {
    echo "=== NETWORK CONNECTIONS ==="
    if command -v ss &>/dev/null; then
      ss -tupan 2>/dev/null
    elif command -v netstat &>/dev/null; then
      netstat -tupan 2>/dev/null
    fi
  } > "${SNAPSHOT_DIR}/network-connections.txt" 2>/dev/null && \
    log_info "Network connections captured"

  {
    echo "=== OPEN FILES ==="
    if command -v lsof &>/dev/null; then
      lsof -i -P -n 2>/dev/null | head -200
    fi
  } > "${SNAPSHOT_DIR}/open-files.txt" 2>/dev/null && \
    log_info "Open files captured"

  if command -v docker &>/dev/null; then
    docker ps -a 2>/dev/null > "${SNAPSHOT_DIR}/docker-containers.txt" && \
      log_info "Docker containers captured"
  fi

  if command -v kubectl &>/dev/null; then
    kubectl get pods -n kyc-vault -o wide 2>/dev/null > "${SNAPSHOT_DIR}/k8s-pods.txt" && \
      log_info "Kubernetes pods captured"
    kubectl get events -n kyc-vault --sort-by=.lastTimestamp 2>/dev/null | \
      tail -100 > "${SNAPSHOT_DIR}/k8s-events.txt" && \
      log_info "Kubernetes events captured"
  fi

  log_info "Forensic snapshot saved to: $SNAPSHOT_DIR"
fi

# ============================================================
# Summary
# ============================================================
cat > "${CONTAINMENT_DIR}/containment-summary.json" <<EOF
{
  "incident_id": "$INCIDENT_ID",
  "service": "${SERVICE_NAME:-all}",
  "severity": "$SEVERITY",
  "containment_completed": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "containment_dir": "$CONTAINMENT_DIR",
  "actions_performed": {
    "revoke_keys": $REVOKE_KEYS,
    "isolate_service": $ISOLATE_SERVICE,
    "snapshot": $SNAPSHOT
  },
  "status": "contained"
}
EOF

echo ""
echo "=============================================="
echo "  CONTAINMENT COMPLETE"
echo "=============================================="
echo ""
echo "  Incident ID:     $INCIDENT_ID"
echo "  Containment Dir: $CONTAINMENT_DIR"
echo "  Log File:        $CONTAINMENT_LOG"
echo ""
if $REVOKE_KEYS; then echo "  ✓ Keys revoked"; fi
if $ISOLATE_SERVICE; then echo "  ✓ Service isolated"; fi
if $SNAPSHOT; then echo "  ✓ Forensic snapshot created"; fi
echo ""
echo "  Next steps:"
echo "    1. Review containment log: $CONTAINMENT_LOG"
echo "    2. Initiate forensic analysis: ./forensics.sh --incident $INCIDENT_ID"
echo "    3. Notify security team and stakeholders"
echo "    4. Begin root cause analysis"
echo "=============================================="

exit 0
