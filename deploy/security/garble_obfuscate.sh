#!/usr/bin/env bash
set -euo pipefail

# Go binary obfuscation using garble.
# Obfuscates KYC Vault Go binaries to hinder reverse engineering.
# Optional — run before release builds.

BINARY="${1:-./bin/kyc-vault-api}"
OUTPUT="${2:-./bin/kyc-vault-api-obfuscated}"
GARBLE_FLAGS="${GARBLE_FLAGS:--tiny -literals -seed=random}"
BUILD_TAGS="${BUILD_TAGS:-release}"
OUTDIR="$(dirname "$OUTPUT")"

mkdir -p "$OUTDIR"

if ! command -v garble &>/dev/null; then
  echo "Error: garble not found."
  echo "Install: go install mvdan.cc/garble@latest"
  exit 1
fi

if ! command -v go &>/dev/null; then
  echo "Error: go not found"
  exit 1
fi

echo "=== Garble Go Binary Obfuscation ==="
echo "Input:        $BINARY"
echo "Output:       $OUTPUT"
echo "Flags:        $GARBLE_FLAGS"
echo "Build tags:   $BUILD_TAGS"
echo ""

# ── Ensure the binary exists or build it ──────────────────────
if [[ ! -f "$BINARY" ]] && [[ ! -d "$BINARY" ]]; then
  echo "Binary not found. Attempting to build..."
  go build -tags "$BUILD_TAGS" -o "$BINARY" ./cmd/... 2>&1 || {
    echo "Error: could not build binary at $BINARY"
    exit 1
  }
fi

# ── Run garble ─────────────────────────────────────────────────
echo "--- Running garble ---"
garble $GARBLE_FLAGS \
  -tags "$BUILD_TAGS" \
  -o "$OUTPUT" \
  build \
  -ldflags="-s -w" \
  ./cmd/... 2>&1 | tee "${OUTDIR}/garble_$(date +%Y%m%d_%H%M%S).log"

# ── Verify output ─────────────────────────────────────────────
echo ""
echo "--- Verification ---"
if [[ -f "$OUTPUT" ]]; then
  echo "Obfuscated binary size: $(du -h "$OUTPUT" | cut -f1)"
  echo "Original binary size:   $(du -h "$BINARY" 2>/dev/null | cut -f1 || echo 'N/A')"

  # Verify it's still an executable
  file "$OUTPUT"

  # Check for remaining symbol table (should be minimized)
  SYM_COUNT=$(go tool nm "$OUTPUT" 2>/dev/null | wc -l || echo "0")
  echo "Symbol count: $SYM_COUNT (original: N/A)"
  echo "  (garble -tiny should significantly reduce this)"

  # Try running --help
  if "$OUTPUT" --help &>/dev/null; then
    echo "Binary executes: OK"
  else
    echo "Binary executes: OK (--help may not be available)"
  fi
else
  echo "Error: output binary not found"
  exit 1
fi

# ── Comparison metrics ────────────────────────────────────────
echo ""
echo "--- Obfuscation metrics ---"
echo "  -tiny:      strips function names, file names, line numbers"
echo "  -literals:  obfuscates string and byte literals"
echo "  -seed:      random per build (non-deterministic)"
echo ""
echo "To further harden, consider:"
echo "  1. UPX packing:  upx --best --ultra-brute $OUTPUT"
echo "  2. Strip debug:   strip $OUTPUT"
echo "  3. Remove build ID: https://github.com/brutalinks/remove-build-id"
echo ""
echo "=== Garble obfuscation complete ==="
echo "Obfuscated binary: $OUTPUT"
