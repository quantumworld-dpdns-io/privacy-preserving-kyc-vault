#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Forensics Collection Script
# Collects forensic evidence for security incident investigation:
#   - System logs and application logs
#   - Memory captures (if available)
#   - Network connection records
#   - Running process snapshots
#   - File integrity information
# ============================================================

VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date -u '+%Y%m%d_%H%M%S')
FORENSICS_DIR="/var/log/kyc-vault/incidents/forensics_${TIMESTAMP}"
INCIDENT_ID=""
SERVICE_NAME=""
COLLECT_LOGS=false
COLLECT_MEMORY=false
COLLECT_NETWORK=false
COLLECT_PROCESSES=false
COLLECT_FILES=true
ALL_COLLECT=false
COMPRESS=false
MAX_LOG_SIZE=100

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
Forensics Collection Tool v${VERSION}

Usage: $(basename "$0") --incident INCIDENT_ID [OPTIONS]

Required:
  -i, --incident ID    Incident ID (e.g., INC-2024-00123)

Options:
  -s, --service NAME   Target service for focused collection
  -l, --logs           Collect system and application logs
  -m, --memory         Capture memory dumps (requires LiME/fmem)
  -n, --network        Capture network connections and traffic
  -p, --processes      Capture running process information
  -f, --files          Collect file integrity data (default: on)
  -a, --all            Collect all forensic data
  -z, --compress       Compress the collected evidence (tar.gz)
      --max-log-size   Max log file size in MB (default: 100)
  -h, --help           Show this help message
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--incident) INCIDENT_ID="$2"; shift 2 ;;
    -s|--service) SERVICE_NAME="$2"; shift 2 ;;
    -l|--logs) COLLECT_LOGS=true; shift ;;
    -m|--memory) COLLECT_MEMORY=true; shift ;;
    -n|--network) COLLECT_NETWORK=true; shift ;;
    -p|--processes) COLLECT_PROCESSES=true; shift ;;
    -f|--files) COLLECT_FILES=true; shift ;;
    -a|--all) ALL_COLLECT=true; shift ;;
    -z|--compress) COMPRESS=true; shift ;;
    --max-log-size) MAX_LOG_SIZE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "${INCIDENT_ID:-}" ]]; then
  log_error "Incident ID is required (--incident)"
  usage
fi

if $ALL_COLLECT; then
  COLLECT_LOGS=true
  COLLECT_MEMORY=true
  COLLECT_NETWORK=true
  COLLECT_PROCESSES=true
  COLLECT_FILES=true
fi

if ! $COLLECT_LOGS && ! $COLLECT_MEMORY && ! $COLLECT_NETWORK && ! $COLLECT_PROCESSES && ! $COLLECT_FILES; then
  COLLECT_LOGS=true
  COLLECT_NETWORK=true
  COLLECT_PROCESSES=true
  COLLECT_FILES=true
fi

mkdir -p "$FORENSICS_DIR"
FORENSICS_LOG="${FORENSICS_DIR}/forensics-collection.log"
EVIDENCE_DIR="${FORENSICS_DIR}/evidence"

exec > >(tee -a "$FORENSICS_LOG") 2>&1

echo ""
echo "=============================================="
echo "  FORENSICS COLLECTION"
echo "  Incident ID: $INCIDENT_ID"
echo "  Service:     ${SERVICE_NAME:-all}"
echo "  Timestamp:   $TIMESTAMP"
echo "  Output Dir:  $FORENSICS_DIR"
echo "=============================================="
echo ""

log_info "Starting forensics collection for incident $INCIDENT_ID"

# ============================================================
# Generate collection manifest
# ============================================================
log_step "Creating evidence manifest"

mkdir -p "$EVIDENCE_DIR"

cat > "${FORENSICS_DIR}/manifest.json" <<EOF
{
  "incident_id": "$INCIDENT_ID",
  "service": "${SERVICE_NAME:-all}",
  "collection_started": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "hostname": "$(hostname 2>/dev/null || echo 'unknown')",
  "collector": "${USER:-unknown}",
  "tools_available": {
    "lsof": $(command -v lsof &>/dev/null && echo true || echo false),
    "ss": $(command -v ss &>/dev/null && echo true || echo false),
    "tcpdump": $(command -v tcpdump &>/dev/null && echo true || echo false),
    "kubectl": $(command -v kubectl &>/dev/null && echo true || echo false),
    "docker": $(command -v docker &>/dev/null && echo true || echo false),
    "journalctl": $(command -v journalctl &>/dev/null && echo true || echo false),
    "strings": $(command -v strings &>/dev/null && echo true || echo false),
    "xxd": $(command -v xxd &>/dev/null && echo true || echo false)
  },
  "collected_artifacts": []
}
EOF

