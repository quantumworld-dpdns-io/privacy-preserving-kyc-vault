# ZKP Circuit Upgrade Runbook

## Overview

This runbook covers the end-to-end process for upgrading zero-knowledge proof circuits in the KYC Vault platform. Circuits are defined in Noir (under `circuits/noir/`) and RISC Zero zkVM (under `risc0/`), with verification support across Groth16, PLONK, and STARK proof systems.

## Circuit Inventory

| Circuit ID | System | Purpose | Status |
|------------|--------|---------|--------|
| `age_verification` | Noir | Prove age >= threshold without DOB | Active |
| `range_proof` | Noir | Generic numeric range proof | Active |
| `nationality_check` | Noir | Prove nationality from set | Active |
| `document_validity` | RISC Zero | Verify document hash chain | Active |
| `credential_equality` | Noir | Prove two credentials share claim | Active |

## Proof Format Versioning

All proofs carry a version header to enable backwards-compatible verification:

```
┌──────────────────────────────────────────────┐
│ Proof Envelope                                │
├──────────────────────────────────────────────┤
│ version: {major}.{minor} (2 bytes)           │
│ circuit_id: string                           │
│ system: Noir | RiscZero | BBSPlus | Groth16 │
│ proof_data: bytes                            │
│ public_inputs: bytes                         │
│ timestamp: ISO8601                           │
│ nonce: bytes[16]                             │
└──────────────────────────────────────────────┘
```

### Version Compatibility Matrix

| Proof Version | Verifier v1.x | Verifier v2.x | Verifier v3.x |
|---------------|---------------|---------------|---------------|
| v1.0 | ✅ | ✅ (compat) | ❌ |
| v1.1 | ✅ | ✅ (compat) | ❌ |
| v2.0 | ❌ | ✅ | ✅ (compat) |
| v2.1 | ❌ | ✅ | ✅ (compat) |
| v3.0 | ❌ | ❌ | ✅ |

## Phase 1: Prepare New Circuit

### 1.1 Develop Circuit

```bash
# Navigate to circuit definitions
cd circuits/noir/

# Create new circuit version
cp -r src/age_verification src/age_verification_v2

# Update Nargo.toml
nargo check --package age_verification_v2
```

### 1.2 Generate Proving Parameters

```bash
# Trusted setup (Groth16)
nargo compile --package age_verification_v2
nargo setup --package age_verification_v2

# Upload params to S3
aws s3 cp ./target/age_verification_v2.srs \
  s3://kyc-vault-zkp-params/v2/age_verification/ \
  --sse aws:kms

aws s3 cp ./target/age_verification_v2.vk \
  s3://kyc-vault-zkp-params/v2/age_verification/ \
  --sse aws:kms
```

### 1.3 Upload Verification Key

```bash
# Store verification key in configmap for verifier
kubectl create configmap -n kyc-vault zkp-vk-v2 \
  --from-file=verification-key=./target/age_verification_v2.vk \
  --from-literal=circuit-id=age_verification \
  --from-literal=version=2.0.0 \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 1.4 Register on Verifier Contract (if on-chain)

```bash
# For on-chain verification (smart contract), deploy new verifier
# The UniversalVerifier routes proofs to the correct verifier by version
curl -X POST https://api.kyc-vault.com/v1/zkp/register-circuit \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "circuit_id": "age_verification",
    "version": "2.0.0",
    "verification_key": "<base64_vk>",
    "engine": "noir",
    "public_input_count": 2,
    "private_input_count": 1
  }'
```

## Phase 2: Backwards Compatibility Mode

### 2.1 Enable Dual-Proof Mode

The ZKP engine runs both the old and new verifiers simultaneously:

```yaml
# config/zkp-dual-mode.yaml
dual_verification:
  enabled: true
  old_circuit_version: "1.0.0"
  new_circuit_version: "2.0.0"
  old_verifier_ref: "v1"
  new_verifier_ref: "v2"
  acceptance_criteria: "any"  # "any" = accept if either verifies; "both" = require both
