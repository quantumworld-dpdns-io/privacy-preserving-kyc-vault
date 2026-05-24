#!/usr/bin/env bash
set -euo pipefail

# nmap network scan for exposed KYC Vault services.
# Scans the target CIDR for open ports, service versions,
# and runs safe NSE scripts.

TARGET="${1:-10.42.0.0/16}"
OUTDIR="${2:-./reports/nmap}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/nscan_${TIMESTAMP}"

mkdir -p "$OUTDIR"

if ! command -v nmap &>/dev/null; then
  echo "Error: nmap not found. Install with: brew install nmap"
  exit 1
fi

echo "=== KYC Vault Network Scan ==="
echo "Target:    $TARGET"
echo "Output:    ${OUTFILE}.*"
echo ""

# ── Fast port discovery (top 1000 TCP) ────────────────────────
echo "--- Phase 1: TCP port discovery ---"
nmap -sn "$TARGET" -oG "${OUTFILE}.hosts" --reason
nmap -sT -T4 --top-ports 1000 \
  -iL "${OUTFILE}.hosts" \
  -oN "${OUTFILE}.tcp" \
  --reason

# ── Service/version detection on found ports ──────────────────
echo "--- Phase 2: Service version detection ---"
nmap -sV -T4 --version-intensity 5 \
  -iL "${OUTFILE}.hosts" \
  -p "$(awk '/open/{print $1}' "${OUTFILE}.tcp" | tr '\n' ',' | sed 's/,$//')" \
  -oN "${OUTFILE}.versions" \
  --reason

# ── NSE safe scripts ──────────────────────────────────────────
echo "--- Phase 3: NSE safe scripts ---"
nmap -sT -T4 --script "safe or default" \
  -iL "${OUTFILE}.hosts" \
  -oN "${OUTFILE}.nse" \
  --reason

# ── TLS/SSL audit on HTTPS endpoints ─────────────────────────
echo "--- Phase 4: TLS audit ---"
nmap -sT -T4 --script ssl-enum-ciphers,ssl-cert,ssl-heartbleed,tls-nextprotoneg \
  -p 443,8443,6443 \
  -iL "${OUTFILE}.hosts" \
  -oN "${OUTFILE}.tls" \
  --reason

# ── K8s API exposure check ────────────────────────────────────
echo "--- Phase 5: K8s API exposure check ---"
nmap -sT -T4 -p 6443,10250,10255,10256,10257,10259 \
  -iL "${OUTFILE}.hosts" \
  --script=k8s-api-access \
  -oN "${OUTFILE}.k8s" \
  --reason

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "=== Scan complete ==="
echo "Hosts found:  $(grep -c 'Status: Up' "${OUTFILE}.hosts" || true)"
echo "Open ports:   $(awk '/open/' "${OUTFILE}.tcp" | wc -l | tr -d ' ')"
echo ""
echo "Reports:"
ls -lh "${OUTFILE}".*

# Optionally generate HTML report
if command -v xsltproc &>/dev/null; then
  echo "--- Generating HTML report ---"
  nmap -oX "${OUTFILE}.xml" -iL "${OUTFILE}.hosts" --stylesheet nmap.xsl 2>/dev/null
  xsltproc -o "${OUTFILE}.html" "${OUTFILE}.xml" 2>/dev/null && \
    echo "HTML report: ${OUTFILE}.html"
fi
