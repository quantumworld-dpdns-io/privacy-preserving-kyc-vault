# Key Compromise Runbook

## Overview

This runbook addresses compromise scenarios for cryptographic keys in the KYC Vault platform, including PQC keys (ML-KEM, ML-DSA, SLH-DSA), ZKP proving/verification keys, TLS certificates, JWK signing keys, API tokens, and Vault encryption keys.

## Key Inventory

| Key Type | Algorithm | Usage | Storage | Rotation Period |
|----------|-----------|-------|---------|-----------------|
| TLS | ECDSA P-384 | mTLS between services | cert-manager + Vault | 90 days |
| JWT Signing | Ed25519 | API auth tokens | Vault transit engine | 30 days |
| Credential Signing | BBS+ | VC issuance/verification | HSM + Vault | 90 days |
| ZKP Proving | Groth16 CRS | Proof generation | S3 + KMS | Per release |
| ZKP Verification | VK hash | Proof verification | On-chain/configmap | Per release |
| PQC KEM | ML-KEM-768 | Key encapsulation | Vault + NIST KMS | Per session |
| PQC Signing | ML-DSA-65 | Message signing | Vault + NIST KMS | 30 days |
| Hash-Based | SLH-DSA-SHA2-128s | Backup signing | Offline HSM | 90 days |
| Hybrid | X25519+ML-KEM-768 | Key agreement | Vault | Per session |
| Vault Root | AES-256-GCM | Vault unseal | Shamir shards + KMS | Manual only |
| API Keys | HMAC-SHA256 | Service-to-service | Vault + configmap | 90 days |

## Detection Indicators

### Automated Alerts
- `KYCCryptoKeyUsageAnomaly` — Unusual volume of signing/decryption operations
- `KYCAuthFailureBurst` — Sudden spike in 401/403 errors from JWT verification failures
- `KYCInvalidProofRate` — ZKP proof verification failure rate > 5%
- `KYCPQCKeyMismatch` — Ciphertext fails to decrypt with current keyset
- `KYCVaultUnsealStatus` — Vault seal status changes
- `KCYSuspiciousTokenUse` — Token used from unexpected geo/city/ASN
- `CertExpiryAlert` — Certificate nearing expiry or revoked

### Manual Indicators
- Unauthorized access discovered in audit logs (Loki/Kibana)
- Customer reports of credentials issued by unknown parties
- External security advisory for algorithm weakness
- Detection of private key material in source control, logs, or error messages
- Key material found in `git history`, pastebin, or public repos (GitGuardian/DL.P)
- Unusually slow ZKP proof generation (may indicate key theft and export)
- SSH access to Vault pods from unknown IPs

## Severity Assessment

| Severity | Criteria | Response SLA |
|----------|----------|-------------|
| CRITICAL | Private keys exfiltrated, active unauthorized signing | Immediate |
| HIGH | Key suspected compromised, evidence of unusual usage | 15 min |
| MEDIUM | Weak algorithm detected, key nearing revocation | 4 hr |
| LOW | Certificate misconfiguration, expired key still in use | 24 hr |

## Phase 1: Immediate Containment (0-15 min)

### 1.1 Verify Compromise

```bash
# Check Vault audit logs for unauthorized access
vault audit list
vault read /sys/audit/hash

# Query Loki for suspicious key operations
logcli query '{app="vault"} |= "sign" |~ "/transit/sign/"' --since=1h --limit=100

# Check for anomalous API key usage in API gateway logs
logcli query '{app="api-gateway"} |= "401" |~ "invalid token"' --since=1h --limit=200

# Verify ZKP proof verification failure rate
logcli query '{app="zkp-engine"} |= "verification failed"' --since=1h
```

### 1.2 Isolate Affected Components

```bash
# Block all traffic to compromised service
kubectl label pod -n kyc-vault -l app.kubernetes.io/instance=kyc-credential-service \
  network-policy=quarantine --overwrite

# Apply network policy to block egress (prevent data exfiltration)
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: key-compromise-quarantine
  namespace: kyc-vault
spec:
  podSelector:
    matchLabels:
      network-policy: quarantine
  policyTypes: [Ingress, Egress]
  ingress: []
  egress: []
EOF

# Scale down affected services to prevent further signing
kubectl scale deployment -n kyc-vault kyc-credential-service --replicas=0
kubectl scale deployment -n kyc-vault kyc-zkp-engine --replicas=0
```

### 1.3 Revoke Compromised Keys Immediately

