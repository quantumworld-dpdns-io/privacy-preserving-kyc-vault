# KYC Vault API Reference

## Base URL

```
Production: https://api.kyc-vault.com/v1
Staging:    https://api.staging.kyc-vault.com/v1
```

## Authentication

All API requests require a Bearer JWT token in the Authorization header:

```http
Authorization: Bearer <jwt_token>
```

## Endpoints

### Health

#### GET /health

Returns service health status.

**Response:**
```json
{
  "status": "ok",
  "models": ["all-MiniLM-L6-v2", "llama3.2-vision", "mistral"],
  "ollamaHost": "http://localhost:11434"
}
```

### Credentials

#### POST /credentials

Create a new credential.

**Request:**
```json
{
  "credential": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential"],
    "issuer": "did:kyc:issuer:abc123",
    "issuanceDate": "2026-01-15T00:00:00Z",
    "credentialSubject": {
      "id": "did:kyc:subject:def456",
      "type": "passport",
      "attributes": {}
    }
  },
  "options": {
    "proofFormat": "lds",
    "pqc": true
  }
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "credentialId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "issued"
  }
}
```

#### GET /credentials/:id

Retrieve a credential by ID.

#### DELETE /credentials/:id

Revoke a credential.

### Verifications

#### POST /v1/verify

Start a KYC verification workflow.

**Request:**
```json
{
  "verificationId": "550e8400-e29b-41d4-a716-446655440001",
  "applicantId": "did:kyc:applicant:789",
  "documents": [
    {
      "id": "doc-1",
      "type": "passport",
      "imageData": "<base64>",
      "metadata": {}
    }
  ],
  "options": {
    "requireLiveness": true,
    "requireFraudCheck": true,
    "complianceJurisdiction": "US"
  }
}
```

**Response:** `202 Accepted`
```json
{
  "success": true,
  "data": {
    "verificationId": "550e8400-e29b-41d4-a716-446655440001",
    "status": "in_progress",
    "workflowVersion": "2.1.0"
  }
}
```

### AI Inference

#### POST /ai/classify-document

Classify an identity document.

**Request:**
```json
{
  "documentId": "550e8400-e29b-41d4-a716-446655440002",
  "imageData": "<base64>",
  "documentType": "passport"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "550e8400-e29b-41d4-a716-446655440002",
    "predictedType": "passport",
    "confidence": 0.94,
    "attributes": { "country": "US", "issuer": "US Department of State" },
    "tamperScore": 0.02,
    "processingTimeMs": 342
  }
}
```

#### POST /ai/liveness-check

Verify liveness from video frames.

**Request:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440003",
  "frames": ["<base64_frame_1>", "<base64_frame_2>"],
  "challenge": "shake_head",
  "response": "<encrypted_response>"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440003",
    "live": true,
    "confidence": 0.97,
    "spoofScore": 0.03,
    "faceMatch": true
  }
}
```

#### POST /ai/fraud-detection

Assess fraud risk.

**Request:**
```json
{
  "verificationId": "550e8400-e29b-41d4-a716-446655440004",
  "applicantId": "did:kyc:applicant:789",
  "documents": [{"id": "doc-1", "type": "passport", "metadata": {}}]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "verificationId": "550e8400-e29b-41d4-a716-446655440004",
    "riskScore": 0.08,
    "riskLevel": "low",
    "indicators": [],
    "recommendation": "proceed"
  }
}
```

### Commerce

#### POST /commerce/checkout

Create a checkout session.

#### POST /commerce/order/:id

Confirm or manage an order.

#### POST /commerce/estimate

Get price estimate.

### Billing

#### POST /billing/usage

Record usage metering data.

#### POST /billing/invoices

Generate invoice.

#### POST /billing/credits

Apply credits.

## Rate Limiting

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| AI Inference | 30 req/min | 60s |
| General API | 100 req/s | sliding |
| Internal | 1000 req/s | sliding |

Response headers:
```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1700000000
```

## Errors

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "code": "invalid_uuid",
      "message": "documentId must be a valid UUID",
      "path": ["documentId"]
    }
  ]
}
```

HTTP status codes:
- `200` - Success
- `201` - Created
- `202` - Accepted (async)
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `413` - Payload Too Large
- `429` - Too Many Requests
- `500` - Internal Server Error