```

```bash
# Apply dual-verification configuration
kubectl apply -f config/zkp-dual-mode.yaml
kubectl set env deployment/kyc-zkp-engine -n kyc-vault \
  ZKP_DUAL_VERIFICATION=true \
  ZKP_V1_COMPAT=true
```

### 2.2 Verify Cross-Compatibility

```bash
# Test old proof against new verifier
curl -X POST https://api.kyc-vault.com/v1/zkp/test-compatibility \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "circuit_id": "age_verification",
    "old_proof": "<base64_old_proof>",
    "new_public_inputs": ["25", "21"]
  }'

# Expected: {"v1_verifies": true, "v2_verifies": true, "compatible": true}
```

## Phase 3: Migration

### 3.1 Generate New Proofs

```bash
# Update prover SDK version to generate v2 proofs
# The SDK negotiates the proof version via API capability headers:

curl -s https://api.kyc-vault.com/v1/zkp/capabilities | jq '.proof_versions'
# Response: {"supported": ["1.0", "2.0"], "default": "1.0", "latest": "2.0"}

# After migration, change default to v2:
curl -X PUT https://api.kyc-vault.com/v1/zkp/capabilities \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"default": "2.0"}'
```

### 3.2 Monitor Proof Generation

```bash
# Track v1 vs v2 proof generation rates
logcli query '{app="zkp-engine"} |= "proof_generated"' --since=1h \
  | grep -oP 'version":\s*"\d+\.\d+' | sort | uniq -c

# Track verification success rates by version
logcli query '{app="zkp-engine"} |= "verification"' --since=1h \
  | grep -oP 'circuit_version=\S+' | sort | uniq -c

# Prometheus query for v1 vs v2 adoption
curl -s 'http://prometheus:9090/api/v1/query?query=zkp_proofs_by_version{version="2.0"}'
```

## Phase 4: Cutover

### 4.1 Switch to New Verifier Only

```bash
# Disable dual verification mode
kubectl set env deployment/kyc-zkp-engine -n kyc-vault \
  ZKP_DUAL_VERIFICATION=false

# Set new circuit version as the active verifier
kubectl set env deployment/kyc-zkp-engine -n kyc-vault \
  ZKP_ACTIVE_CIRCUIT_VERSION=2.0.0

# Restart ZKP engine to pick up new config
kubectl rollout restart deployment -n kyc-vault kyc-zkp-engine
```

### 4.2 Verify Only v2 Proofs Accepted

```bash
# Test that a v1 proof is now rejected
curl -X POST https://api.kyc-vault.com/v1/zkp/verify \
  -H "Content-Type: application/json" \
  -d '{"proof_version": "1.0", "proof": "<base64_old>", "public_inputs": ["25", "21"]}'
# Expected: {"verified": false, "reason": "unsupported_proof_version", "supported_versions": ["2.0", "2.1"]}

# Test that a v2 proof is accepted
curl -X POST https://api.kyc-vault.com/v1/zkp/verify \
  -H "Content-Type: application/json" \
  -d '{"proof_version": "2.0", "proof": "<base64_new>", "public_inputs": ["25", "21"]}'
# Expected: {"verified": true, "circuit_version": "2.0.0", "proving_time_ms": 42}
```

### 4.3 Update Client SDKs

```bash
# Bump SDK version to require v2 proofs
# Update SDK version in package.json / Cargo.toml
# SDK auto-negotiation flow:
# 1. SDK calls GET /v1/zkp/capabilities
# 2. SDK uses latest supported version
# 3. Fallback to v1 only if server advertises it

pnpm version patch --workspace @kyc-vault/zkp-sdk
cargo bump patch -p kyc-zkp-sdk
```

## Rollback Procedure

### Rollback to v1 Verifier

```bash
# Step 1: Re-enable dual mode with v1 as default
kubectl set env deployment/kyc-zkp-engine -n kyc-vault \
  ZKP_DUAL_VERIFICATION=true \
  ZKP_ACTIVE_CIRCUIT_VERSION=1.0.0

# Step 2: Remove v2 as supported version
curl -X PUT https://api.kyc-vault.com/v1/zkp/capabilities \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"default": "1.0", "supported": ["1.0"]}'