log_info "Manifest created"

# ============================================================
# Collection function: record artifact
# ============================================================
record_artifact() {
  local category="$1"
  local file="$2"
  local description="$3"
  local size_bytes=0
  local hash=""

  if [[ -f "$file" ]]; then
    size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    if command -v sha256sum &>/dev/null; then
      hash=$(sha256sum "$file" | cut -d' ' -f1)
    elif command -v shasum &>/dev/null; then
      hash=$(shasum -a 256 "$file" | cut -d' ' -f1)
    fi
  fi

  echo "$file:$description" >> "${FORENSICS_DIR}/collected-artifacts.txt"

  cat > "${FORENSICS_DIR}/.artifact_$$.json" <<EOF
,{
  "category": "$category",
  "path": "$file",
  "description": "$description",
  "size_bytes": $size_bytes,
  "hash": "${hash:-unknown}",
  "collected_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
  sed -i '' '$s/}$/}/' "${FORENSICS_DIR}/manifest.json" 2>/dev/null || true
  cat "${FORENSICS_DIR}/.artifact_$$.json" >> "${FORENSICS_DIR}/manifest.json"
  rm -f "${FORENSICS_DIR}/.artifact_$$.json"
}

# ============================================================
# Collect logs
# ============================================================
if $COLLECT_LOGS; then
  log_step "Collecting system and application logs"

  LOG_DIR="${EVIDENCE_DIR}/logs"
  mkdir -p "$LOG_DIR"

  if command -v journalctl &>/dev/null; then
    log_info "Collecting system journal (last 24 hours)..."
    journalctl --since "24 hours ago" --no-pager 2>/dev/null | \
      head -n "$((MAX_LOG_SIZE * 1000))" > "${LOG_DIR}/system-journal.log" 2>/dev/null || \
      log_warn "Failed to collect system journal"
    record_artifact "logs" "${LOG_DIR}/system-journal.log" "System journal (last 24h)"
  fi

  if [[ -d "/var/log/kyc-vault" ]]; then
    log_info "Collecting KYC Vault application logs..."
    find /var/log/kyc-vault -name "*.log" -mtime -7 2>/dev/null | while IFS= read -r logfile; do
      safe_name=$(echo "$logfile" | tr '/' '_')
      cp "$logfile" "${LOG_DIR}/app_${safe_name}" 2>/dev/null || \
        log_warn "Failed to copy $logfile"
    done
    record_artifact "logs" "${LOG_DIR}" "KYC Vault application logs (7 days)"
  fi

  if command -v kubectl &>/dev/null; then
    log_info "Collecting Kubernetes pod logs..."
    NS="${NAMESPACE:-kyc-vault}"
    if [[ -n "$SERVICE_NAME" ]]; then
      kubectl logs -n "$NS" -l "app.kubernetes.io/name=${SERVICE_NAME}" \
        --tail=10000 --all-containers 2>/dev/null > "${LOG_DIR}/k8s-${SERVICE_NAME}.log" && \
        record_artifact "logs" "${LOG_DIR}/k8s-${SERVICE_NAME}.log" \
          "Kubernetes logs for $SERVICE_NAME" || \
        log_warn "Failed to collect k8s logs for $SERVICE_NAME"
    else
      kubectl logs -n "$NS" --tail=5000 --all-containers \
        -l "app.kubernetes.io/part-of=kyc-vault" 2>/dev/null > "${LOG_DIR}/k8s-all.log" && \
        record_artifact "logs" "${LOG_DIR}/k8s-all.log" \
          "All KYC Vault k8s logs" || \
        log_warn "Failed to collect all k8s logs"
    fi
  fi

  if command -v docker &>/dev/null; then
    log_info "Collecting Docker container logs..."
    docker ps --format '{{.Names}}' 2>/dev/null | while IFS= read -r cname; do
      docker logs "$cname" --tail 5000 2>/dev/null > "${LOG_DIR}/docker-${cname}.log" 2>/dev/null || true
    done
    record_artifact "logs" "${LOG_DIR}" "Docker container logs"
  fi

  log_info "Log collection completed"
fi

# ============================================================
# Collect memory (if tools available)
# ============================================================
if $COLLECT_MEMORY; then
  log_step "Collecting memory artifacts"

  MEM_DIR="${EVIDENCE_DIR}/memory"
  mkdir -p "$MEM_DIR"

  if [[ -f "/proc/kcore" ]] && [[ -r "/proc/kcore" ]]; then
    log_info "Capturing /proc/kcore snapshot..."
    dd if=/proc/kcore of="${MEM_DIR}/kcore.dump" bs=1M count=100 2>/dev/null && \
      record_artifact "memory" "${MEM_DIR}/kcore.dump" "Kernel memory snapshot (/proc/kcore)" || \
      log_warn "Failed to capture /proc/kcore"
  else
    log_warn "/proc/kcore not accessible, skipping kernel memory capture"
  fi

  log_info "Collecting process memory maps..."
  find /proc -maxdepth 1 -type d -name '[0-9]*' 2>/dev/null | while IFS= read -r proc_dir; do
    pid=$(basename "$proc_dir")
    if [[ -r "${proc_dir}/maps" ]]; then
      head -100 "${proc_dir}/maps" 2>/dev/null > "${MEM_DIR}/proc_${pid}_maps.txt" 2>/dev/null || true
    fi
    if [[ -r "${proc_dir}/smaps" ]]; then
      head -100 "${proc_dir}/smaps" 2>/dev/null > "${MEM_DIR}/proc_${pid}_smaps.txt" 2>/dev/null || true
    fi
  done
  record_artifact "memory" "${MEM_DIR}" "Process memory maps"

  log_info "Memory collection completed"
fi

# ============================================================
# Collect network data
# ============================================================
if $COLLECT_NETWORK; then
  log_step "Collecting network artifacts"

  NET_DIR="${EVIDENCE_DIR}/network"
  mkdir -p "$NET_DIR"

  log_info "Capturing active network connections..."
  if command -v ss &>/dev/null; then
    ss -tupan 2>/dev/null > "${NET_DIR}/active-connections.txt" && \
      record_artifact "network" "${NET_DIR}/active-connections.txt" "Active TCP/UDP connections" || \
      log_warn "Failed to capture connections with ss"
  elif command -v netstat &>/dev/null; then
    netstat -tupan 2>/dev/null > "${NET_DIR}/active-connections.txt" && \
      record_artifact "network" "${NET_DIR}/active-connections.txt" "Active connections"
  fi

  log_info "Capturing network interface information..."
  {
    echo "=== INTERFACES ==="
    ip addr 2>/dev/null || ifconfig 2>/dev/null || true
    echo ""
    echo "=== ROUTING TABLE ==="
    ip route 2>/dev/null || route -n 2>/dev/null || true
    echo ""
    echo "=== ARP TABLE ==="
    ip neigh 2>/dev/null || arp -a 2>/dev/null || true
  } > "${NET_DIR}/network-interfaces.txt" && \
    record_artifact "network" "${NET_DIR}/network-interfaces.txt" "Network interface info"

  log_info "Capturing iptables rules..."
  if command -v iptables &>/dev/null; then
    iptables-save 2>/dev/null > "${NET_DIR}/iptables-rules.txt" && \
      record_artifact "network" "${NET_DIR}/iptables-rules.txt" "iptables rules" || \
      log_warn "Failed to capture iptables rules"
  fi

  log_info "Capturing DNS cache..."
  if command -v resolvectl &>/dev/null; then
    resolvectl statistics 2>/dev/null > "${NET_DIR}/dns-cache.txt" 2>/dev/null || true
    record_artifact "network" "${NET_DIR}/dns-cache.txt" "DNS cache"
  fi

  log_info "Capturing packet capture (10 second sample)..."
  if command -v tcpdump &>/dev/null; then
    timeout 10 tcpdump -i any -c 1000 -nn \
      -w "${NET_DIR}/packet-capture.pcap" 2>/dev/null && \
      record_artifact "network" "${NET_DIR}/packet-capture.pcap" "10s packet capture" || \
      log_warn "Failed to capture packets (may need root)"
  fi

  log_info "Network collection completed"
fi

# ============================================================
# Capture running processes
# ============================================================
if $COLLECT_PROCESSES; then
  log_step "Collecting process information"

  PROC_DIR="${EVIDENCE_DIR}/processes"
  mkdir -p "$PROC_DIR"

  log_info "Capturing full process list..."
  ps auxww 2>/dev/null > "${PROC_DIR}/process-list.txt" && \
    record_artifact "processes" "${PROC_DIR}/process-list.txt" "Full process list"

  if command -v lsof &>/dev/null; then
    log_info "Capturing open file descriptors..."
    lsof -nP 2>/dev/null > "${PROC_DIR}/open-files.txt" && \
      record_artifact "processes" "${PROC_DIR}/open-files.txt" "Open file descriptors"
  fi

  log_info "Capturing process tree..."
  ps -eo pid,ppid,pgid,user,comm,args --forest 2>/dev/null > "${PROC_DIR}/process-tree.txt" && \
    record_artifact "processes" "${PROC_DIR}/process-tree.txt" "Process tree"

  log_info "Capturing loaded kernel modules..."
  if command -v lsmod &>/dev/null; then
    lsmod 2>/dev/null > "${PROC_DIR}/kernel-modules.txt" && \
      record_artifact "processes" "${PROC_DIR}/kernel-modules.txt" "Loaded kernel modules"
  fi

  log_info "Process collection completed"
fi

# ============================================================
# Collect file integrity data
# ============================================================
if $COLLECT_FILES; then
  log_step "Collecting file integrity information"

  FILE_DIR="${EVIDENCE_DIR}/files"
  mkdir -p "$FILE_DIR"

  log_info "Computing file hashes for critical directories..."
  CRITICAL_DIRS=(
    "$PROJECT_ROOT/deploy"
    "$PROJECT_ROOT/crates"
    "/etc/kyc-vault"
    "/etc/teaclave"
  )

  for dir in "${CRITICAL_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
      safe_name=$(echo "$dir" | tr '/' '_')
      find "$dir" -type f 2>/dev/null | while IFS= read -r f; do
        if command -v sha256sum &>/dev/null; then
          sha256sum "$f" 2>/dev/null
        elif command -v shasum &>/dev/null; then
          shasum -a 256 "$f" 2>/dev/null
        fi
      done > "${FILE_DIR}/hashes_${safe_name}.txt" 2>/dev/null || true
      record_artifact "files" "${FILE_DIR}/hashes_${safe_name}.txt" \
        "File hashes for $dir"
    fi
  done

  log_info "Capturing file change times for sensitive directories..."
  find /etc/kyc-vault /opt/teaclave -type f -printf '%T@ %p\n' 2>/dev/null | \
    sort -rn | head -50 > "${FILE_DIR}/recent-changes.txt" 2>/dev/null || true
  record_artifact "files" "${FILE_DIR}/recent-changes.txt" "Recent file modifications"

  log_info "File integrity collection completed"
fi

# ============================================================
# Finalize manifest and optional compression
# ============================================================
log_step "Finalizing evidence collection"

cat >> "${FORENSICS_DIR}/manifest.json" <<EOF
,
{
  "collection_completed": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "evidence_directory": "$EVIDENCE_DIR",
  "total_artifacts": $(wc -l < "${FORENSICS_DIR}/collected-artifacts.txt" 2>/dev/null || echo 0)
}
}
EOF

