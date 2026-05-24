# KYC Vault Architecture

## System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KYC Vault - Privacy-Preserving KYC System             │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                    │
│  │   Identity    │    │  Regulatory  │    │  Customer     │                    │
│  │   Providers   │    │  Authorities │    │  Applications │                    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                    │
│         │                   │                   │                            │
│         └───────────────────┼───────────────────┘                            │
│                             │                                                │
│                    ┌────────▼────────┐                                       │
│                    │  API Gateway     │                                       │
│                    │  (Port 443)      │                                       │
│                    └────────┬────────┘                                       │
│                             │                                                │
│                    ┌────────▼────────┐                                       │
│                    │  KYC Orchestrator│                                       │
│                    │  (Workflow)      │                                       │
│                    └──┬──┬──┬──┬──┬──┘                                       │
│                       │  │  │  │  │                                          │
│         ┌─────────────┘  │  │  │  └──────────────┐                           │
│         │          ┌─────┘  │  └─────┐           │                           │
│         ▼          ▼        ▼        ▼           ▼                           │
│  ┌──────────┐ ┌────────┐ ┌──────┐ ┌────────┐ ┌──────────┐                   │
│  │Credential│ │   AI   │ │ ZKP  │ │  DID   │ │Compliance│                   │
│  │ Service  │ │Inference│ │Engine│ │Resolver│ │ Service  │                   │
│  └────┬─────┘ └────────┘ └──────┘ └────────┘ └──────────┘                   │
│       │                                                                      │
│  ┌────▼────────────────────────────────────────────────────┐                 │
│  │              Persistence Layer                            │                 │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐       │                 │
│  │  │ RDS  │ │Redis │ │Kafka │ │S3    │ │Weaviate│       │                 │
│  │  │(PG)  │ │(Cache)│ │(Events)│ │(DL) │ │(Vectors)│       │                 │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └────────┘       │                 │
│  └──────────────────────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Container Diagram (C4 Level 2)

### Core Services

```
┌──────────────────────────────────────────────────────────────────┐
│ API Gateway (Express.js)                                         │
├──────────────────────────────────────────────────────────────────┤
│ Routes: /v1/credentials, /v1/verify, /v1/presentations          │
│ Auth: Bearer JWT, mTLS, Rate Limiting                            │
│ TLS: cert-manager (Let's Encrypt + Internal CA)                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ KYC Orchestrator (Rust + LangGraph)                              │
├──────────────────────────────────────────────────────────────────┤
│ Workflow: Document Upload → Classification → Liveness Check     │
│           → Fraud Assessment → Compliance Check → Decision       │
│ State Machine: LangGraph with conditional branching              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Credential Service (Rust + Wasmtime)                             │
├──────────────────────────────────────────────────────────────────┤
│ Wasm Runtime: Sandboxed credential verification modules         │
│ Fuel Metering: 1M fuel per execution                             │
│ Modules: Verify, Analyze, Schema Validate                        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ AI Inference (Python + ONNX + Ollama)                            │
├──────────────────────────────────────────────────────────────────┤
│ Models: all-MiniLM-L6-v2 (embeddings), llama3.2-vision (OCR),   │
│         mistral (LLM reasoning)                                  │
│ Federated Learning: Flower + FLARE for fraud detection           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ ZKP Engine (Rust + Risc0 + Noir)                                 │
├──────────────────────────────────────────────────────────────────┤
│ Circuits: Age verification, Country check, Document validity    │
│ Proof types: Groth16, PLONK, STARK                               │
│ Integration: risc0-rust-zkp crate                                 │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. User submits documents → API Gateway
2. Gateway authenticates & rate-limits → KYC Orchestrator
3. Orchestrator starts LangGraph workflow
   a. Document Classification → AI Inference
   b. Liveness Check → AI Inference
   c. Fraud Assessment → AI Inference + Flower/FLARE model
   d. Compliance Check → Compliance Service
   e. Decision → ZKP Engine (if needed)
4. Results stored in RDS + Iceberg (S3)
5. Events published to Kafka
6. Webhooks delivered via Webhook Relay
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Defense in Depth                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1: WAF (AWS WAF) + Rate Limiting                          │
│ Layer 2: mTLS (cert-manager + Vault)                            │
│ Layer 3: JWT Authentication + RBAC                              │
│ Layer 4: Input Validation (Zod)                                  │
│ Layer 5: TEE (Teaclave SGX/SEV for credential processing)       │
│ Layer 6: Wasm Sandboxing (Wasmtime with fuel metering)          │
│ Layer 7: Post-Quantum Crypto (ML-KEM, ML-DSA, SLH-DSA)          │
│ Layer 8: Tetragon Process Monitoring                            │
│ Layer 9: Network Policies (Cilium)                               │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Kubernetes (EKS)                                                 │
├──────────────────────────────────────────────────────────────────┤
│ Namespace: kyc-vault                                             │
├──────────────────────────────────────────────────────────────────┤
│ Services:                                                        │
│ - kyc-api-gateway        (2-10 replicas)                        │
│ - kyc-orchestrator       (3-8 replicas)                         │
│ - kyc-credential-service (3-8 replicas)                         │
│ - kyc-ai-inference       (2-6 replicas, GPU nodes)              │
│ - kyc-zkp-engine         (2-6 replicas)                         │
│ - kyc-did-resolver       (2-4 replicas)                         │
│ - kyc-webhook-relay      (2-4 replicas)                         │
│ - kyc-compliance-service (2-4 replicas)                         │
│ - kyc-billing-service    (2-4 replicas)                         │
├──────────────────────────────────────────────────────────────────┤
│ Data Layer: RDS PostgreSQL, ElastiCache Redis, MSK Kafka, S3    │
└──────────────────────────────────────────────────────────────────┘
```

## Observability Stack

```
┌──────────────────────────────────────────────────────────────────┐
│ OpenTelemetry → Grafana + Prometheus + Loki + Tempo              │
├──────────────────────────────────────────────────────────────────┤
│ Metrics: Service health, Pipeline stages, ZKP performance        │
│ Logs: Structured JSON → Loki → Alerting                          │
│ Traces: Distributed tracing with OpenTelemetry                   │
│ Dashboards: KYC Pipeline, ZKP Engine, Platform Health            │
└──────────────────────────────────────────────────────────────────┘
```
