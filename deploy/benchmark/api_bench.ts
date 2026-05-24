/**
 * KYC Vault API benchmark using autocannon.
 *
 * Usage:
 *   npm install -g autocannon tsx
 *   tsx deploy/benchmark/api_bench.ts
 *
 * Environment variables:
 *   BASE_URL     - API base URL (default: http://localhost:8080)
 *   DURATION     - Test duration in seconds (default: 30)
 *   CONNECTIONS  - Concurrent connections (default: 50)
 *   PIPELINING   - Requests per connection (default: 10)
 *   API_KEY      - JWT/api-key for authenticated endpoints
 */

import autocannon from "autocannon";
import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const DURATION = parseInt(process.env.DURATION || "30", 10);
const CONNECTIONS = parseInt(process.env.CONNECTIONS || "50", 10);
const PIPELINING = parseInt(process.env.PIPELINING || "10", 10);
const API_KEY = process.env.API_KEY || "test-bench-api-key";

interface BenchEndpoint {
  title: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

const ENDPOINTS: BenchEndpoint[] = [
  // ── Credential Operations ──────────────────────────────
  {
    title: "POST /v1/credentials - Issue credential",
    method: "POST",
    path: "/v1/credentials",
    headers: { "x-api-key": API_KEY },
    body: {
      credentialType: "kyc_passport",
      issuerDid: "did:kyc:issuer:alice",
      applicantDid: "did:kyc:applicant:bob",
      jurisdiction: "US",
      attributes: { nationality: "US", dob: "1990-01-01" },
    },
  },
  {
    title: "GET /v1/credentials/:id - Get credential",
    method: "GET",
    path: "/v1/credentials/bench-cred-001",
    headers: { "x-api-key": API_KEY },
  },
  {
    title: "PUT /v1/credentials/:id/revoke - Revoke credential",
    method: "PUT",
    path: "/v1/credentials/bench-cred-001/revoke",
    headers: { "x-api-key": API_KEY },
    body: { reason: "benchmark revocation" },
  },

  // ── ZKP Operations ─────────────────────────────────────
  {
    title: "POST /v1/zkp/prove - Generate ZKP proof",
    method: "POST",
    path: "/v1/zkp/prove",
    headers: { "x-api-key": API_KEY },
    body: {
      circuitId: "age_gte_18",
      publicInputs: { issuerDid: "did:kyc:issuer:alice" },
      privateInputs: { dob: "1990-01-01", signature: "0xdeadbeef" },
    },
  },
  {
    title: "POST /v1/zkp/verify - Verify ZKP proof",
    method: "POST",
    path: "/v1/zkp/verify",
    headers: { "x-api-key": API_KEY },
    body: {
      proof: "0xabcd1234",
      publicInputs: { issuerDid: "did:kyc:issuer:alice" },
      circuitId: "age_gte_18",
    },
  },

  // ── DID Resolution ─────────────────────────────────────
  {
    title: "GET /v1/did/resolve/:did - Resolve DID document",
    method: "GET",
    path: "/v1/did/resolve/did:kyc:issuer:alice",
    headers: { "x-api-key": API_KEY },
  },
  {
    title: "POST /v1/did/create - Create DID",
    method: "POST",
    path: "/v1/did/create",
    headers: { "x-api-key": API_KEY },
    body: { method: "kyc", publicKeyType: "Ed25519VerificationKey2020" },
  },

  // ── Compliance / Sanctions Screening ───────────────────
  {
    title: "POST /v1/compliance/screen - Screen applicant",
    method: "POST",
    path: "/v1/compliance/screen",
    headers: { "x-api-key": API_KEY },
    body: {
      applicantDid: "did:kyc:applicant:bob",
      jurisdiction: "US",
      riskLevel: "standard",
    },
  },

  // ── Health & Metrics ───────────────────────────────────
  {
    title: "GET /healthz - Liveness check",
    method: "GET",
    path: "/healthz",
  },
  {
    title: "GET /metrics - Prometheus metrics",
    method: "GET",
    path: "/metrics",
  },
];

async function runBenchmark(endpoint: BenchEndpoint): Promise<void> {
  const url = new URL(endpoint.path, BASE_URL);
  const instance = autocannon({
    url: url.toString(),
    connections: CONNECTIONS,
    pipelining: PIPELINING,
    duration: DURATION,
    method: endpoint.method,
    headers: {
      "content-type": "application/json",
      ...endpoint.headers,
    },
    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    title: endpoint.title,
  });

  autocannon.track(instance, { renderProgressBar: true });

  return new Promise((resolvePromise, reject) => {
    instance.on("done", (result) => {
      console.log(`\n=== ${endpoint.title} ===`);
      console.log(`  Latency (avg):    ${result.latency.average} ms`);
      console.log(`  Latency (p99):    ${result.latency.p99} ms`);
      console.log(`  Requests/sec:     ${result.requests.average}`);
      console.log(`  Throughput:       ${result.throughput.average} bytes/sec`);
      console.log(`  Errors:           ${result.errors}`);
      console.log(`  Timeouts:         ${result.timeouts}`);
      console.log(`  Non-2xx:          ${result.non2xx}`);
      resolvePromise();
    });
    instance.on("error", reject);
  });
}

async function main() {
  console.log(`KYC Vault API Benchmark`);
  console.log(`  Base URL:     ${BASE_URL}`);
  console.log(`  Duration:     ${DURATION}s`);
  console.log(`  Connections:  ${CONNECTIONS}`);
  console.log(`  Pipelining:   ${PIPELINING}\n`);

  const results: autocannon.Result[] = [];

  for (const endpoint of ENDPOINTS) {
    console.log(`\n--- Benchmarking: ${endpoint.title} ---`);
    try {
      await runBenchmark(endpoint);
    } catch (err) {
      console.error(`  Error benchmarking ${endpoint.title}:`, err);
    }
  }

  const summaryPath = resolve(
    __dirname,
    `../../reports/api-bench-${Date.now()}.json`,
  );
  writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\nBenchmark summary written to ${summaryPath}`);
}

main().catch(console.error);
