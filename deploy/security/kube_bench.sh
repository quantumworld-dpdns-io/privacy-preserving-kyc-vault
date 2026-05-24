#!/usr/bin/env bash
set -euo pipefail

# kube-bench runner for KYC Vault K8s cluster.
# Runs the CIS Kubernetes Benchmark and outputs JSON results.

CLUSTER_TYPE="${1:-k8s}"  # k8s, eks, gke, aks, openshift
OUTDIR="${2:-./reports/kube-bench}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/kube-bench_${TIMESTAMP}"
MASTER_NODE="${MASTER_NODE:-true}"
WORKER_NODE="${WORKER_NODE:-true}"

mkdir -p "$OUTDIR"

if ! command -v kube-bench &>/dev/null; then
  echo "Error: kube-bench not found."
  echo "Install:"
  echo "  brew install kube-bench            # macOS"
  echo "  # or download from:"
  echo "  https://github.com/aquasecurity/kube-bench/releases"
  exit 1
fi

echo "=== Kube-bench CIS Benchmark ==="
echo "Cluster type: $CLUSTER_TYPE"
echo "Master node:  $MASTER_NODE"
echo "Worker node:  $WORKER_NODE"
echo "Output:       ${OUTFILE}.json"
echo ""

# ── Master node checks ─────────────────────────────────────
if [[ "$MASTER_NODE" == "true" ]]; then
  echo "--- Master node checks ---"
  kube-bench run \
    --targets master,etcd,controlplane,policies \
    --version "$CLUSTER_TYPE" \
    --json \
    --exit-code 0 \
    > "${OUTFILE}_master.json" 2>/dev/null

  # Pretty summary
  echo "Master node results:"
  jq -r '
    .Controls[]? // [] |
    "  [\(.version)] \(.text): \(.tests | length) tests" |
    gsub("\\n"; "")
  ' "${OUTFILE}_master.json" 2>/dev/null || echo "  (no master controls found)"
fi

# ── Worker node checks ─────────────────────────────────────
if [[ "$WORKER_NODE" == "true" ]]; then
  echo "--- Worker node checks ---"
  kube-bench run \
    --targets node \
    --version "$CLUSTER_TYPE" \
    --json \
    --exit-code 0 \
    > "${OUTFILE}_worker.json" 2>/dev/null

  echo "Worker node results:"
  jq -r '
    .Controls[]? // [] |
    "  [\(.version)] \(.text): \(.tests | length) tests"
  ' "${OUTFILE}_worker.json" 2>/dev/null || echo "  (no worker controls found)"
fi

# ── Aggregate results ──────────────────────────────────────
echo ""
echo "=== Aggregate summary ==="
PASS=0
FAIL=0
WARN=0
INFO=0

for f in "${OUTFILE}"_*.json; do
  [[ -f "$f" ]] || continue
  p=$(jq -r '[.Controls[]?.tests[]?.results[]? | select(.status == "PASS")] | length' "$f" 2>/dev/null || echo 0)
  f2=$(jq -r '[.Controls[]?.tests[]?.results[]? | select(.status == "FAIL")] | length' "$f" 2>/dev/null || echo 0)
  w=$(jq -r '[.Controls[]?.tests[]?.results[]? | select(.status == "WARN")] | length' "$f" 2>/dev/null || echo 0)
  i=$(jq -r '[.Controls[]?.tests[]?.results[]? | select(.status == "INFO")] | length' "$f" 2>/dev/null || echo 0)
  PASS=$((PASS + p))
  FAIL=$((FAIL + f2))
  WARN=$((WARN + w))
  INFO=$((INFO + i))
done

echo "  PASS:  $PASS"
echo "  FAIL:  $FAIL"
echo "  WARN:  $WARN"
echo "  INFO:  $INFO"

# Generate HTML report if jq + asciidoc available
if command -v asciidoctor &>/dev/null; then
  echo "--- Generating HTML report ---"
  cat > "${OUTFILE}_report.adoc" <<-ADOC
= Kube-bench CIS Benchmark Report
KYC Vault Cluster
:timestamp: $TIMESTAMP
:cluster-type: $CLUSTER_TYPE

== Summary

- PASS: $PASS
- FAIL: $FAIL
- WARN: $WARN
- INFO: $INFO

== Details

Master report: ${OUTFILE}_master.json
Worker report: ${OUTFILE}_worker.json
ADOC
  asciidoctor -o "${OUTFILE}.html" "${OUTFILE}_report.adoc" && \
    echo "HTML report: ${OUTFILE}.html"
fi

echo ""
echo "=== kube-bench complete ==="
echo "FAIL count: $FAIL — review ${OUTFILE}_*.json for details"
