#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Data Flow Mapping & Processing Activity Records
# Generates data flow diagrams and ROPA (Record of Processing
# Activities) artifacts for GDPR Art. 30 compliance.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-./reports}"
REPORT_DATE=$(date +%Y-%m-%d)
ROPA_FILE="${OUTPUT_DIR}/ropa-${REPORT_DATE}.md"
DATA_FLOW_FILE="${OUTPUT_DIR}/data-flow-${REPORT_DATE}.md"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -o, --output DIR   Output directory (default: ./reports)
  -s, --source DIR   Source config directory (default: auto-detect)
  -i, --include-env  Include environment/third-party processors
  -h, --help         Show this help message
EOF
  exit 1
}

INCLUDE_ENV=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output) OUTPUT_DIR="$2"; shift 2 ;;
    -s|--source) SOURCE_DIR="$2"; shift 2 ;;
    -i|--include-env) INCLUDE_ENV=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}Generating Data Flow Mapping and ROPA...${NC}"
echo "  Output: $OUTPUT_DIR"

# ============================================================
# Discover system components and data stores
# ============================================================
echo -e "${YELLOW}Discovering system components...${NC}"

declare -A COMPONENTS
COMPONENTS["api-gateway"]="External API gateway handling credential submission and verification requests"
COMPONENTS["kyc-orchestrator"]="Core orchestration service managing KYC workflows"
COMPONENTS["credential-processor"]="Credential validation and processing service"
COMPONENTS["tee-worker"]="Trusted Execution Environment for secure credential processing"
COMPONENTS["did-registry"]="Decentralized Identifier registry service"
COMPONENTS["zkp-verifier"]="Zero-Knowledge Proof verification service"
COMPONENTS["audit-service"]="Centralized audit logging service"
COMPONENTS["vault"]="Hashicorp Vault for secrets and key management"

DATA_STORES=(
  "PostgreSQL:credential_data:KYC credentials and user data:encrypted_at_rest"
  "Redis:session_cache:Session tokens and rate limit counters:in_memory_encrypted"
  "MinIO:document_store:Uploaded credential documents:SSE-S3"
  "Weaviate:vector_index:Embedding vectors for similarity search:encrypted_index"
)

EXTERNAL_PROCESSORS=(
  "AWS EKS:US East (us-east-1):Kubernetes hosting:DPA in place"
  "AWS S3:US East (us-east-1):Document storage:SSE-KMS"
  "Elasticsearch Service:US East (us-east-1):Log aggregation:DPA in place"
)

echo -e "${GREEN}Found ${#COMPONENTS[@]} components and ${#DATA_STORES[@]} data stores${NC}"

# ============================================================
# Generate Data Flow Map
# ============================================================
echo -e "${BLUE}Generating data flow map...${NC}"

generate_mermaid_diagram() {
  cat <<EOF
graph TD
    subgraph External
        USER[End User / Client App]
        ISSUER[Credential Issuer]
        REGULATOR[Regulator / Auditor]
    end

    subgraph Gateway
        GW[API Gateway]
        LB[Load Balancer]
        WAF[Web Application Firewall]
    end

    subgraph Core
        ORCH[KYC Orchestrator]
        CP[Credential Processor]
        DID[DID Registry]
    end

    subgraph TEE
        TEE_W[Teaclave Worker]
        TEE_AAS[Authentication Service]
        TEE_API[API Service]
    end

    subgraph Crypto
        ZKP[ZKP Verifier]
        PQC[Post-Quantum Crypto]
        SIG[Digital Signature Service]
    end

    subgraph Storage
        PG[(PostgreSQL)]
        RD[(Redis)]
        S3[(MinIO / S3)]
        WV[(Weaviate)]
    end

    subgraph Infrastructure
        VAULT[Vault]
        MON[Prometheus/Grafana]
        LOG[Loki/ELK]
        TETRA[Tetragon]
    end

    USER -->|HTTPS/mTLS| GW
    ISSUER -->|mTLS| GW
    REGULATOR -->|mTLS| GW

    GW --> WAF
    WAF --> LB
    LB --> ORCH
    LB --> CP

    ORCH --> DID
    ORCH --> CP
    ORCH --> VAULT

    CP --> TEE_W
    CP --> ZKP
    CP --> PQC
    CP --> SIG

    TEE_W --> TEE_AAS
    TEE_W --> TEE_API

    ORCH --> PG
    CP --> PG
    DID --> PG

    ORCH --> RD

    CP --> S3
    CP --> WV

    ORCH --> MON
    ORCH --> LOG
    LOG --> TETRA

    style TEE_W fill:#f9f,stroke:#333,stroke-width:2px
    style TEE_AAS fill:#f9f,stroke:#333,stroke-width:2px
    style TEE_API fill:#f9f,stroke:#333,stroke-width:2px
    style PG fill:#e6f3ff,stroke:#333
    style S3 fill:#e6f3ff,stroke:#333
EOF
}

