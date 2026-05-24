# Privacy-Preserving KYC Vault

> Reusable DID/KYC vault for cryptographic proof sharing across platforms

[![CI](https://github.com/quantumworld-dpdns-io/privacy-preserving-kyc-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/quantumworld-dpdns-io/privacy-preserving-kyc-vault/actions/workflows/ci.yml)
[![Docker](https://github.com/quantumworld-dpdns-io/privacy-preserving-kyc-vault/actions/workflows/docker-build.yml/badge.svg)](https://github.com/quantumworld-dpdns-io/privacy-preserving-kyc-vault/actions/workflows/docker-build.yml)
[![Security](https://github.com/quantumworld-dpdns-io/privacy-preserving-kyc-vault/actions/workflows/security-scan.yml/badge.svg)](https://github.com/quantumworld-dpdns-io/privacy-preserving-kyc-vault/actions/workflows/security-scan.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **DID** | did:key, did:web, did:ethr — Rust + TypeScript resolvers |
| **KYC** | State machine workflow engine with tiered verification, OCR, liveness, AML screening |
| **ZKP** | Noir circuits, RISC Zero zkVM, BBS+ selective disclosure |
| **Post-Quantum** | ML-KEM (FIPS 203), ML-DSA (FIPS 204), SLH-DSA (FIPS 205), Hybrid X25519+ML-KEM |
| **Quantum** | NVIDIA CUDA-Q QRNG kernels, IBM Qiskit credential commitments |
| **AI Agents** | MCP Protocol server (DID tools, credential resources, KYC prompts) |
| **Vector DB** | Weaviate (primary), Chroma (dev), Qdrant (Rust), Milvus (scale), LanceDB (multi-modal) |
| **Data Lakehouse** | Apache Iceberg + Polaris catalog + Trino + DuckDB + Arrow DataFusion |
| **Confidential** | Apache Teaclave SGX/SEV enclaves for PII processing |
| **Wasm** | Wasmtime + WASI 0.3 + Fermyon Spin microservices |
| **Federated Learning** | Flower + NVIDIA FLARE for fraud detection models |
| **Observability** | OpenTelemetry + LangSmith + W&B Weave + Prometheus + Grafana |
| **Commerce** | Google UCP agentic commerce protocol |
| **Security** | OWASP Top 10 tested, Cilium Tetragon eBPF, semgrep SAST, Trivy, Cosign, SLSA |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Gateway (Express)                        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │
│  │  DID    │ │Credential│ │KYC      │ │  ZKP     │ │  MCP       │  │
│  │Resolve  │ │Issuer    │ │Workflow │ │  Engine  │ │  Server    │  │
│  └────┬────┘ └────┬─────┘ └────┬────┘ └────┬─────┘ └──────┬─────┘  │
│       └──────────┬┴────────────┴───────────┴───────────────┘        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │
│  │  PQC    │ │  TEE     │ │  Wasm   │ │  Vector  │ │  Lakehouse │  │
│  │  Crypto  │ │(Teaclave)│ │(Wasmtime)│ │  (Weav)  │ │ (Iceberg)  │  │
│  └─────────┘ └──────────┘ └─────────┘ └──────────┘ └────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│   Robot Framework (OWASP Top 10 + Functional + E2E + Load Tests)    │
│   CI/CD: GitHub Actions → Docker Build → Release → Package → Deploy  │
│   Observability: OpenTelemetry → LangSmith → W&B → Grafana           │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Clone and set up
git clone https://github.com/quantumworld-dpdns-io/privacy-preserving-kyc-vault.git
cd privacy-preserving-kyc-vault
make setup

# Start infrastructure
docker compose up -d

# Run tests
make test
```

## Project Structure

```
├── crates/              # Rust crates (core DID, ZKP, PQC, Wasm, TEE, gRPC)
│   ├── core/            # Verifiable Credentials, KYC workflow, schema registry
│   ├── did/             # DID document, resolver (key/web/ethr), verification methods
│   ├── zkp/             # ZKP engine abstraction, proof types, universal verifier
│   ├── crypto-pqc/      # HPKE, key management, hybrid crypto, secret sharing
│   └── tee/             # TEE attestation and credential processing
├── packages/            # TypeScript packages (did, core, zkp, crypto, api, mcp)
│   ├── api/             # Express REST API server with DID/credential/KYC routes
│   ├── did/             # DID resolver, document, verification method (TypeScript)
│   ├── zkp/             # ZKP proof generator and verifier
│   └── mcp-server/      # MCP protocol server for AI agent integration
├── services/            # Microservice directory stubs (7 services)
├── circuits/noir/       # Zero-knowledge circuit definitions (Noir DSL)
│   ├── src/             # age_verification, range_proof, nationality_check, etc.
│   └── Nargo.toml       # Noir project configuration
├── risc0/               # RISC Zero zkVM guest programs
├── quantum/             # Quantum computing (CUDA-Q kernels, Qiskit circuits)
├── lib/pqc/             # Post-quantum cryptography (ML-KEM, ML-DSA, hybrid)
├── tests/               # Robot Framework (OWASP Top 10), K6 load tests
│   ├── robot/           # owasp_top10.robot, kyc_workflow.robot, zkp_verification.robot
│   └── load/            # k6 performance test scenarios
├── charts/              # Helm chart for Kubernetes deployment
├── proto/               # Protocol buffer definitions for gRPC services
├── docs/adr/            # Architecture Decision Records (10 ADRs)
└── .github/workflows/   # CI/CD pipelines (13 workflows)
```

## API Endpoints

### DID
- `GET /api/v1/did/resolve/:did` — Resolve DID to DID Document
- `POST /api/v1/did/resolve/batch` — Batch DID resolution

### Credentials
- `POST /api/v1/credentials/issue` — Issue Verifiable Credential
- `GET /api/v1/credentials/:id` — Retrieve credential
- `POST /api/v1/credentials/verify` — Verify credential

### KYC
- `POST /api/v1/kyc/workflows` — Create KYC workflow
- `GET /api/v1/kyc/workflows/:id` — Get workflow status
- `POST /api/v1/kyc/workflows/:id/transition` — Transition workflow state
- `GET /api/v1/kyc/workflows` — List workflows

## Testing

```bash
# Robot Framework (functional + OWASP Top 10)
cd tests && robot robot/owasp_top10.robot && robot robot/kyc_workflow.robot

# K6 load tests
k6 run tests/load/kyc_scenarios.js

# Unit tests
make test
```

## License

MIT — Copyright 2026 quantumworld-dpdns-io
