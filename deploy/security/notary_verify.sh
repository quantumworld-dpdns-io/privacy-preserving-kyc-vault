#!/usr/bin/env bash
set -euo pipefail

# Docker Notary signature verification for KYC Vault images.
# Verifies that container images have been signed by a trusted
# publisher using Docker Content Trust (Notary v1 / v2).

IMAGE="${1:-kyc-vault/api-server:latest}"
NOTARY_SERVER="${NOTARY_SERVER:-https://notary.docker.io}"
TRUST_DIR="${TRUST_DIR:-$HOME/.docker/trust}"
OUTDIR="${2:-./reports/notary}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/notary_verify_${TIMESTAMP}"

mkdir -p "$OUTDIR"

echo "=== Docker Notary Signature Verification ==="
echo "Image:         $IMAGE"
echo "Notary server: $NOTARY_SERVER"
echo "Trust dir:     $TRUST_DIR"
echo "Output:        ${OUTFILE}.json"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────
if ! command -v notary &>/dev/null; then
  echo "Error: notary CLI not found."
  echo "Install:"
  echo "  brew install notary            # macOS"
  echo "  # or download from:"
  echo "  https://github.com/theupdateframework/notary/releases"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "Error: docker CLI not found"
  exit 1
fi

# Extract registry, repository, and tag from image reference
REGISTRY=$(echo "$IMAGE" | cut -d'/' -f1)
REPOSITORY=$(echo "$IMAGE" | cut -d':' -f1)
TAG=$(echo "$IMAGE" | cut -d':' -f2)
if [[ -z "$TAG" ]]; then
  TAG="latest"
fi

echo "Parsed reference:"
echo "  Registry:   $REGISTRY"
echo "  Repository: $REPOSITORY"
echo "  Tag:        $TAG"
echo ""

# ── Check local trust data ────────────────────────────────────
echo "--- Checking local trust data ---"
if [[ -f "${TRUST_DIR}/tuf/${REPOSITORY}/metadata/snapshot.json" ]]; then
  echo "Local trust data found for ${REPOSITORY}"
  notary -s "$NOTARY_SERVER" -d "$TRUST_DIR" list "$REPOSITORY" 2>&1 || true
else
  echo "No local trust data for ${REPOSITORY}"
  echo "  (trust data may need to be downloaded or initialized)"
fi

# ── Verify image signature via Docker Content Trust ───────────
echo ""
echo "--- Verifying Docker Content Trust ---"
export DOCKER_CONTENT_TRUST=1
export DOCKER_CONTENT_TRUST_SERVER="$NOTARY_SERVER"

if docker trust inspect "$REPOSITORY" --pretty 2>&1; then
  echo "DCT: Image has trust data"
else
  echo "DCT: No trust data or verification failed"
fi

# ── Notary verification (v1 API) ──────────────────────────────
echo ""
echo "--- Notary v1 verification ---"
notary -s "$NOTARY_SERVER" -d "$TRUST_DIR" \
  verify "$REPOSITORY" 2>&1 | tee "${OUTFILE}_verify.log"

# ── Notary listing of signed tags ─────────────────────────────
echo ""
echo "--- Signed tags listing ---"
notary -s "$NOTARY_SERVER" -d "$TRUST_DIR" \
  list "$REPOSITORY" -o json 2>/dev/null > "${OUTFILE}_tags.json" || {
  echo "  Failed to list tags (remote may not support v1)"
}

if [[ -f "${OUTFILE}_tags.json" ]]; then
  echo "Signed tags:"
  jq -r '.signed | keys[]' "${OUTFILE}_tags.json" 2>/dev/null || echo "  (none)"
fi

# ─── Notary v2 (notation) verification ────────────────────────
echo ""
echo "--- Notation (v2) verification ---"
if command -v notation &>/dev/null; then
  notation verify "$IMAGE" 2>&1 | tee "${OUTFILE}_notation.log" || {
    echo "  Notation verification failed (image may not be signed with notation)"
  }

  # List signatures
  notation list "$IMAGE" 2>&1 | tee "${OUTFILE}_notation_list.log" || true
else
  echo "  notation CLI not found (install from https://github.com/notaryproject/notation)"
fi

# ── Generate report ───────────────────────────────────────────
echo ""
echo "--- Generating report ---"
{
  echo "{"
  echo "  \"image\": \"$IMAGE\","
  echo "  \"registry\": \"$REGISTRY\","
  echo "  \"repository\": \"$REPOSITORY\","
  echo "  \"tag\": \"$TAG\","
  echo "  \"notary_server\": \"$NOTARY_SERVER\","
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"trust_data_present\": $([ -f "${TRUST_DIR}/tuf/${REPOSITORY}/metadata/snapshot.json" ] && echo "true" || echo "false"),"
  echo "  \"verification_log\": $(cat "${OUTFILE}_verify.log" | jq -Rs . 2>/dev/null || echo "\"see verify.log\""),"
  echo "  \"notation_present\": $(command -v notation &>/dev/null && echo "true" || echo "false")"
  echo "}"
} > "${OUTFILE}.json"

echo "Report: ${OUTFILE}.json"
echo ""
echo "=== Notary verification complete ==="
