#!/bin/bash
set -e

CERT_DIR="./services/gateway/nginx/ssl"
mkdir -p "$CERT_DIR"

echo "Generating self-signed SSL certificates for development..."

openssl genrsa -out "$CERT_DIR/server.key" 2048

openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" \
    -subj "/C=US/ST=State/L=City/O=Organization/OU=Unit/CN=localhost"

openssl x509 -req -days 365 -in "$CERT_DIR/server.csr" \
    -signkey "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt"

echo "Certificates generated in $CERT_DIR"
rm "$CERT_DIR/server.csr"
