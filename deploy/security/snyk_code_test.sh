#!/usr/bin/env bash
set -euo pipefail

# Snyk Code SAST scanning for KYC Vault.
# Scans all supported languages (Rust, TypeScript, Go, Python, YAML, Dockerfile)
# for security vulnerabilities and outputs SARIF/HTML/JSON reports.

TARGET="${1:-.}"
OUTDIR="${2:-./reports/snyk}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/snyk_code_${TIMESTAMP}"

mkdir -p "$OUTDIR"

if ! command -v snyk &>/dev/null; then
  echo "Error: snyk CLI not found."
  echo "Install:"
  echo "  brew install snyk-cli          # macOS"
  echo "  npm install -g snyk            # or via npm"
  echo "  # Then authenticate: snyk auth"
  exit 1
fi

echo "=== Snyk Code SAST Scan ==="
echo "Target:      $TARGET"
echo "Output:      ${OUTFILE}_*"
echo ""

# ── Pre-flight check ─────────────────────────────────────────
echo "--- Checking authentication ---"
snyk auth --dry-run 2>/dev/null || {
  echo "Not authenticated. Run: snyk auth"
  exit 1
}

# ── List all project files by language ───────────────────────
echo "--- Project file discovery ---"
echo "  Rust:       $(find "$TARGET" -name '*.rs' -not -path '*/target/*' | wc -l) files"
echo "  TypeScript: $(find "$TARGET" -name '*.ts' -not -path '*/node_modules/*' | wc -l) files"
echo "  Go:         $(find "$TARGET" -name '*.go' -not -path '*/vendor/*' | wc -l) files"
echo "  Python:     $(find "$TARGET" -name '*.py' -not -path '*/__pycache__/*' | wc -l) files"
echo "  YAML:       $(find "$TARGET" -name '*.yaml' -o -name '*.yml' | wc -l) files"
echo "  Dockerfile: $(find "$TARGET" -name 'Dockerfile*' | wc -l) files"
echo "  JS/TS cfg:  $(find "$TARGET" -name '*.json' -not -path '*/node_modules/*' | wc -l) files"
echo ""

# ── Snyk Code test ───────────────────────────────────────────
echo "--- Running Snyk Code test ---"
# Scan with SARIF output for CI integration
snyk code test "$TARGET" \
  --sarif-file-output="${OUTFILE}.sarif" \
  --json-file-output="${OUTFILE}.json" \
  --severity-threshold=low \
  --all-projects \
  --exclude="target,node_modules,vendor,.git,__pycache__" \
  2>&1 | tee "${OUTFILE}_console.log"

# ── Generate HTML report from SARIF ──────────────────────────
echo ""
echo "--- Generating reports ---"

if [[ -f "${OUTFILE}.sarif" ]]; then
  # Convert SARIF to human-readable markdown
  jq -r '
    "## Snyk Code Scan Report\n",
    "Date: \(now | strftime(\"%Y-%m-%d %H:%M:%S\"))\n",
    "Project: KYC Vault\n",
    "Results per rule:\n",
    "---\n",
    (.runs[]?.results[]? // [] | 
      "### [\(.level // "warning")] \(.ruleId // "unknown")\n" +
      "- **Message:** \(.message.text // "no message")\n" +
      "- **File:** \(.locations[0]?.physicalLocation?.artifactLocation?.uri // "unknown")\n" +
      "- **Line:** \(.locations[0]?.physicalLocation?.region?.startLine // 0)\n" +
      "- **Snippet:** \(.locations[0]?.physicalLocation?.region?.snippet?.text // "N/A")\n"
    )
  ' "${OUTFILE}.sarif" > "${OUTFILE}_summary.md" 2>/dev/null
  echo "Summary (markdown): ${OUTFILE}_summary.md"
fi

if [[ -f "${OUTFILE}.json" ]]; then
  # Parse JSON for quick summary
  echo ""
  echo "Vulnerability summary:"
  jq -r '
    .runs[]?.results? // [] |
    group_by(.level) |
    map({level: .[0].level, count: length}) |
    sort_by(.level) |
    .[] | "  \(.level): \(.count)"
  ' "${OUTFILE}.json" 2>/dev/null || echo "  (no structured results)"
fi

# ── Generate HTML report (if sarif2html available) ──────────
if command -v sarif2html &>/dev/null && [[ -f "${OUTFILE}.sarif" ]]; then
  sarif2html -i "${OUTFILE}.sarif" -o "${OUTFILE}.html" && \
    echo "HTML report: ${OUTFILE}.html"
fi

echo ""
echo "=== snyk code test complete ==="
echo "Reports directory: $OUTDIR"
echo ""
echo "Also consider running:"
echo "  snyk container test <image>   # container scanning"
echo "  snyk iac test                  # IaC scanning"
echo "  snyk monitor                   # continuous monitoring"
