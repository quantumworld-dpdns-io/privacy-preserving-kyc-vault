#!/usr/bin/env bash
set -euo pipefail

# OWASP ZAP Full Scan Automation for KYC Vault.
# Runs both passive and active scanning against the target API.
# Requires ZAP 2.14+ with the automation framework.

TARGET="${1:-http://localhost:8080}"
OUTDIR="${2:-./reports/zap}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/zap_scan_${TIMESTAMP}"
ZAP_CMD="${ZAP_CMD:-zap.sh}"
ZAP_PORT="${ZAP_PORT:-8085}"
API_KEY="${API_KEY:-changeme}"

mkdir -p "$OUTDIR"

if ! command -v "$ZAP_CMD" &>/dev/null; then
  echo "Error: ZAP not found at '$ZAP_CMD'."
  echo "Install from: https://www.zaproxy.org/download/"
  echo "Or set ZAP_CMD to the zap.sh path."
  exit 1
fi

echo "=== OWASP ZAP Full Scan ==="
echo "Target:  $TARGET"
echo "Output:  ${OUTFILE}_*"
echo ""

# ── Start ZAP daemon ──────────────────────────────────────────
echo "--- Starting ZAP daemon on port $ZAP_PORT ---"
"$ZAP_CMD" -daemon -port "$ZAP_PORT" -host 127.0.0.1 \
  -config api.key="$API_KEY" \
  -config database.recoverylog=false \
  -config connection.timeoutInSecs=120 \
  -log "$OUTDIR/zap_daemon.log" &
ZAP_PID=$!

# Wait for ZAP to be ready
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$ZAP_PORT/JSON/core/view/version/" >/dev/null 2>&1; then
    echo "ZAP ready (PID $ZAP_PID)"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "Error: ZAP failed to start"
    kill "$ZAP_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 2
done

cleanup() {
  echo "--- Shutting down ZAP ---"
  curl -s "http://127.0.0.1:$ZAP_PORT/JSON/core/action/shutdown/" \
    -d "apikey=$API_KEY" >/dev/null 2>&1 || true
  wait "$ZAP_PID" 2>/dev/null || true
  echo "ZAP shutdown complete"
}
trap cleanup EXIT

# ── Passive scan (spider + import OpenAPI if available) ─────
echo "--- Phase 1: Passive scan / spider ---"

# Try to import OpenAPI spec
if curl -sf "${TARGET}/api/v1/openapi.json" >/dev/null 2>&1; then
  echo "Importing OpenAPI spec from target..."
  curl -s "http://127.0.0.1:$ZAP_PORT/JSON/openapi/action/importUrl/" \
    -d "apikey=$API_KEY&url=${TARGET}/api/v1/openapi.json" >/dev/null
elif [[ -f "./deploy/api/openapi.yaml" ]]; then
  echo "Importing local OpenAPI spec..."
  curl -s "http://127.0.0.1:$ZAP_PORT/JSON/openapi/action/importFile/" \
    -d "apikey=$API_KEY&file=$(pwd)/deploy/api/openapi.yaml" >/dev/null
fi

# Traditional spider
echo "Spidering target..."
curl -s "http://127.0.0.1:$ZAP_PORT/JSON/spider/action/scan/" \
  -d "apikey=$API_KEY&url=$TARGET&maxChildren=10&recurse=true" >/dev/null
sleep 5

# Wait for spider completion
while true; do
  status=$(curl -s "http://127.0.0.1:$ZAP_PORT/JSON/spider/view/status/" \
    -d "apikey=$API_KEY" | jq -r '.status // "0"')
  echo "  Spider: ${status}%"
  [[ "$status" == "100" ]] && break
  sleep 3
done

# Ajax spider (SPA support)
echo "Ajax spidering target..."
curl -s "http://127.0.0.1:$ZAP_PORT/JSON/ajaxSpider/action/scan/" \
  -d "apikey=$API_KEY&url=$TARGET&maxChildren=10" >/dev/null
sleep 5

while true; do
  status=$(curl -s "http://127.0.0.1:$ZAP_PORT/JSON/ajaxSpider/view/status/" \
    -d "apikey=$API_KEY" | jq -r '.status // "0"')
  echo "  Ajax spider: ${status}%"
  [[ "$status" == "100" ]] && break
  [[ "$status" == "stopped" ]] && break
  sleep 3
done

# ── Passive scan alerts ───────────────────────────────────────
echo "--- Phase 2: Passive scan alerts ---"
sleep 5
curl -s "http://127.0.0.1:$ZAP_PORT/JSON/core/view/alerts/" \
  -d "apikey=$API_KEY&baseurl=$TARGET" | jq '.' > "${OUTFILE}_passive.json"

echo "Passive scan alerts saved to ${OUTFILE}_passive.json"

# ── Active scan ───────────────────────────────────────────────
echo "--- Phase 3: Active scan ---"
SCAN_ID=$(curl -s "http://127.0.0.1:$ZAP_PORT/JSON/ascan/action/scan/" \
  -d "apikey=$API_KEY&url=$TARGET&recurse=true&inContextOnly=false" \
  | jq -r '.scan')

if [[ -z "$SCAN_ID" || "$SCAN_ID" == "null" ]]; then
  echo "Warning: Active scan could not be started"
else
  while true; do
    progress=$(curl -s "http://127.0.0.1:$ZAP_PORT/JSON/ascan/view/status/" \
      -d "apikey=$API_KEY&scanId=$SCAN_ID" | jq -r '.status // "0"')
    echo "  Active scan: ${progress}%"
    [[ "$progress" == "100" ]] && break
    sleep 10
  done
fi

# ── Export reports ────────────────────────────────────────────
echo "--- Phase 4: Export reports ---"

# JSON report
curl -s "http://127.0.0.1:$ZAP_PORT/OTHER/core/other/jsonreport/" \
  -d "apikey=$API_KEY" > "${OUTFILE}_full.json"

# HTML report
curl -s "http://127.0.0.1:$ZAP_PORT/OTHER/core/other/htmlreport/" \
  -d "apikey=$API_KEY" > "${OUTFILE}_full.html"

# Markdown summary
echo "Generating markdown summary..."
jq -r '
  "## ZAP Scan Report\n",
  "Date: \(now | strftime(\"%Y-%m-%d %H:%M:%S\"))\n",
  "Target: \($target)\n",
  (.alerts[]? // [] | "### \([.risk]) \(.name)\n- URL: \(.url)\n- Description: \(.description)\n- Solution: \(.solution)\n")
' --arg target "$TARGET" "${OUTFILE}_full.json" > "${OUTFILE}_summary.md" 2>/dev/null

echo ""
echo "=== Scan complete ==="
echo "Reports:"
ls -lh "${OUTFILE}"_*

# Alert counts
echo ""
echo "Alert summary:"
jq -r '
  [.alerts[]? // [] | .risk] | group_by(.) | map({
    risk: .[0],
    count: length
  }) | sort_by(.risk) | .[] | "  \(.risk): \(.count)"
' "${OUTFILE}_full.json" 2>/dev/null || echo "  (no alerts in JSON)"