sed -i '' '$s/^,//' "${FORENSICS_DIR}/manifest.json" 2>/dev/null || true

if $COMPRESS; then
  log_step "Compressing evidence archive"
  ARCHIVE_NAME="${FORENSICS_DIR}.tar.gz"
  tar -czf "$ARCHIVE_NAME" -C "$(dirname "$FORENSICS_DIR")" "$(basename "$FORENSICS_DIR")" && \
    log_info "Evidence compressed: $ARCHIVE_NAME" || \
    log_warn "Compression failed"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "=============================================="
echo "  FORENSICS COLLECTION COMPLETE"
echo "=============================================="
echo ""
echo "  Incident ID:  $INCIDENT_ID"
echo "  Evidence Dir: $FORENSICS_DIR"
echo "  Manifest:     ${FORENSICS_DIR}/manifest.json"
echo "  Log:          $FORENSICS_LOG"
echo ""
echo "  Collected:"
$COLLECT_LOGS && echo "    ✓ System and application logs"
$COLLECT_MEMORY && echo "    ✓ Memory artifacts"
$COLLECT_NETWORK && echo "    ✓ Network connections and traffic"
$COLLECT_PROCESSES && echo "    ✓ Process information"
$COLLECT_FILES && echo "    ✓ File integrity data"
$COMPRESS && echo "    ✓ Evidence compressed to archive"
echo ""
echo "  Chain of custody:"
echo "    All evidence stored in: $FORENSICS_DIR"
echo "    SHA-256 manifest: $(sha256sum "${FORENSICS_DIR}/manifest.json" 2>/dev/null | cut -d' ' -f1 || echo 'N/A')"
echo ""
echo "  Next steps:"
echo "    1. Copy evidence directory to secure storage"
echo "    2. Notify incident response team"
echo "    3. Begin forensic analysis"
echo "=============================================="

exit 0
