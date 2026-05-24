# Post-Quantum Cryptography (PQC) Migration Runbook

## Overview

This runbook documents the transition plan for migrating KYC Vault from classical-only cryptography to post-quantum cryptographic algorithms. The migration follows NIST FIPS 203 (ML-KEM), FIPS 204 (ML-DSA), and FIPS 205 (SLH-DSA) standards, with a hybrid operating mode during the transition.

## Algorithm Inventory

### Current State (Classical)
| Purpose | Algorithm | Key Size |
|---------|-----------|----------|
| Key Exchange | X25519 | 32 bytes |
| Signing | Ed25519 | 32 bytes |
| TLS | ECDSA P-384 | 48 bytes |
| Credential Signing | BBS+ (ECC) | 32 bytes |
| Hashing | SHA-256 / SHA-384 | N/A |

### Target State (Post-Quantum)
| Purpose | Algorithm | NIST Standard | Key/Enc Size | Security Level |
|---------|-----------|---------------|-------------|----------------|
| Key Encapsulation | ML-KEM-768 | FIPS 203 | 1088 bytes | 3 (AES-192) |
| Key Encapsulation | ML-KEM-1024 | FIPS 203 | 1568 bytes | 5 (AES-256) |
| Digital Signature | ML-DSA-65 | FIPS 204 | 2176 bytes | 3 (AES-192) |
| Digital Signature | SLH-DSA-SHA2-128s | FIPS 205 | 7856 bytes | 1 (AES-128) |
| Hybrid KEM | X25519+ML-KEM-768 | NIST SP 800-227 | 96+1088 bytes | Hybrid |
| Hybrid Signing | Ed25519+ML-DSA-65 | NIST SP 800-227 | 32+2176 bytes | Hybrid |

### Migration Phases

```
Phase 0 (Now): Classical only (X25519, Ed25519, ECDSA)
     │
     ▼
Phase 1 (Q3 2026): Hybrid mode (X25519+ML-KEM, Ed25519+ML-DSA)
     │
     ▼
Phase 2 (Q1 2027): PQC preferred (ML-KEM, ML-DSA) with classical fallback
     │
     ▼
Phase 3 (Q3 2027): PQC only (ML-KEM, ML-DSA, SLH-DSA)
     │
     ▼
Phase 4 (2028+): Full PQC mandatory, classical removed
```

## Phase 1: Hybrid Mode Operation

### 1.1 Enable Hybrid KEM

```bash
# Configure Vault transit engine for hybrid encryption
vault write /transit/keys/hybrid-kem \
  type=hybrid-kem \
  kem_type="x25519-ml-kem-768" \
  derived=false

# Enable hybrid KEM on API gateway
kubectl set env deployment/kyc-api-gateway -n kyc-vault \
  PQC_MODE=hybrid \
  KEM_ALGORITHM="X25519+ML-KEM-768" \
  SIGNING_ALGORITHM="Ed25519+ML-DSA-65"

# Generate PQ keys alongside classical keys
vault write /transit/keys/pqc-kem-768 type=ml-kem-768
vault write /transit/keys/pqc-sign-65 type=ml-dsa-65
vault write /transit/keys/pqc-hash-sign type=slh-dsa-sha2-128s
```

### 1.2 Dual-Path Protocol

When operating in hybrid mode, all cryptographic operations produce two outputs:

```
Client → Server (Key Encapsulation):
  ├── Classical: X25519 ephemeral public key (32 bytes)
  └── PQC: ML-KEM-768 ciphertext (1088 bytes)
  Total wire size: ~1120 bytes (vs 32 bytes classical-only)

Server → Client (Signed Response):
  ├── Classical: Ed25519 signature (64 bytes)
  └── PQC: ML-DSA-65 signature (2176 bytes)
  Total wire size: ~2240 bytes (vs 64 bytes classical-only)
```

The protocol accepts a request if **either** path verifies. This prevents downgrade attacks while allowing backwards compatibility.

### 1.3 Configuration

