"""Python client example for the KYC Vault API."""

import os
import uuid
from dataclasses import dataclass, asdict
from typing import Any

import requests


BASE_URL = os.getenv("KYC_VAULT_URL", "https://api.kyc-vault.com/v1")
AUTH_TOKEN = os.getenv("KYC_VAULT_TOKEN", "your-jwt-token")


class KYCClient:
    """Minimal HTTP client for the KYC Vault REST API."""

    def __init__(self, base_url: str = BASE_URL, token: str = AUTH_TOKEN):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })

    def _request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        resp = self.session.request(method, url, **kwargs)
        resp.raise_for_status()
        return resp.json()

    def resolve_did(self, did: str) -> dict[str, Any]:
        return self._request("POST", "/did/resolve", json={"did": did})

    def issue_credential(
        self,
        issuer_did: str,
        subject_id: str,
        claims: dict[str, Any],
        schema_id: str = "https://schema.kyc-vault.com/passport-v1.json",
    ) -> dict[str, Any]:
        payload = {
            "credential": {
                "@context": ["https://www.w3.org/2018/credentials/v1"],
                "type": ["VerifiableCredential"],
                "issuer": issuer_did,
                "issuanceDate": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "credentialSubject": {"id": subject_id, **claims},
                "credentialSchema": {"id": schema_id, "type": "JsonSchemaValidator2018"},
            },
            "options": {"proofFormat": "lds", "pqc": True},
        }
        return self._request("POST", "/credentials", json=payload)

    def get_credential(self, credential_id: str) -> dict[str, Any]:
        return self._request("GET", f"/credentials/{credential_id}")

    def revoke_credential(self, credential_id: str) -> dict[str, Any]:
        return self._request("DELETE", f"/credentials/{credential_id}")

    def verify_credential(self, credential_id: str) -> dict[str, Any]:
        return self._request("POST", f"/credentials/{credential_id}/verify")

    def start_kyc_workflow(
        self,
        applicant_id: str,
        documents: list[dict[str, Any]],
        jurisdiction: str = "US",
    ) -> dict[str, Any]:
        payload = {
            "verificationId": str(uuid.uuid4()),
            "applicantId": applicant_id,
            "documents": documents,
            "options": {
                "requireLiveness": True,
                "requireFraudCheck": True,
                "complianceJurisdiction": jurisdiction,
            },
        }
        return self._request("POST", "/v1/verify", json=payload)

    def classify_document(self, image_data: str, doc_type: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/ai/classify-document",
            json={"documentId": str(uuid.uuid4()), "imageData": image_data, "documentType": doc_type},
        )

    def liveness_check(self, frames: list[str], challenge: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/ai/liveness-check",
            json={
                "sessionId": str(uuid.uuid4()),
                "frames": frames,
                "challenge": challenge,
                "response": "<encrypted>",
            },
        )

    def fraud_detection(self, verification_id: str, applicant_id: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/ai/fraud-detection",
            json={"verificationId": verification_id, "applicantId": applicant_id, "documents": []},
        )

    def get_health(self) -> dict[str, Any]:
        return self._request("GET", "/health")

    def get_usage(self) -> dict[str, Any]:
        return self._request("POST", "/billing/usage", json={"metric": "api_calls"})


def main():
    client = KYCClient()

    health = client.get_health()
    print(f"Service status: {health['status']}")

    did_doc = client.resolve_did("did:kyc:issuer:vault-001")
    print(f"Resolved DID: {did_doc['data']['id']}")

    subject_id = f"did:kyc:subject:{uuid.uuid4().hex[:12]}"
    cred = client.issue_credential(
        issuer_did="did:kyc:issuer:vault-001",
        subject_id=subject_id,
        claims={"firstName": "Alice", "lastName": "Smith", "dateOfBirth": "1990-06-15", "nationality": "US"},
    )
    cred_id = cred["data"]["credentialId"]
    print(f"Issued credential: {cred_id}")

    verify_result = client.verify_credential(cred_id)
    print(f"Credential verified: {verify_result['data']['valid']}")

    wf = client.start_kyc_workflow(
        applicant_id=subject_id,
        documents=[{"id": "doc-1", "type": "passport", "imageData": "<base64>", "metadata": {}}],
    )
    print(f"KYC workflow: {wf['data']['status']} (version {wf['data']['workflowVersion']})")

    fraud = client.fraud_detection(wf["data"]["verificationId"], subject_id)
    print(f"Fraud risk: {fraud['data']['riskLevel']} (score: {fraud['data']['riskScore']})")


from datetime import datetime

if __name__ == "__main__":
    main()
