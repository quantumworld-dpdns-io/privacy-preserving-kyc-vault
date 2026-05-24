#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TLS_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${TLS_DIR}/out"
DAYS_CA=3650
DAYS_CERT=730
RSA_BITS=4096
EC_CURVE=prime256v1

usage() {
  echo "Usage: $0 [--ec] [--regenerate-ca]"
  echo "  --ec              Use EC P-256 keys instead of RSA 4096"
  echo "  --regenerate-ca   Regenerate the CA (deletes all existing certs)"
  exit 1
}

USE_EC=false
REGEN_CA=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ec) USE_EC=true; shift ;;
    --regenerate-ca) REGEN_CA=true; shift ;;
    *) usage ;;
  esac
done

mkdir -p "$OUT_DIR"
KEY_ALGO="rsa"
KEY_OPT=()
if $USE_EC; then
  KEY_ALGO="ec"
  KEY_OPT=(-newkey ec -pkeyopt ec_paramgen_curve:$EC_CURVE)
fi

if $REGEN_CA || [[ ! -f "${OUT_DIR}/ca.key" ]]; then
  echo "=== Generating Certificate Authority ==="
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:$RSA_BITS \
    -out "${OUT_DIR}/ca.key" -aes-256-gcm
  openssl req -x509 -new -nodes \
    -key "${OUT_DIR}/ca.key" \
    -sha512 \
    -days $DAYS_CA \
    -config "${TLS_DIR}/openssl.cnf" \
    -extensions v3_ca \
    -out "${OUT_DIR}/ca.crt"
  echo "CA generated: ${OUT_DIR}/ca.crt"
else
  echo "=== Using existing CA ==="
fi

SERVICES=(
  "api-server"
  "orchestrator"
  "credential-service"
  "zkp-service"
  "compliance-service"
  "teaclave"
  "weaviate"
  "vault"
  "redis"
  "postgres"
  "kafka"
  "loki"
  "grafana"
  "prometheus"
  "alertmanager"
)

generate_cert() {
  local name=$1
  local ext=$2
  local out_prefix="${OUT_DIR}/${name}"

  if [[ -f "${out_prefix}.key" ]] && ! $REGEN_CA; then
    echo "  Skipping ${name} (already exists)"
    return
  fi

  echo "  Generating ${name}..."

  if $USE_EC; then
    openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:$EC_CURVE \
      -out "${out_prefix}.key"
  else
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:$RSA_BITS \
      -out "${out_prefix}.key"
  fi

  openssl req -new \
    -key "${out_prefix}.key" \
    -subj "/C=US/ST=California/L=San Francisco/O=KYC Vault/OU=${name}/CN=${name}.kyc-vault.svc" \
    -addext "subjectAltName=DNS:${name},DNS:${name}.kyc-vault,DNS:${name}.kyc-vault.svc,DNS:localhost,IP:127.0.0.1" \
    -out "${out_prefix}.csr"

  openssl x509 -req \
    -in "${out_prefix}.csr" \
    -CA "${OUT_DIR}/ca.crt" \
    -CAkey "${OUT_DIR}/ca.key" \
    -CAcreateserial \
    -days $DAYS_CERT \
    -sha512 \
    -extfile "${TLS_DIR}/openssl.cnf" \
    -extensions "$ext" \
    -out "${out_prefix}.crt"

  cat "${out_prefix}.crt" "${OUT_DIR}/ca.crt" > "${out_prefix}-fullchain.crt"

  rm -f "${out_prefix}.csr"

  echo "  Created ${out_prefix}.crt + ${out_prefix}.key"
}

echo ""
echo "=== Generating Server Certificates ==="
for svc in "${SERVICES[@]}"; do
  generate_cert "server-${svc}" "server_cert"
done

echo ""
echo "=== Generating Client Certificates ==="
generate_cert "client-admin" "client_cert"
generate_cert "client-api" "client_cert"
generate_cert "client-zkp" "client_cert"
generate_cert "client-vault" "client_cert"
generate_cert "client-grafana" "client_cert"
generate_cert "client-prometheus" "client_cert"

echo ""
echo "=== Generating Diffie-Hellman Parameters ==="
if [[ ! -f "${OUT_DIR}/dhparam.pem" ]] || $REGEN_CA; then
  openssl dhparam -out "${OUT_DIR}/dhparam.pem" 2048
fi

echo ""
echo "=== Verifying Certificates ==="
for svc in "${SERVICES[@]}"; do
  openssl verify -CAfile "${OUT_DIR}/ca.crt" "${OUT_DIR}/server-${svc}.crt"
done

echo ""
echo "=== Cleanup ==="
chmod 600 "${OUT_DIR}"/*.key
chmod 644 "${OUT_DIR}"/*.crt "${OUT_DIR}"/*.pem
rm -f "${OUT_DIR}"/*.csr

echo ""
echo "=== Certificate Generation Complete ==="
echo "CA certificate:      ${OUT_DIR}/ca.crt"
echo "CA key (encrypted):  ${OUT_DIR}/ca.key"
echo "Certificates:        ${OUT_DIR}/*.crt"
echo "Private keys:        ${OUT_DIR}/*.key"
echo "DH parameters:       ${OUT_DIR}/dhparam.pem"
echo ""
echo "To regenerate all certificates, run:"
echo "  $0 --regenerate-ca"