```bash
# Revoke Vault token leases
vault lease revoke -prefix database/creds/kyc-app
vault lease revoke -prefix transit/keys/credentials
vault lease revoke -prefix auth/api-keys/creds/

# Disable API keys in application configmap
kubectl create configmap -n kyc-vault revoked-keys \
  --from-literal=revoked-at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Add compromised key fingerprints to blocklist
kubectl edit configmap -n kyc-vault kyc-api-gateway-config
# Add: BLOCKED_KEY_FINGERPRINTS: "sha256:abc..., sha256:def..."
```

## Phase 2: Key Rotation (15-45 min)

### 2.1 Vault Transit Keys

```bash
# Rotate transit keys (creates new key version, keeps old for decryption of existing data)
vault write -f /transit/keys/credentials/rotate
vault write -f /transit/keys/jwt-signing/rotate

# Verify key versions
vault read /transit/keys/credentials
vault read /transit/keys/jwt-signing

# Re-encrypt existing data with new key (if automatic rewrapping is needed)
vault write /transit/rewrap/credentials ciphertext=<old-ciphertext>

# Generate new API tokens
vault read /auth/api-keys/creds/app-renewed
```

### 2.2 TLS Certificates

```bash
# Force cert-manager to reissue certificates
kubectl delete secret -n kyc-vault kyc-tls-cert
kubectl annotate certificate -n kyc-vault kyc-tls-cert \
  cert-manager.io/issue-temporary-certificate="false"

# Wait for reissue
kubectl wait --for=condition=Ready certificate -n kyc-vault kyc-tls-cert --timeout=120s

# Verify new certificate
kubectl get secret -n kyc-vault kyc-tls-cert -o json | jq -r '.data["tls.crt"]' | base64 -d | openssl x509 -noout -text | grep "Not Before"
```

### 2.3 PQC Keys (ML-KEM, ML-DSA)

```bash
# Rotate KEM keys
vault write -f /transit/keys/pqc-kem/rotate

# Rotate signing keys
vault write -f /transit/keys/pqc-sign/rotate

# Update key metadata
vault write /transit/keys/pqc-kem/config \
  min_decryption_version=2 \
  min_encryption_version=2

# Regenerate KEM shared secrets for active sessions
# (This requires re-running key agreement protocol)
```

### 2.4 ZKP Proving/Verification Keys

```bash
# Generate new proving parameters (via trusted setup ceremony)
cd circuits/
just generate-params \
  --circuit age-verification \
  --output /tmp/new-proving-params

# Upload new proving params to S3
aws s3 cp /tmp/new-proving-params/ \
  s3://kyc-vault-zkp-params/v2/ \
  --recursive --sse aws:kms

# Update verification keys in configmap
kubectl create configmap -n kyc-vault zkp-params \
  --from-file=verification-keys=s3://kyc-vault-zkp-params/v2/vk.bin \
  --dry-run=client -o yaml | kubectl apply -f -

# Roll ZKP engine to pick up new params
kubectl rollout restart deployment -n kyc-vault kyc-zkp-engine
```

### 2.5 Credential Signing Keys (BBS+)

```bash
# Generate new BBS+ key pair
vault write -f /transit/keys/bbs-plus/rotate

# Issue new key material to credential service
vault read /transit/keys/bbs-plus

# Restart credential service with new key
kubectl rollout restart deployment -n kyc-vault kyc-credential-service
```

## Phase 3: Audit and Investigation (45 min - ongoing)

### 3.1 Forensic Collection

```bash
# Collect all relevant pod logs
mkdir -p /tmp/forensics/$(date +%Y%m%d-%H%M%S)
kubectl logs -n kyc-vault -l app.kubernetes.io/name=vault --tail=5000 --since=24h \
  > /tmp/forensics/vault-audit.log
kubectl logs -n kyc-vault -l app.kubernetes.io/name=api-gateway --tail=5000 --since=24h \
  > /tmp/forensics/api-gateway-access.log

# Snapshot etcd for Vault state
kubectl exec -n kyc-vault deploy/vault -- vault operator raft snapshot save /tmp/vault-snapshot.snap
kubectl cp kyc-vault/vault-0:/tmp/vault-snapshot.snap /tmp/forensics/

# Collect Kubernetes events
kubectl get events -n kyc-vault --sort-by='.lastTimestamp' > /tmp/forensics/k8s-events.txt

# Request cloud provider audit logs
aws cloudtrail lookup-events --lookup-attributes AttributeKey=ResourceName,AttributeValue=kyc-vault \
  --start-time $(date -d '-24 hours' +%Y-%m-%dT%H:%M:%SZ)
```

