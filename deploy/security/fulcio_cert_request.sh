#!/usr/bin/env bash
set -euo pipefail

# Fulcio certificate request for Sigstore code signing.
# Requests a short-lived code signing certificate from a
# Fulcio instance using OIDC authentication (Google, GitHub, etc.)
# for signing KYC Vault container images and release artifacts.

FULCIO_URL="${FULCIO_URL:-https://fulcio.sigstore.dev}"
OIDC_ISSUER="${OIDC_ISSUER:-https://accounts.google.com}"
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-sigstore}"
SUBJECT="${1:-${EMAIL:-$(git config user.email)}}"
OUTDIR="${2:-./reports/fulcio}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${OUTDIR}/fulcio_cert_${TIMESTAMP}"

mkdir -p "$OUTDIR"

echo "=== Fulcio Certificate Request ==="
echo "Fulcio:       $FULCIO_URL"
echo "OIDC issuer:  $OIDC_ISSUER"
echo "Subject:      $SUBJECT"
echo "Output:       ${OUTFILE}.*"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────
if ! command -v cosign &>/dev/null; then
  echo "Error: cosign not found."
  echo "Install:"
  echo "  brew install cosign            # macOS"
  echo "  # or: go install github.com/sigstore/cosign/v2/cmd/cosign@latest"
  exit 1
fi

if ! command -v openssl &>/dev/null; then
  echo "Error: openssl not found"
  exit 1
fi

# ── Generate ephemeral key pair ───────────────────────────────
echo "--- Generating ephemeral ECDSA P-256 key pair ---"
openssl ecparam -name prime256v1 -genkey -noout \
  -out "${OUTFILE}_key.pem"
openssl ec -in "${OUTFILE}_key.pem" -pubout \
  -out "${OUTFILE}_pub.pem"

echo "  Private key: ${OUTFILE}_key.pem"
echo "  Public key:  ${OUTFILE}_pub.pem"

# ── Generate PKCS#10 CSR ──────────────────────────────────────
echo ""
echo "--- Generating CSR ---"
SUBJ="/C=US/O=KYC Vault/CN=${SUBJECT}"
openssl req -new \
  -key "${OUTFILE}_key.pem" \
  -subj "$SUBJ" \
  -addext "subjectAltName=email:${SUBJECT}" \
  -out "${OUTFILE}.csr"
echo "  CSR: ${OUTFILE}.csr"

# ── Obtain OIDC token ─────────────────────────────────────────
echo ""
echo "--- Obtaining OIDC token ---"
OIDC_TOKEN=""

# Try GitHub Actions OIDC
if [[ -n "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" && \
      -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]]; then
  echo "  Using GitHub Actions OIDC..."
  OIDC_TOKEN=$(curl -sf -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sigstore" | \
    jq -r '.value')
fi

# Try Google Cloud OIDC
if [[ -z "$OIDC_TOKEN" ]] && command -v gcloud &>/dev/null; then
  echo "  Using Google Cloud OIDC..."
  OIDC_TOKEN=$(gcloud auth print-identity-token --audiences="$OIDC_CLIENT_ID" 2>/dev/null) || true
fi

# Try direct OAuth2 device flow
if [[ -z "$OIDC_TOKEN" ]]; then
  echo "  OIDC token not obtained from environment."
  echo "  You can run: cosign login, or set OIDC_TOKEN manually."
  echo "  For now, using cosign's built-in OIDC flow..."
fi

# ── Request certificate from Fulcio ───────────────────────────
echo ""
echo "--- Requesting certificate from Fulcio ---"

if [[ -n "$OIDC_TOKEN" ]]; then
  # Direct API call (advanced / debugging)
  echo "  Using direct Fulcio API call..."
  CERT_RESPONSE=$(curl -sf -X POST "${FULCIO_URL}/api/v1/signingCert" \
    -H "Authorization: Bearer $OIDC_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"csr\": \"$(base64 -i "${OUTFILE}.csr" | tr -d '\n')\",
      \"sctChallenge\": \"$(openssl rand -hex 32)\"
    }")
  echo "$CERT_RESPONSE" | jq '.' > "${OUTFILE}_response.json"
  echo "$CERT_RESPONSE" | jq -r '.cert' | base64 -d > "${OUTFILE}_cert.pem" 2>/dev/null || {
    echo "  Warning: could not extract certificate from response"
  }
else
  # Use cosign's built-in flow
  echo "  Using cosign built-in OIDC flow..."
  cosign generate-key-pair \
    --scheme ecdsa \
    --output-key-prefix "${OUTFILE}_cosign" 2>&1 || true

  # Request cert via cosign
  cosign sign \
    --fulcio-url "$FULCIO_URL" \
    --yes \
    "docker://${SUBJECT}" 2>&1 || {
    echo "  cosign sign attempted (may require OIDC browser flow)"
  }
fi

# ── Verify certificate chain ──────────────────────────────────
echo ""
echo "--- Verification ---"
if [[ -f "${OUTFILE}_cert.pem" ]]; then
  echo "Certificate info:"
  openssl x509 -in "${OUTFILE}_cert.pem" -text -noout 2>/dev/null | \
    grep -E 'Subject:|Issuer:|Not Before|Not After|X509v3.*' || true

  echo ""
  echo "Certificate verification:"
  openssl verify -verbose -CAfile /etc/ssl/certs/ca-certificates.crt \
    "${OUTFILE}_cert.pem" 2>&1 || \
    echo "  (Fulcio root may not be in system trust store)"
fi

# ── Report ────────────────────────────────────────────────────
echo ""
echo "=== Fulcio certificate request complete ==="
echo ""
echo "Artifacts:"
ls -lh "${OUTFILE}"_*
echo ""
echo "To use the certificate for signing:"
echo "  cosign sign --key ${OUTFILE}_key.pem --cert ${OUTFILE}_cert.pem <image>"
echo ""
echo "To verify:"
echo "  cosign verify --cert ${OUTFILE}_cert.pem <image>"