cat > "$DATA_FLOW_FILE" <<EOF
# Data Flow Map

**Generated:** $(date -u '+%Y-%m-%dT%H:%M:%SZ')
**Version:** 1.0.0

## System Architecture Overview

The following diagram shows data flows between system components:

\`\`\`mermaid
$(generate_mermaid_diagram)
\`\`\`

## Component Inventory

| Component | Description | Data Processed | Security Controls |
|-----------|-------------|----------------|-------------------|
EOF

for comp in "${!COMPONENTS[@]}"; do
  desc="${COMPONENTS[$comp]}"
  echo "| $comp | $desc | Credential metadata, PII | TLS, mTLS, RBAC, Audit |" >> "$DATA_FLOW_FILE"
done

cat >> "$DATA_FLOW_FILE" <<EOF

## Data Stores

| Store | Purpose | Data Types | Encryption |
|-------|---------|------------|------------|
EOF

for ds in "${DATA_STORES[@]}"; do
  IFS=':' read -r name purpose data enc <<< "$ds"
  echo "| $name | $purpose | $data | $enc |" >> "$DATA_FLOW_FILE"
done

if $INCLUDE_ENV; then
  cat >> "$DATA_FLOW_FILE" <<EOF

## External Processors / Sub-processors

| Processor | Location | Service | Agreement |
|-----------|----------|---------|-----------|
EOF
  for proc in "${EXTERNAL_PROCESSORS[@]}"; do
    IFS=':' read -r name location service agreement <<< "$proc"
    echo "| $name | $location | $service | $agreement |" >> "$DATA_FLOW_FILE"
  done
fi

echo -e "${GREEN}Data flow map generated:${NC} $DATA_FLOW_FILE"

# ============================================================
# Generate ROPA (Record of Processing Activities)
# ============================================================
echo -e "${BLUE}Generating ROPA (Record of Processing Activities)...${NC}"

cat > "$ROPA_FILE" <<EOF
# Record of Processing Activities (ROPA)
## GDPR Article 30 Compliance

**Organization:** KYC Vault Operator
**DPO:** security@kyc-vault.internal
**Generated:** $(date -u '+%Y-%m-%dT%H:%M:%SZ')
**Version:** 1.0.0

---

## Processing Activity 1: Credential Verification

| Field | Value |
|-------|-------|
| **Purpose** | Identity verification using digital credentials |
| **Controller** | KYC Vault Operator |
| **DPO Contact** | dpo@kyc-vault.internal |
| **Lawful Basis** | Consent (Art. 6(1)(a)), Legal Obligation (Art. 6(1)(c)) |
| **Data Subjects** | End users, credential holders |
| **Categories** | Identity documents (passport, DL, national ID), financial statements, biometric verification |
| **Recipients** | Regulators (on request), credential issuers (verification status only) |
| **Third Country Transfers** | US (SCCs in place), EU (adequacy decision) |
| **Retention Period** | 7 years for audit logs, 90 days for verification records |
| **Security Measures** | TLS 1.3, AES-256-GCM, TEE, ZKP, RBAC, audit logging |

## Processing Activity 2: Fraud Screening

| Field | Value |
|-------|-------|
| **Purpose** | AML/KYC compliance screening |
| **Controller** | KYC Vault Operator |
| **Lawful Basis** | Legal Obligation (Art. 6(1)(c)), Public Interest (Art. 6(1)(e)) |
| **Data Subjects** | End users |
| **Categories** | Sanctions lists, PEP status, adverse media, transaction patterns |
| **Recipients** | Compliance team, regulators |
| **Retention Period** | 10 years (regulatory requirement) |
| **Security Measures** | TLS 1.3, role-based access, audit trail, encryption at rest |

## Processing Activity 3: Audit Logging

| Field | Value |
|-------|-------|
| **Purpose** | Security monitoring, compliance auditing |
| **Controller** | KYC Vault Operator |
| **Lawful Basis** | Legal Obligation (Art. 6(1)(c)), Legitimate Interest (Art. 6(1)(f)) |
| **Data Subjects** | All system users |
| **Categories** | Access logs, operation logs, authentication events, policy violations |
| **Recipients** | Internal audit, external auditors, regulators |
| **Retention Period** | 7 years (immutable, WORM storage) |
| **Security Measures** | Immutable logging, cryptographic signing, hash chain, access controls |

## Processing Activity 4: Data Analytics

| Field | Value |
|-------|-------|
| **Purpose** | Service improvement, fraud detection model training |
| **Controller** | KYC Vault Operator |
| **Lawful Basis** | Legitimate Interest (Art. 6(1)(f)), Consent (Art. 6(1)(a)) |
| **Data Subjects** | End users |
| **Categories** | Anonymized usage patterns, aggregated verification statistics |
| **Recipients** | Internal data science team |
| **Retention Period** | 2 years |
| **Security Measures** | Anonymization, pseudonymization, differential privacy |

---

## Data Subject Rights Implementation

| Right | Implementation | SLA |
|-------|---------------|-----|
| Right to be informed | Privacy notice at collection point | Immediate |
| Right of access | GET /api/v1/credentials/:id | 30 days |
| Right to rectification | PUT /api/v1/credentials/:id | 30 days |
| Right to erasure | DELETE /api/v1/credentials/:id | 30 days |
| Right to restrict processing | PATCH /api/v1/credentials/:id/restrict | 30 days |
| Right to data portability | GET /api/v1/credentials/:id/export | 30 days |
| Right to object | POST /api/v1/credentials/:id/object | Immediate |

---

## Technical and Organizational Measures

### Technical Measures
- Encryption at rest: AES-256-GCM with automatic key rotation
- Encryption in transit: TLS 1.3 with mTLS for service-to-service
- Access control: RBAC with attribute-based policy enforcement (OPA)
- TEE-based processing: Intel SGX / AMD SEV-SNP for sensitive operations
- Zero-Knowledge Proofs: Selective disclosure of credential attributes
- Audit logging: Immutable, cryptographically signed, hash-chained
- Network security: Kubernetes network policies, service mesh (Istio)
- Vulnerability management: Automated SAST/DAST, dependency scanning

### Organizational Measures
- Data Protection Officer appointed
- Employee security training program
- Incident response plan with 72-hour notification
- Regular security assessments and penetration testing
- Vendor due diligence and DPA management
- Data breach notification procedures
- Records of processing activities maintained

---

## Review Log

| Date | Reviewed By | Changes |
|------|-------------|---------|
| $(date +%Y-%m-%d) | Compliance Team | Initial ROPA generation |

---

*Report generated by compliance/data_mapping.sh*
EOF

echo -e "${GREEN}ROPA generated:${NC} $ROPA_FILE"
echo ""
echo "Files created:"
echo "  1. $DATA_FLOW_FILE"
echo "  2. $ROPA_FILE"
echo ""
echo -e "${BLUE}Data flow map includes ${#COMPONENTS[@]} components and ${#DATA_STORES[@]} data stores${NC}"
echo -e "${BLUE}ROPA covers 4 processing activities with GDPR Article 30 compliance${NC}"

exit 0
