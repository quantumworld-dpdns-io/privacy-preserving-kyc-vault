import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const issueLatency = new Trend('issue_latency');
const verifyLatency = new Trend('verify_latency');

export const options = {
  stages: [
    { duration: '1m', target: 30 },
    { duration: '3m', target: 80 },
    { duration: '2m', target: 80 },
    { duration: '1m', target: 30 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    errors: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    issue_latency: ['p(95)<1500'],
    verify_latency: ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const subjectId = `did:key:user${Math.floor(Math.random() * 100000)}`;

  const claims = {
    name: 'Load Test User',
    age: Math.floor(Math.random() * 50 + 18),
    nationality: 'US',
    email: `user${Math.floor(Math.random() * 100000)}@example.com`,
  };

  const issuePayload = JSON.stringify({
    subjectDid: subjectId,
    type: 'VerifiableCredential',
    claims: claims,
  });

  const issueResp = http.post(
    `${BASE_URL}/api/v1/credentials/issue`,
    issuePayload,
    { headers: { 'Content-Type': 'application/json' } },
  );

  const issueSuccess = check(issueResp, {
    'Credential issued successfully': (r) => r.status === 201,
    'Issued credential has id': (r) => JSON.parse(r.body).id !== undefined,
    'Issued credential has proof': (r) => JSON.parse(r.body).proof !== undefined,
  });

  errorRate.add(!issueSuccess);
  issueLatency.add(issueResp.timings.duration);

  if (issueSuccess) {
    const credential = JSON.parse(issueResp.body);

    const verifyPayload = JSON.stringify({
      credential: credential,
    });

    const verifyResp = http.post(
      `${BASE_URL}/api/v1/credentials/verify`,
      verifyPayload,
      { headers: { 'Content-Type': 'application/json' } },
    );

    const verifySuccess = check(verifyResp, {
      'Credential verified successfully': (r) => r.status === 200,
      'Verification result is true': (r) => JSON.parse(r.body).verified === true,
    });

    errorRate.add(!verifySuccess);
    verifyLatency.add(verifyResp.timings.duration);
  }

  sleep(0.5);
}