# Step 3: Restart ZKP engine
kubectl rollout restart deployment -n kyc-vault kyc-zkp-engine

# Step 4: Verify v1 proofs work
curl -X POST https://api.kyc-vault.com/v1/zkp/verify \
  -H "Content-Type: application/json" \
  -d '{"proof_version": "1.0", "proof": "<base64>", "public_inputs": ["25", "21"]}'
# Expected: {"verified": true}
```

### Rollback On-Chain Verifier

```bash
# If using on-chain verification, deploy old verifier contract
# and update the verifier registry address
kubectl set env deployment/kyc-zkp-engine -n kyc-vault \
  ZKP_VERIFIER_CONTRACT=0xOLD_VERIFIER_ADDRESS
kubectl rollout restart deployment -n kyc-vault kyc-zkp-engine
```

## Verifier Contract Migration (On-Chain)

For blockchain-based verification of ZKP proofs:

```solidity
// Simplified verifier registry interface
interface IVerifierRegistry {
    function registerVerifier(uint256 circuitId, address verifier, uint256 version) external;
    function getVerifier(uint256 circuitId, uint256 version) external view returns (address);
    function setActiveVersion(uint256 circuitId, uint256 version) external;
    function unregisterVerifier(uint256 circuitId, uint256 version) external;
}
```

```bash
# Register new verifier contract
cast send $VERIFIER_REGISTRY "registerVerifier(uint256,address,uint256)" \
  1 0xNEW_VERIFIER_ADDRESS 2 \
  --private-key $ADMIN_KEY

# Set as active
cast send $VERIFIER_REGISTRY "setActiveVersion(uint256,uint256)" 1 2 \
  --private-key $ADMIN_KEY
```

## Testing Matrix

| Test | Command | Expected |
|------|---------|----------|
| Unit tests | `cargo test --package zkp` | All pass |
| Circuit compilation | `nargo compile --package age_verification_v2` | No errors |
| Proof generation | `cargo test --package zkp --test proof_generation` | Generates valid v2 proof |
| Cross-version verify | `cargo test --package zkp --test cross_version` | v1 proofs with v2 verifier |
| Dual mode | Integration test `zkp_dual_mode` | Both verifiers accept |
| Performance | `just bench-zkp` | Proving time within 2x of v1 |

## Monitoring & Alerting

```yaml
# prometheus/alerts/zkp.yml
groups:
  - name: zkp
    rules:
      - alert: ZKPV1ProofRateTooHigh
        expr: rate(zkp_proofs_by_version{version="1.0"}[1h]) > 100
        for: 6h
        labels: { severity: warning }
        annotations:
          summary: "Still receiving v1 proofs 6h after cutover"

      - alert: ZKPV1FallbackActive
        expr: zkp_v1_fallback_active == 1
        for: 1h
        labels: { severity: warning }
        annotations:
          summary: "V1 fallback verifier still active — upgrade clients"

      - alert: ZKPCircuitUpgradeFailed
        expr: rate(zkp_verification_failures{reason="unsupported_version"}[5m]) > 0.01
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "Circuit upgrade rejection rate > 1%"
```

## Upgrade Checklist

| Phase | Step | Owner | Status |
|-------|------|-------|--------|
| 1 | Develop new circuit version | ZKP team | [ ] |
| 1 | Generate proving parameters | ZKP team | [ ] |
| 1 | Upload verification keys | Platform | [ ] |
| 1 | Update configmap | Platform | [ ] |
| 2 | Enable dual-verification mode | Platform | [ ] |
| 2 | Run compatibility tests | QA | [ ] |
| 3 | Switch SDK default to v2 | SDK team | [ ] |
| 3 | Monitor v1->v2 migration rate | Ops | [ ] |
| 4 | Cutover to v2 only | Platform | [ ] |
| 4 | Verify v1 proofs rejected | QA | [ ] |
| 4 | Update documentation | Docs team | [ ] |
| 4 | Archive v1 parameters | Platform | [ ] |
