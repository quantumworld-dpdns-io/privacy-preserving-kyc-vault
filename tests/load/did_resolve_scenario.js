import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const resolutionLatency = new Trend('resolution_latency');

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    errors: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    resolution_latency: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const DID_FIXTURES = [
  'did:key:z6MkfA',
  'did:key:z6MkfB',
  'did:key:z6MkfC',
  'did:key:z6MkfD',
  'did:key:z6MkfE',
  'did:web:example.com',
  'did:web:test.domain',
  'did:ethr:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  'did:ethr:5:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  'did:key:z6MkfF',
];

export default function () {
  const did = DID_FIXTURES[Math.floor(Math.random() * DID_FIXTURES.length)];

  const resp = http.get(`${BASE_URL}/api/v1/did/resolve/${encodeURIComponent(did)}`);

  const isSuccess = check(resp, {
    'DID resolved successfully': (r) => r.status === 200,
    'Response has id field': (r) => JSON.parse(r.body).id !== undefined,
    'Response has verificationMethod': (r) => {
      const body = JSON.parse(r.body);
      return body.verificationMethod && body.verificationMethod.length > 0;
    },
  });

  errorRate.add(!isSuccess);
  resolutionLatency.add(resp.timings.duration);

  sleep(0.1);
}