```yaml
# config/pqc-hybrid.yaml
mode: hybrid
kex:
  classical: X25519
  pqc: ML-KEM-768
  hybrid: X25519+ML-KEM-768
signing:
  classical: Ed25519
  pqc: ML-DSA-65
  hybrid: Ed25519+ML-DSA-65
fallback:
  allow_classical_only: true    # Clients that don't support PQ yet
  alert_on_classical_only: true # Warn admin about non-PQ clients
```

### 1.4 Verify Hybrid Mode

```bash
# Check that both KEM outputs are present
curl -s -X POST https://api.kyc-vault.com/v1/keys/encapsulate \
  -H "Content-Type: application/json" \
  -d '{"public_key_type": "hybrid"}' | jq

# Response should contain both classical and PQC ciphertexts:
# {
#   "kem_ciphertext_classical": "base64...",
#   "kem_ciphertext_pqc": "base64...",
#   "kem_algorithm": "X25519+ML-KEM-768"
# }
```

## Phase 2: PQC Preferred

### 2.1 Switch Preference

```bash
# Change mode to pqc-preferred (PQC tried first, classical fallback)
kubectl set env deployment/kyc-api-gateway -n kyc-vault \
  PQC_MODE=pqc-preferred

# All new connections attempt PQC first
# Classical used only if client doesn't signal PQC capability
```

### 2.2 Monitor Fallback Rate

```bash
# Query Loki for classical-only connections
logcli query '{app="api-gateway"} |= "pqc_fallback" |= "classical_only"' --since=24h

# Prometheus: track PQC adoption rate
curl -s 'http://prometheus:9090/api/v1/query?query=pqc_adoption_rate'
```

## Phase 3: PQC Only

### 3.1 Cutover

```bash
# Remove classical key exchange
kubectl set env deployment/kyc-api-gateway -n kyc-vault \
  PQC_MODE=pqc-only \
  CLASSICAL_KEX_ENABLED=false

# Remove classical signing support
kubectl set env deployment/kyc-credential-service -n kyc-vault \
  CLASSICAL_SIGNING_ENABLED=false
```

### 3.2 Verify Full PQC Operation

```bash
# Confirm no classical crypto in use
curl -s https://api.kyc-vault.com/v1/crypto/status | jq '.pqc_only'

# Verify all services use PQ algorithms
for svc in kyc-api-gateway kyc-orchestrator kyc-credential-service kyc-zkp-engine; do
  echo "=== $svc ==="
  kubectl exec -n kyc-vault deploy/$svc -- env | grep PQC
done
```

## Rollback Procedure

### Rollback to Classical

```bash
# Step 1: Re-enable classical algorithms
kubectl set env deployment/kyc-api-gateway -n kyc-vault \
  PQC_MODE=disabled \
  CLASSICAL_KEX_ENABLED=true \
  CLASSICAL_SIGNING_ENABLED=true

# Step 2: Reload Vault transit keys (disable PQ keys)
vault write /transit/keys/hybrid-kem/config \
  min_decryption_version=1 \
  min_encryption_version=1

# Step 3: Restart services
kubectl rollout restart deployment -n kyc-vault kyc-api-gateway
kubectl rollout restart deployment -n kyc-vault kyc-credential-service
kubectl rollout restart deployment -n kyc-vault kyc-orchestrator

# Step 4: Verify classical-only operation
curl -s https://api.kyc-vault.com/v1/health | jq '.crypto["mode"]'
# Expected: "classical"
```

### Rollback from Hybrid to Classical

```bash
# Remove PQ environment variables
kubectl set env deployment/kyc-api-gateway -n kyc-vault \
  PQC_MODE- \
  KEM_ALGORITHM- \
  SIGNING_ALGORITHM-

# Remove PQ Vault keys
vault delete /transit/keys/pqc-kem-768
vault delete /transit/keys/pqc-sign-65
vault delete /transit/keys/pqc-hash-sign
vault delete /transit/keys/hybrid-kem

# Restart and verify
kubectl rollout restart deployment -n kyc-vault kyc-api-gateway
```

## Client Compatibility Matrix

| Client Version | Classical | Hybrid | PQC-Preferred | PQC-Only |
|---------------|-----------|--------|---------------|----------|
| SDK < 1.0 | ✅ | ❌ | ❌ | ❌ |
| SDK 1.0-1.5 | ✅ | ✅ | ✅ | ❌ |
| SDK 1.5+ | ✅ | ✅ | ✅ | ✅ |
| Browser (WebCrypto) | ✅ | ⚠️ (WebCrypto only) | ⚠️ | ❌ |
| Mobile SDK 2.0+ | ✅ | ✅ | ✅ | ✅ |

