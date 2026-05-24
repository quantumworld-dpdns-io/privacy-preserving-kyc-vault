import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const workflowLatency = new Trend('workflow_latency');
const transitionLatency = new Trend('transition_latency');

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    errors: ['rate<0.02'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TIERS = ['tier-1-email', 'tier-2-basic', 'tier-3-advanced'];

const VALID_TRANSITIONS = {
  Initiated: 'DocumentsSubmitted',
  DocumentsSubmitted: 'UnderReview',
  UnderReview: 'Approved',
};

export default function () {
  const subjectDid = `did:key:kycuser${Math.floor(Math.random() * 100000)}`;
  const tier = TIERS[Math.floor(Math.random() * TIERS.length)];

  const createPayload = JSON.stringify({
    subjectDid: subjectDid,
    tier: tier,
    platformId: 'load-test-platform',
  });

  const createResp = http.post(
    `${BASE_URL}/api/v1/kyc/workflows`,
    createPayload,
    { headers: { 'Content-Type': 'application/json' } },
  );

  const createSuccess = check(createResp, {
    'KYC workflow created': (r) => r.status === 201,
    'Workflow has id': (r) => JSON.parse(r.body).id !== undefined,
    'Workflow is Initiated': (r) => JSON.parse(r.body).state === 'Initiated',
  });

  errorRate.add(!createSuccess);
  workflowLatency.add(createResp.timings.duration);

  if (createSuccess) {
    const workflow = JSON.parse(createResp.body);
    const workflowId = workflow.id;
    let currentState = 'Initiated';

    const transitionOrder = ['DocumentsSubmitted', 'UnderReview', 'Approved'];

    for (let i = 0; i < transitionOrder.length; i++) {
      const nextState = transitionOrder[i];

      const transitionPayload = JSON.stringify({
        newState: nextState,
        actor: 'system',
        detail: `Load test transition: ${currentState} -> ${nextState}`,
      });

      const transitionResp = http.post(
        `${BASE_URL}/api/v1/kyc/workflows/${workflowId}/transition`,
        transitionPayload,
        { headers: { 'Content-Type': 'application/json' } },
      );

      const transitionSuccess = check(transitionResp, {
        [`Transition to ${nextState} succeeded`]: (r) => r.status === 200,
        [`State is ${nextState}`]: (r) => JSON.parse(r.body).state === nextState,
      });

      errorRate.add(!transitionSuccess);
      transitionLatency.add(transitionResp.timings.duration);

      if (transitionSuccess) {
        currentState = nextState;
      } else {
        break;
      }
    }

    const finalResp = http.get(
      `${BASE_URL}/api/v1/kyc/workflows/${workflowId}`,
    );

    check(finalResp, {
      'Final workflow state retrievable': (r) => r.status === 200,
      [`Final state is ${currentState}`]: (r) => JSON.parse(r.body).state === currentState,
    });
  }

  sleep(1);
}
