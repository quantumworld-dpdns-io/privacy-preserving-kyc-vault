#!/usr/bin/env bash
set -euo pipefail

# Clair container vulnerability scanner for KYC Vault images.
# Uses clairctl or clair-scanner to scan local Docker images
# for known CVEs in OS packages and language dependencies.

IMAGE="${1:-kyc-vault/api-server:latest}"
CLAIR_ADDR="${CLAIR_ADDR:-http://localhost:6060}"
OUTDIR="${2:-./reports/clair}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/clair_scan_${TIMESTAMP}"

mkdir -p "$OUTDIR"

if ! command -v clairctl &>/dev/null && ! command -v clair-scanner &>/dev/null; then
  echo "Error: Neither clairctl nor clair-scanner found."
  echo "Install clair-scanner:"
  echo "  curl -L https://github.com/arminc/clair-scanner/releases/latest/download/clair-scanner_linux_amd64 -o /usr/local/bin/clair-scanner"
  echo "Or use Docker:"
  echo "  docker run -v /var/run/docker.sock:/var/run/docker.sock quay.io/arminc/clair-scanner:latest"
  exit 1
fi

echo "=== Clair Container Scan ==="
echo "Image:       $IMAGE"
echo "Clair addr:  $CLAIR_ADDR"
echo "Output:      ${OUTFILE}.*"
echo ""

# ── Pull image if not present locally ─────────────────────────
if ! docker image inspect "$IMAGE" &>/dev/null; then
  echo "--- Pulling image ---"
  docker pull "$IMAGE"
fi

# ── Determine scanner binary ──────────────────────────────────
SCANNER=""
if command -v clairctl &>/dev/null; then
  SCANNER="clairctl"
elif command -v clair-scanner &>/dev/null; then
  SCANNER="clair-scanner"
fi

echo "Using scanner: $SCANNER"
echo ""

scan_with_clairctl() {
  local img="$1"
  local out="$2"
  echo "--- clairctl: analyzing image ---"
  clairctl analyze --image "$img" --endpoint "$CLAIR_ADDR" 2>&1 | \
    tee "${out}_analyze.log"

  echo "--- clairctl: generating report ---"
  clairctl report --image "$img" --endpoint "$CLAIR_ADDR" \
    --format json > "${out}.json" 2>/dev/null || true
  clairctl report --image "$img" --endpoint "$CLAIR_ADDR" \
    --format html > "${out}.html" 2>/dev/null || true
}

scan_with_clair_scanner() {
  local img="$1"
  local out="$2"
  local whitelist="${out}_whitelist.yaml"

  # Create an empty whitelist
  cat > "$whitelist" <<'YAML'
whitelist:
  - CVE-2023-XXXXX  # Example: known false positive
YAML

  echo "--- clair-scanner: scanning image ---"
  clair-scanner \
    --ip "$(hostname -I | awk '{print $1}')" \
    --clair=http://localhost:6060 \
    --threshold=Unknown \
    --report="${out}.json" \
    --log="${out}_scanner.log" \
    --whitelist="$whitelist" \
    "$img" 2>&1 | tee "${out}_console.log"
}

if [[ "$SCANNER" == "clairctl" ]]; then
  scan_with_clairctl "$IMAGE" "$OUTFILE"
else
  scan_with_clair_scanner "$IMAGE" "$OUTFILE"
fi

# ── Generate summary ──────────────────────────────────────────
echo ""
echo "--- Summary ---"

if [[ -f "${OUTFILE}.json" ]]; then
  echo "Vulnerabilities found:"
  jq -r '
    .vulnerabilities? // [] |
    group_by(.Severity // .severity // "Unknown") |
    map({severity: .[0].Severity // .[0].severity // "Unknown", count: length}) |
    sort_by(.severity) |
    .[] | "  \(.severity): \(.count)"
  ' "${OUTFILE}.json" 2>/dev/null || echo "  (could not parse JSON report)"
fi

# ── Scan multiple images if desired ───────────────────────────
if [[ -n "${ADDITIONAL_IMAGES:-}" ]]; then
  echo ""
  echo "--- Scanning additional images ---"
  for img in $ADDITIONAL_IMAGES; do
    echo "Scanning: $img"
    ADD_OUT="${OUTDIR}/clair_${img//[:\/]/_}_${TIMESTAMP}"
    if [[ "$SCANNER" == "clairctl" ]]; then
      scan_with_clairctl "$img" "$ADD_OUT"
    else
      scan_with_clair_scanner "$img" "$ADD_OUT"
    fi
  done
fi

echo ""
echo "=== Clair scan complete ==="
echo "Reports: ${OUTFILE}.json (and .html if available)"
echo ""
echo "To start Clair server locally:"
echo "  docker run -d --name clair -p 6060:6060 quay.io/coreos/clair:latest"
echo "  # Then run this script"
