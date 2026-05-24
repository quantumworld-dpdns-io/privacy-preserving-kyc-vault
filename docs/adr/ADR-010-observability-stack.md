# ADR-010: Observability Stack — OpenTelemetry + LangSmith + W&B

**Status:** Accepted  
**Date:** 2026-05-24

## Context
The vault spans traditional services (API, database) and AI components (LLM inference, RAG, agents). Need unified observability across both domains.

## Decision
Three-layer observability stack:
1. **OpenTelemetry** — Infrastructure-level traces, metrics, logs (OTLP collector → Jaeger + Prometheus + Loki)
2. **LangSmith** — LLM call tracing, prompt debugging, AI agent evaluation
3. **Weights & Biases Weave** — Prompt iteration tracking, AI experiment management, dataset versioning

Integration pattern: OTel auto-instrumentation for all services → export AI-specific spans to LangSmith → W&B for experiment-level tracking.

## Consequences
+ Single instrumentation spans traditional and AI observability
+ LangSmith provides AI-specific debugging (token usage, latency per LLM call)
+ W&B enables A/B testing of prompts and models
- Three platforms = three dashboards to maintain
- OTel span sampling needed to control costs at scale

## References
- OpenTelemetry GenAI semantic conventions
- LangSmith documentation
- W&B Weave documentation
