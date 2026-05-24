// k6 load test for the KYC Vault API
//
// Tests throughput, latency, and error rates for credential issuance,
// verification, KYC workflow, and fraud detection endpoints.
//
// Usage:
//   k6 run load-test.js
//
// Options (via environment variables):
//   K6_VUS=50        - number of virtual users (default: 20)
//   K6_DURATION=60s  - test duration (default: 30s)
//   KYC_VAULT_URL    - target URL (default: https://api.staging.kyc-vault.com/v1)
//   KYC_VAULT_TOKEN  - auth token (default: test-token)

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.KYC_VAULT_URL || 'https://api.staging.kyc-vault.com/v1';
const TOKEN = __ENV.KYC_VAULT_TOKEN || 'test-token';

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// Custom metrics
const credentialIssueTime = new Trend('credential_issue_time_ms');
const credentialVerifyTime = new Trend('credential_verify_time_ms');
const kycWorkflowTime = new Trend('kyc_workflow_time_ms');
const fraudDetectionTime = new Trend('fraud_detection_time_ms');
const errorRate = new Rate('error_rate');
const credentialsIssued = new Counter('credentials_issued');
const proofsGenerated = new Counter('proofs_generated');

export const options = {
  stages: [
    { duration: '10s', target: 10 },   // ramp-up
    { duration: '30s', target: __ENV.K6_VUS ? parseInt(__ENV.K6_VUS) : 20 },  // steady
    { duration: '10s', target: 0 },    // ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    error_rate: ['rate<0.10'],          // error rate < 10%
    credential_issue_time_ms: ['p(95)<3000'],
    credential_verify_time_ms: ['p(95)<1500'],
  },
};

export default function () {
  const sessionId = randomString(12, 'abcdef0123456789');
  const subjectId = `did:kyc:subject:load-${sessionId}`;
  const issuerId = 'did:kyc:issuer:load-test-vault';

  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`, { headers: HEADERS });
    check(res, {
      'health status is ok': (r) => r.json('status') === 'ok',
    });
    sleep(1);
  });

  group('Credential Lifecycle', () => {
    // Issue
    const issueBody = JSON.stringify({
      credential: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'KYCIdentityCredential'],
        issuer: issuerId,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: subjectId,
          age: randomIntBetween(18, 65),
          nationality: 'US',
          kycTier: 'tier-2',
        },
      },
      options: { proofFormat: 'lds', pqc: true },
    });

    let issueRes = http.post(`${BASE_URL}/credentials`, issueBody, {
      headers: HEADERS,
      tags: { name: 'issueCredential' },
    });
    credentialIssueTime.add(issueRes.timings.duration);
    credentialsIssued.add(1);

    check(issueRes, {
      'credential issued successfully': (r) => r.status === 201,
      'credential has ID': (r) => r.json('data.credentialId') !== undefined,
    });

    if (issueRes.status !== 201) {
      errorRate.add(1);
      sleep(1);
      return;
    }

    const credId = issueRes.json('data.credentialId');

    // Verify
    sleep(randomIntBetween(0.5, 2));

    let verifyRes = http.post(`${BASE_URL}/credentials/${credId}/verify`, '{}', {
      headers: HEADERS,
      tags: { name: 'verifyCredential' },
    });
    credentialVerifyTime.add(verifyRes.timings.duration);

    check(verifyRes, {
      'verification succeeded': (r) => r.status === 200,
      'credential is valid': (r) => r.json('data.valid') === true,
    });

    if (verifyRes.status !== 200) {
      errorRate.add(1);
    }
  });

  sleep(randomIntBetween(1, 3));

  group('KYC Workflow', () => {
    // Start workflow
    const workflowBody = JSON.stringify({
      verificationId: `wf-${sessionId}`,
      applicantId: subjectId,
      documents: [
        {
          id: `doc-${sessionId}`,
          type: 'passport',
          imageData: '<base64_simulated>',
          metadata: { country: 'US' },
        },
      ],
      options: {
        requireLiveness: true,
        requireFraudCheck: true,
        complianceJurisdiction: 'US',
      },
    });

    let wfRes = http.post(`${BASE_URL}/v1/verify`, workflowBody, {
      headers: HEADERS,
      tags: { name: 'startKYCWorkflow' },
    });
    kycWorkflowTime.add(wfRes.timings.duration);

    check(wfRes, {
      'workflow started': (r) => r.status === 202,
      'workflow has ID': (r) => r.json('data.verificationId') !== undefined,
    });

    if (wfRes.status !== 202) {
      errorRate.add(1);
      sleep(1);
      return;
    }

    const wfId = wfRes.json('data.verificationId');

    // Fraud detection
    sleep(randomIntBetween(0.5, 1.5));

    const fraudBody = JSON.stringify({
      verificationId: wfId,
      applicantId: subjectId,
      documents: [],
    });

    let fraudRes = http.post(`${BASE_URL}/ai/fraud-detection`, fraudBody, {
      headers: HEADERS,
      tags: { name: 'fraudDetection' },
    });
    fraudDetectionTime.add(fraudRes.timings.duration);

    check(fraudRes, {
      'fraud check completed': (r) => r.status === 200,
      'risk score is valid': (r) => r.json('data.riskScore') !== undefined,
    });

    if (fraudRes.status !== 200) {
      errorRate.add(1);
    }
  });

  group('AI Inference', () => {
    // Document classification
    let classRes = http.post(`${BASE_URL}/ai/classify-document`, JSON.stringify({
      documentId: `doc-${sessionId}`,
      imageData: '<base64_simulated>',
      documentType: 'passport',
    }), { headers: HEADERS });

    check(classRes, {
      'document classified': (r) => r.status === 200,
      'predicted type exists': (r) => r.json('data.predictedType') !== undefined,
    });
  });

  group('Billing & Commerce', () => {
    // Usage recording
    let usageRes = http.post(`${BASE_URL}/billing/usage`, JSON.stringify({
      metric: 'api_calls',
      value: 1,
      tags: { test: 'load-test', session: sessionId },
    }), { headers: HEADERS });

    check(usageRes, {
      'usage recorded': (r) => r.status === 200,
    });
  });

  sleep(randomIntBetween(1, 3));
}

export function teardown() {
  console.log(`Load test completed.
    Credentials issued: ${credentialsIssued.value}
    Error rate: ${(errorRate.value * 100).toFixed(1)}%
  `);
}
