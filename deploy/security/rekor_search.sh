#!/usr/bin/env bash
set -euo pipefail

# Rekor transparency log search script for KYC Vault.
# Searches the Sigstore Rekor log for signed artifact entries
# by digest, hash, subject, or artifact URL.

REKOR_SERVER="${REKOR_SERVER:-https://rekor.sigstore.dev}"
SEARCH_TYPE="${1:-hash}"
SEARCH_VALUE="${2:-}"
OUTDIR="${3:-./reports/rekor}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/rekor_search_${TIMESTAMP}"

mkdir -p "$OUTDIR"

if ! command -v rekor-cli &>/dev/null; then
  echo "Error: rekor-cli not found."
  echo "Install:"
  echo "  brew install rekor-cli                  # macOS"
  echo "  go install github.com/sigstore/rekor/cmd/rekor-cli@latest"
  exit 1
fi

echo "=== Rekor Transparency Log Search ==="
echo "Server:       $REKOR_SERVER"
echo "Search type:  $SEARCH_TYPE"
echo "Search value: ${SEARCH_VALUE:-<auto-detect>}"
echo "Output:       ${OUTFILE}.*"
echo ""

# ── Search modes ──────────────────────────────────────────────
search_by_hash() {
  local hash="$1"
  echo "--- Searching by artifact hash: $hash ---"
  rekor-cli search --rekor_server "$REKOR_SERVER" \
    --sha "$hash" --format json 2>&1 | \
    tee "${OUTFILE}_by_hash.json"
}

search_by_subject() {
  local subject="$1"
  echo "--- Searching by subject email/DN: $subject ---"
  rekor-cli search --rekor_server "$REKOR_SERVER" \
    --email "$subject" --format json 2>&1 | \
    tee "${OUTFILE}_by_subject.json"
}

search_by_artifact() {
  local url="$1"
  echo "--- Searching by artifact URL: $url ---"
  rekor-cli search --rekor_server "$REKOR_SERVER" \
    --url "$url" --format json 2>&1 | \
    tee "${OUTFILE}_by_artifact.json"
}

search_by_commit() {
  local sha="$1"
  echo "--- Searching by commit SHA: $sha ---"
  rekor-cli search --rekor_server "$REKOR_SERVER" \
    --commit-sha "$sha" --format json 2>&1 | \
    tee "${OUTFILE}_by_commit.json"
}

search_all_recent() {
  local count="${1:-20}"
  echo "--- Fetching $count recent entries ---"

  # Get the latest log index
  local latest_index
  latest_index=$(curl -sf "$REKOR_SERVER/api/v1/log" | jq -r '.treeSize // 0')
  if [[ "$latest_index" -le 0 ]]; then
    echo "  Could not determine latest log index"
    return
  fi

  echo "  Latest log index: $latest_index"

  # Fetch recent entries
  for ((i = latest_index; i > latest_index - count; i--)); do
    curl -sf "$REKOR_SERVER/api/v1/log/entries?logIndex=$i" 2>/dev/null | \
      jq -r '
        to_entries[]? |
        "  [\(.key)] LogIndex: \(.value.logIndex // "?") Subject: \(.value.body?.spec?.signature?.content?.subject?.email // "unknown")"
      ' || true
  done > "${OUTFILE}_recent.txt"

  cat "${OUTFILE}_recent.txt"
}

verify_entry() {
  local uuid="$1"
  echo "--- Verifying entry: $uuid ---"
  rekor-cli verify --rekor_server "$REKOR_SERVER" \
    --uuid "$uuid" --format json 2>&1 | \
    tee "${OUTFILE}_verify_${uuid}.json"
}

# ── Auto-detect search type if not specified ──────────────────
if [[ -z "$SEARCH_VALUE" ]]; then
  # Try to auto-detect from git state or environment
  if git rev-parse HEAD &>/dev/null; then
    SEARCH_VALUE=$(git rev-parse HEAD)
    SEARCH_TYPE="commit"
    echo "Auto-detected git commit: $SEARCH_VALUE"
  elif [[ -n "${GITHUB_SHA:-}" ]]; then
    SEARCH_VALUE="$GITHUB_SHA"
    SEARCH_TYPE="commit"
    echo "Auto-detected GITHUB_SHA: $SEARCH_VALUE"
  elif [[ -n "${IMAGE_DIGEST:-}" ]]; then
    SEARCH_VALUE="$IMAGE_DIGEST"
    SEARCH_TYPE="hash"
    echo "Auto-detected IMAGE_DIGEST: $SEARCH_VALUE"
  else
    echo "No search value provided and no auto-detection possible."
    echo "Usage: $0 <search-type> <search-value>"
    echo "  search-type: hash | subject | artifact | commit | recent"
    echo ""
    echo "Examples:"
    echo "  $0 hash sha256:abc123..."
    echo "  $0 subject user@example.com"
    echo "  $0 artifact ghcr.io/kyc-vault/api-server:latest"
    echo "  $0 commit abcdef123..."
    echo "  $0 recent 50"
    exit 1
  fi
fi

# ── Execute search ────────────────────────────────────────────
case "$SEARCH_TYPE" in
  hash|sha|digest)
    search_by_hash "$SEARCH_VALUE"
    ;;
  subject|email)
    search_by_subject "$SEARCH_VALUE"
    ;;
  artifact|url)
    search_by_artifact "$SEARCH_VALUE"
    ;;
  commit)
    search_by_commit "$SEARCH_VALUE"
    ;;
  recent)
    search_all_recent "${SEARCH_VALUE:-20}"
    ;;
  verify)
    verify_entry "$SEARCH_VALUE"
    ;;
  *)
    echo "Unknown search type: $SEARCH_TYPE"
    echo "Valid: hash, subject, artifact, commit, recent, verify"
    exit 1
    ;;
esac

# ── Consolidate results ───────────────────────────────────────
echo ""
echo "--- Results ---"
for f in "${OUTFILE}"_*.json; do
  [[ -f "$f" ]] || continue
  count=$(jq -r 'length // 0' "$f" 2>/dev/null || echo "?")
  echo "  $(basename "$f"): $count entries"
done

# Generate markdown report
{
  echo "# Rekor Search Report"
  echo ""
  echo "**Server:** $REKOR_SERVER"
  echo "**Search:** $SEARCH_TYPE = $SEARCH_VALUE"
  echo "**Date:** $(date -u)"
  echo ""
  echo "## Results"
  echo ""
  for f in "${OUTFILE}"_*.json; do
    [[ -f "$f" ]] || continue
    echo "### $(basename "$f")"
    echo '```json'
    jq '.' "$f" 2>/dev/null || cat "$f"
    echo '```'
    echo ""
  done
} > "${OUTFILE}_report.md"

echo ""
echo "=== Rekor search complete ==="
echo "Report: ${OUTFILE}_report.md"