### 3.2 Determine Blast Radius

```sql
-- Identify credentials signed with compromised key version
SELECT credential_id, issuer_did, issuance_date, key_version
FROM credentials
WHERE key_version = <compromised_version>;

-- Identify verifications performed with same key version
SELECT verification_id, timestamp, proof_key_version
FROM verifications
WHERE proof_key_version = <compromised_version>;

-- Identify any sessions using compromised KEM keys
SELECT session_id, negotiated_kem, kem_key_id
FROM sessions
WHERE kem_key_id = <compromised_key_id>;
```

### 3.3 Compromise Assessment

| Question | Evidence Source |
|----------|-----------------|
| When was the key first used? | Vault audit log, `key_creation_date` |
| When was the key last used by legitimate service? | Check service deployment timestamps |
| What data was signed with the compromised key? | SQL query on credentials table |
| Was the key used from unauthorized sources? | CloudTrail, K8s audit logs, Vault audit |
| Are there indicators of lateral movement? | Tetragon eBPF alerts, network flow logs |
| Was any data encrypted/decrypted with compromised KEM? | Session key logs, ciphertext headers |

## Phase 4: Recovery

### 4.1 Rotate All Credentials Signed by Compromised Key

```bash
# Script to reissue credentials
for cred_id in $(psql -h $DB_HOST -t -A -c "SELECT credential_id FROM credentials WHERE key_version = $compromised_version"); do
  curl -X POST https://api.kyc-vault.com/v1/credentials/$cred_id/reissue \
    -H "Authorization: Bearer $ADMIN_TOKEN"
done
```

### 4.2 Revoke Any Sessions Using Compromised Keys

```bash
# Invalidate all active JWT tokens signed with compromised key
# (Vault rotation makes old signing key version unusable)
# Force session expiry:
kubectl exec -n kyc-vault deploy/kyc-api-gateway -- \
  redis-cli -u $REDIS_URL KEYS 'session:*' | while read key; do
    redis-cli -u $REDIS_URL DEL "$key"
  done
```

### 4.3 Restore Services

```bash
# Remove quarantine from services
kubectl delete networkpolicy -n kyc-vault key-compromise-quarantine
kubectl label pod -n kyc-vault -l app.kubernetes.io/name=kyc-credential-service \
  network-policy-

# Scale services back up with new keys
kubectl scale deployment -n kyc-vault kyc-credential-service --replicas=3
kubectl scale deployment -n kyc-vault kyc-zkp-engine --replicas=3

# Verify new keys are in use
curl -s https://api.kyc-vault.com/v1/keys/current | jq
```

## Phase 5: Preventative Measures

### 5.1 Key Hygiene Improvements

- Add `key_usage_monitoring` alerts in Prometheus for unusual signing volumes (3 sigma deviation)
- Enforce `p ahead of automatic rotation
- Store all key versions in immutable audit log
- Implement `key_owner` and `key_purpose` labels on all keys

### 5.2 Detection Improvements

- Add GitGuardian scanning to CI pipeline: `bash scripts/scan-secrets.sh`
- Add `git-secrets` pre-commit hook to prevent key commits
- Implement Tetragon eBPF policy for process that reads key material
- Add Vault audit log shipping to Loki with real-time alerting

### 5.3 Key Rotation Schedule

| Key Type | New Rotation | Previous |
|----------|-------------|----------|
| TLS | 90 days | 180 days |
| JWT Signing | 7 days | 30 days |
| BBS+ | 30 days | 90 days |
| ML-KEM | Per session | Per session |
| ML-DSA | 7 days | 30 days |
| API Keys | 30 days | 90 days |

## Escalation

| Situation | Contact |
|-----------|---------|
| Compromised key used to sign credentials | Security Lead + CISO |
| PQC key algorithm weakness discovered | Cryptography team + external audit |
| Vault root key compromise | CISO + CTO + Legal |
| Potential regulatory breach | Legal + DPO + Regulatory Affairs |
| Law enforcement involvement | Legal + CEO |

## Tools Reference

| Tool | Purpose | Access |
|------|---------|--------|
| Vault CLI | Key lifecycle management | `vault` CLI with admin token |
| AWS KMS | PQC key storage | AWS Console / CLI |
| cert-manager | TLS lifecycle | `kubectl` |
| Loki | Audit log query | Grafana / `logcli` |
| CloudTrail | AWS API audit | AWS Console |
| Tetragon | eBPF process monitoring | `tetra` CLI |
| Sigstore | Key transparency | `cosign` CLI |
