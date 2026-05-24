#!/usr/bin/env bash
# cURL examples for all KYC Vault REST API endpoints
# Usage: export KYC_VAULT_TOKEN="your-jwt-token" && bash api-examples.sh

set -euo pipefail

BASE="${KYC_VAULT_URL:-https://api.kyc-vault.com/v1}"
TOKEN="${KYC_VAULT_TOKEN:-your-jwt-token}"
AUTH="Authorization: Bearer $TOKEN"

cyan='\033[0;36m'
green='\033[0;32m'
nc='\033[0m'

run() {
  local label="$1" method="$2" path="$3" body="$4"
  local url="${BASE}${path}"
  echo -e "\n${cyan}► $label${nc}"
  echo -e "${green}curl -s -X $method '$url' -H '$AUTH'${nc}"
  if [ -n "$body" ]; then
    echo "$body" | jq -C . 2>/dev/null || echo "$body"
    curl -s -X "$method" "$url" -H "$AUTH" -H "Content-Type: application/json" -d "$body" | jq -C .
  else
    curl -s -X "$method" "$url" -H "$AUTH" | jq -C .
  fi
}

# ------------------------------------------------------------------
# Health
# ------------------------------------------------------------------
run "GET /health - service health" GET "/health" ""

# ------------------------------------------------------------------
# DID Resolver
# ------------------------------------------------------------------
run "POST /did/resolve - resolve a DID" POST "/did/resolve" \
  '{"did": "did:kyc:issuer:vault-001"}'

# ------------------------------------------------------------------
# Credentials
# ------------------------------------------------------------------
CRED_BODY='{
  "credential": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential"],
    "issuer": "did:kyc:issuer:abc123",
    "issuanceDate": "2026-01-15T00:00:00Z",
    "credentialSubject": {
      "id": "did:kyc:subject:def456",
      "type": "passport",
      "nationality": "US",
      "age": 25
    }
  },
  "options": {
    "proofFormat": "lds",
    "pqc": true
  }
}'

run "POST /credentials - issue a credential" POST "/credentials" "$CRED_BODY"

run "GET /credentials/:id - retrieve a credential" GET "/credentials/550e8400-e29b-41d4-a716-446655440000" ""

run "DELETE /credentials/:id - revoke a credential" DELETE "/credentials/550e8400-e29b-41d4-a716-446655440000" ""

run "POST /credentials/:id/verify - verify a credential" POST "/credentials/550e8400-e29b-41d4-a716-446655440000/verify" \
  '{"challenge": "nonce-123", "domain": "app.kyc-vault.com"}'

# ------------------------------------------------------------------
# KYC Verification
# ------------------------------------------------------------------
KYC_BODY='{
  "verificationId": "550e8400-e29b-41d4-a716-446655440001",
  "applicantId": "did:kyc:applicant:789",
  "documents": [
    {
      "id": "doc-1",
      "type": "passport",
      "imageData": "<base64>",
      "metadata": {}
    }
  ],
  "options": {
    "requireLiveness": true,
    "requireFraudCheck": true,
    "complianceJurisdiction": "US"
  }
}'

run "POST /v1/verify - start KYC verification" POST "/v1/verify" "$KYC_BODY"

# ------------------------------------------------------------------
# AI Inference
# ------------------------------------------------------------------
CLASSIFY_BODY='{
  "documentId": "550e8400-e29b-41d4-a716-446655440002",
  "imageData": "<base64>",
  "documentType": "passport"
}'

run "POST /ai/classify-document - classify a document" POST "/ai/classify-document" "$CLASSIFY_BODY"

LIVENESS_BODY='{
  "sessionId": "550e8400-e29b-41d4-a716-446655440003",
  "frames": ["<base64_frame_1>", "<base64_frame_2>"],
  "challenge": "shake_head",
  "response": "<encrypted_response>"
}'

run "POST /ai/liveness-check - liveness detection" POST "/ai/liveness-check" "$LIVENESS_BODY"

FRAUD_BODY='{
  "verificationId": "550e8400-e29b-41d4-a716-446655440004",
  "applicantId": "did:kyc:applicant:789",
  "documents": [{"id": "doc-1", "type": "passport", "metadata": {}}]
}'

run "POST /ai/fraud-detection - fraud risk assessment" POST "/ai/fraud-detection" "$FRAUD_BODY"

# ------------------------------------------------------------------
# Commerce
# ------------------------------------------------------------------
run "POST /commerce/checkout - create checkout session" POST "/commerce/checkout" \
  '{"items": [{"productId": "kyc-check", "quantity": 1}], "customerDid": "did:kyc:customer:xyz"}'

run "POST /commerce/estimate - get price estimate" POST "/commerce/estimate" \
  '{"items": [{"productId": "kyc-check", "quantity": 100}], "jurisdiction": "US"}'

# ------------------------------------------------------------------
# Billing
# ------------------------------------------------------------------
run "POST /billing/usage - record usage" POST "/billing/usage" \
  '{"metric": "api_calls", "value": 1, "tags": {"endpoint": "/v1/verify", "customer": "acme-corp"}}'

run "POST /billing/invoices - generate invoice" POST "/billing/invoices" \
  '{"customerId": "did:kyc:customer:xyz", "periodStart": "2026-01-01", "periodEnd": "2026-01-31"}'

run "POST /billing/credits - apply credits" POST "/billing/credits" \
  '{"customerId": "did:kyc:customer:xyz", "amount": 100.50, "reason": "promotional-credit"}'
