#!/bin/bash
set -euo pipefail

echo "=== Setting up local development TLS certificates ==="

# Install mkcert if not present
if ! command -v mkcert &> /dev/null; then
    echo "Installing mkcert..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install mkcert
        brew install nss  # for Firefox
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get install -y libnss3-tools
        curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
        chmod +x mkcert-v*-linux-amd64
        sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
    fi
fi

# Initialize local CA
mkcert -install

# Generate certificates
mkdir -p .certs
cd .certs

# Wildcard localhost cert
mkcert -cert-file localhost.pem -key-file localhost-key.pem \
    "localhost" "*.localhost" "127.0.0.1" "::1"

# Service-specific certs
for svc in api did-resolver credential-issuer kyc-orchestrator zkp-engine ai-inference mcp-server; do
    mkcert -cert-file "${svc}.pem" -key-file "${svc}-key.pem" \
        "${svc}" "${svc}.kyc-vault.svc.cluster.local"
done

echo "=== TLS certificates generated in .certs/ ==="
echo "CA root: $(mkcert -CAROOT)"