## Performance Benchmarks

| Operation | Classical | Hybrid (x2) | PQC Only | Notes |
|-----------|-----------|-------------|----------|-------|
| KEM Encaps | 0.3 ms | 1.2 ms | 0.9 ms | ML-KEM dominant cost |
| KEM Decaps | 0.3 ms | 1.1 ms | 0.8 ms | |
| Sign (64 bytes) | 0.1 ms | 1.8 ms | 1.7 ms | ML-DSA 2.5x larger |
| Verify (64 bytes) | 0.1 ms | 0.5 ms | 0.4 ms | Verification cheaper than signing |
| TLS Handshake | 3 ms | 12 ms | 9 ms | Larger cert chains |
| Credential Issue | 2 ms | 15 ms | 13 ms | Dominated by ML-DSA signing |

## Testing

### Unit Tests

```bash
# Run PQC-specific test suite
cargo test --package pqc-crypto

# Test hybrid mode interoperability
cargo test --package pqc-crypto --test hybrid_mode

# Test rollback procedure
cargo test --package pqc-crypto --test rollback
```

### Integration Tests

```bash
# Test client-server handshake in all modes
just test-pqc-handshake

# Verify backwards compatibility
just test-pqc-compatibility

# Performance benchmark
just bench-pqc
```

### Security Tests

```bash
# Validate against NIST ACVP test vectors
just test-pqc-acvp

# Check for side-channel leakage
cargo test --package pqc-crypto --test side_channel

# Verify fault injection resistance
cargo test --package pqc-crypto --test fault_injection
```

## Migration Checklist

| Phase | Task | Owner | Target Date | Status |
|-------|------|-------|-------------|--------|
| 0 | Inventory all classical crypto usage | Crypto team | Complete | ✅ |
| 1 | Implement ML-KEM-768 in Vault plugin | Platform | Q3 2026 | [ ] |
| 1 | Implement ML-DSA-65 in credential service | Platform | Q3 2026 | [ ] |
| 1 | Add hybrid protocol support to API gateway | Backend | Q3 2026 | [ ] |
| 1 | Update SDKs with PQC capability | SDK team | Q3 2026 | [ ] |
| 2 | Switch default to PQC-preferred | Platform | Q1 2027 | [ ] |
| 2 | Audit all classical-only clients | Ops | Q1 2027 | [ ] |
| 3 | Remove classical fallback | Platform | Q3 2027 | [ ] |
| 3 | Finalize SLH-DSA backup integration | Crypto team | Q3 2027 | [ ] |
| 4 | Remove classical crypto code | Platform | 2028 | [ ] |

## Alerting Rules

```yaml
# prometheus/alerts/pqc.yml
groups:
  - name: pqc
    rules:
      - alert: PQCClassicalFallbackRateHigh
        expr: rate(pqc_fallback_total[5m]) > 0.5
        for: 30m
        labels: { severity: warning }
        annotations:
          summary: "PQC classical fallback rate > 50% — clients not upgraded"

      - alert: PQCHybridDecryptionFailure
        expr: rate(pqc_decryption_failure_total[5m]) > 0.01
        for: 10m
        labels: { severity: critical }
        annotations:
          summary: "PQC hybrid decryption failure rate > 1%"

      - alert: PQCPerformanceDegradation
        expr: histogram_quantile(0.99, rate(pqc_kem_duration_seconds[5m])) > 2
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "P99 KEM duration > 2s — investigate performance"
```

## References

- NIST FIPS 203 (ML-KEM): https://csrc.nist.gov/pubs/fips/203/final
- NIST FIPS 204 (ML-DSA): https://csrc.nist.gov/pubs/fips/204/final
- NIST FIPS 205 (SLH-DSA): https://csrc.nist.gov/pubs/fips/205/final
- NIST SP 800-227 (Hybrid): https://csrc.nist.gov/pubs/sp/800/227/ipd
- IETF TLS 1.3 Hybrid KEM: https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/
