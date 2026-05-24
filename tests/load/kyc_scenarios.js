import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const verificationLatency = new Trend('verification_latency');

export const options = {
  stages: [
    { duration: '2m', target: 10 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    errors: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  group('DID Resolution', () => {
    const resp = http.get(`${BASE_URL}/api/v1/did/resolve/did:key:z6Mkf`);
    check(resp, {
      'DID resolved successfully': (r) => r.status === 200,
    });
    errorRate.add(resp.status !== 200);
    sleep(1);
  });

  group('Credential Verification', () => {
    const payload = JSON.stringify({
      credential: { id: `urn:uuid:${Math.random()}`, type: 'AgeVerificationCredential' },
    });
    const resp = http.post(`${BASE_URL}/api/v1/credentials/verify`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    check(resp, {
      'Credential verified': (r) => r.status === 200,
    });
    verificationLatency.add(resp.timings.duration);
    errorRate.add(resp.status !== 200);
    sleep(0.5);
  });

  group('KYC Workflow', () => {
    const createResp = http.post(`${BASE_URL}/api/v1/kyc/workflows`, JSON.stringify({
      subjectDid: `did:key:user${Math.floor(Math.random() * 10000)}`,
      tier: 'tier-2-basic',
      platformId: 'load-test',
    }), { headers: { 'Content-Type': 'application/json' } });

    check(createResp, {
      'KYC workflow created': (r) => r.status === 201,
    });
    errorRate.add(createResp.status !== 201);

    if (createResp.status === 201) {
      const workflowId = createResp.json().id;
      const transitionResp = http.post(`${BASE_URL}/api/v1/kyc/workflows/${workflowId}/transition`,
        JSON.stringify({ newState: 'DocumentsSubmitted', actor: 'load-test', detail: 'Load test' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      check(transitionResp, {
        'Workflow transitioned': (r) => r.status === 200,
      });
    }

    sleep(1);
  });
}
