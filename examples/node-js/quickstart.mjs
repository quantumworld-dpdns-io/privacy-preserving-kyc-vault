import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.KYC_VAULT_URL || 'https://api.kyc-vault.com/v1';
const AUTH_TOKEN = process.env.KYC_VAULT_TOKEN || 'your-jwt-token';

async function kycFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`HTTP ${res.status}: ${err.error || res.statusText}`);
  }
  return res.json();
}

async function resolveDID(did) {
  return kycFetch('/did/resolve', {
    method: 'POST',
    body: JSON.stringify({ did }),
  });
}

async function issueCredential(issuerDid, subjectId, claims) {
  return kycFetch('/credentials', {
    method: 'POST',
    body: JSON.stringify({
      credential: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential'],
        issuer: issuerDid,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: subjectId,
          ...claims,
        },
      },
      options: {
        proofFormat: 'lds',
        pqc: true,
      },
    }),
  });
}

async function verifyCredential(credentialId) {
  return kycFetch(`/credentials/${credentialId}/verify`, {
    method: 'POST',
  });
}

async function startKYCWorkflow(applicantId, documents) {
  return kycFetch('/v1/verify', {
    method: 'POST',
    body: JSON.stringify({
      verificationId: randomUUID(),
      applicantId,
      documents,
      options: {
        requireLiveness: true,
        requireFraudCheck: true,
        complianceJurisdiction: 'US',
      },
    }),
  });
}

async function getFraudScore(verificationId, applicantId) {
  return kycFetch('/ai/fraud-detection', {
    method: 'POST',
    body: JSON.stringify({
      verificationId,
      applicantId,
      documents: [],
    }),
  });
}

async function main() {
  const issuer = 'did:kyc:issuer:abc123';
  const subject = `did:kyc:subject:${randomUUID().slice(0, 8)}`;

  const didDoc = await resolveDID(issuer);
  console.log('Resolved DID:', didDoc.data?.id || didDoc.id);

  const credential = await issueCredential(issuer, subject, {
    type: 'passport',
    nationality: 'US',
    age: 25,
  });
  console.log('Issued credential:', credential.data?.credentialId);

  const verification = await verifyCredential(credential.data.credentialId);
  console.log('Credential valid:', verification.data?.valid);

  const kyc = await startKYCWorkflow(subject, [
    { id: 'doc-1', type: 'passport', imageData: '<base64>', metadata: {} },
  ]);
  console.log('KYC workflow:', kyc.data?.status, kyc.data?.verificationId);

  const fraud = await getFraudScore(kyc.data.verificationId, subject);
  console.log('Fraud risk:', fraud.data?.riskLevel, fraud.data?.riskScore);
}

main().catch(console.error);
