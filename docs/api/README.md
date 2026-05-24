# API Documentation

This directory contains the API documentation for the Privacy-Preserving KYC Vault.

## Overview

The platform provides multiple APIs for different clients and services:

1. **REST API** - Traditional RESTful interfaces for service-to-service communication
2. **GraphQL API** - Flexible query interface for the aggregation service
3. **gRPC API** - High-performance internal service communication
4. **WebSocket API** - Real-time updates and notifications
5. **Admin API** - Administrative operations and monitoring
6. **Public API** - External-facing API for developers and partners

## API Gateway

All external traffic flows through the NGINX-based API gateway which provides:
- TLS termination (with PQC-ready ciphers)
- Load balancing
- Rate limiting
- Authentication and authorization
- Request/response transformation
- WAF integration

## Service APIs

Each microservice exposes a RESTful API following these conventions:

### Common Patterns
- **Base Path**: `/api/v1/{service-name}/`
- **JSON**: All requests and responses are JSON-encoded
- **HTTP Methods**: Standard CRUD operations (GET, POST, PUT, PATCH, DELETE)
- **Status Codes**: Standard HTTP status codes with detailed error responses
- **Headers**: 
  - `Authorization`: Bearer token or API key
  - `Content-Type`: application/json
  - `Accept`: application/json
  - `X-Request-ID`: Unique request identifier for tracing
  - `X-API-Version`: API version

### Error Responses
All error responses follow this format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": [
      {
        "field": "field_name",
        "message": "Specific error detail"
      }
    ],
    "timestamp": "ISO 8601 timestamp",
    "request_id": "unique_request_id"
  }
}
```

### Versioning
APIs are versioned in the URL path (e.g., `/api/v1/`) to ensure backward compatibility.
Breaking changes require a new version number.

### Rate Limiting
APIs implement rate limiting to prevent abuse:
- Default: 100 requests per minute per IP
- Configurable per endpoint and client type
- Headers indicate limits:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time until reset (Unix timestamp)

## Authentication

Multiple authentication methods are supported:

### 1. Bearer Tokens (JWT)
- Issued by authentication service
- Short-lived (15 minutes) with refresh tokens
- Contains user ID, roles, and permissions
- Verified by each service

### 2. API Keys
- Long-lived keys for service-to-service communication
- Scoped to specific permissions
- Rotatable without downtime
- Stored securely in vault

### 3. Mutual TLS (mTLS)
- Certificate-based authentication for high-security connections
- Used for service mesh and privileged operations
- Certificate validation against trusted CA

### 4. OAuth 2.0/OpenID Connect
- For third-party application access
- Supports authorization code, implicit, client credentials, and device flows
- Integrates with Google, Facebook, Apple, and enterprise IDPs

## Authorization

Role-Based Access Control (RBAC) with Attribute-Based Access Control (ABAC) extensions:

### Roles
- **Administrator**: Full system access
- **Operator**: Limited administrative functions
- **Analyst**: Read-only access to data and reports
- **Developer**: Access to development and testing environments
- **Customer**: Access to own data and limited operations

### Permissions
Permissions are granted to roles and follow the pattern: `resource:action`
Examples:
- `credential:create`
- `kyc:read`
- `did:delete`
- `audit:export`

### ABAC Policies
Additional constraints based on:
- Resource ownership
- Data sensitivity
- Time of day
- Geographic location
- Device trust level
- Recent authentication events

## API Endpoints Reference

Detailed endpoint documentation is available in the OpenAPI specifications:

- `docs/api/openapi/did-service.yaml` - DID Service API
- `docs/api/openapi/credential-service.yaml` - Credential Service API
- `docs/api/openapi/kyc-service.yaml` - KYC Service API
- `docs/api/openapi/zkp-service.yaml` - ZKP Service API
- `docs/api/openapi/billing-service.yaml` - Billing Service API
- `docs/api/openapi/webhook-service.yaml` - Webhook Service API
- `docs/api/openapi/admin-service.yaml` - Admin Service API
- `docs/api/openapi/aggregation-service.yaml` - Aggregation Service API
- `docs/api/openapi/gateway.yaml` - API Gateway Admin API

## SDKs

Client SDKs are available for popular languages:

- **TypeScript/JavaScript**: `@privacy-preserving-kyc-vault/sdk-js`
- **Python**: `privacy-preserving-kyc-vault-sdk`
- **Go**: `github.com/privacy-preserving-kyc-vault/sdk-go`
- **Java**: `com.privacypreservingkycvault:sdk-java`
- **C#**: `PrivacyPreservingKycVault.Sdk`
- **Rust**: `privacy-preserving-kyc-vault-sdk`
- **Swift**: `PrivacyPreservingKycVaultSDK`
- **Kotlin**: `com.privacypreservingkycvault:sdk-android`

## Real-time APIs

### WebSocket
- **Endpoint**: `wss://api.kycvault.example.com/ws`
- **Authentication**: JWT token in connection header
- **Message Format**: JSON
- **Subscriptions**: Clients can subscribe to event types
- **Events**: 
  - `credential.issued`
  - `kyc.verified`
  - `did.updated`
  - `payment.processed`
  - `security.alert`

### Server-Sent Events (SSE)
- **Endpoint**: `/api/v1/events`
- **Authentication**: Bearer token
- **Format**: Standard SSE with JSON data
- **Use Cases**: Dashboard updates, notifications

## GraphQL API

The Aggregation Service provides a GraphQL endpoint for flexible data querying:

- **Endpoint**: `/graphql`
- **Interface**: GraphQL over HTTP POST
- **Features**:
  - Introspection enabled in development
  - Query complexity limits
  - Depth limiting
  - Automatic batching and caching
  - Federation support for micro-graphs

### Schema
The schema is defined in `services/aggregation-service/src/schema.graphql` and includes:
- Queries for all integrated services
- Mutations for state-changing operations
- Subscriptions for real-time updates
- Custom scalars for dates, URLs, and encrypted data

## gRPC Services

High-performance internal communication uses Protocol Buffers:

- **Service Definition**: `proto/kycvault.proto`
- **Services**:
  - `DIDService`
  - `CredentialService`
  - `KYCService`
  - `ZKPService`
  - `BillingService`
  - `WebhookService`
  - `AdminService`
- **Features**:
  - HTTP/2 transport
  - TLS encryption
  - Authentication via metadata
  - Load balancing and failover
  - Interoperability with multiple languages

## Webhooks

Services can register for event notifications via webhooks:

- **Endpoint**: Customer-provided HTTPS URL
- **Authentication**: HMAC-SHA256 signature
- **Retry Policy**: Exponential backoff with maximum attempts
- **Event Types**: 
  - `credential.*`
  - `kyc.*`
  - `did.*`
  - `zkp.*`
  - `billing.*`
  - `webhook.*`
  - `admin.*`
- **Payload**: JSON with standardized structure
- **Idempotency**: Events include unique identifiers for deduplication

## Monitoring and Observability

APIs emit metrics, logs, and traces for observability:

### Metrics (Prometheus)
- `http_requests_total`: Counter of HTTP requests
- `http_request_duration_seconds`: Histogram of request durations
- `http_request_size_bytes`: Histogram of request sizes
- `http_response_size_bytes`: Histogram of response sizes
- `api_errors_total`: Counter of errors by type
- `rate_limit_hits_total`: Counter of rate limit violations
- `authentication_attempts_total`: Counter of auth attempts
- `authorization_denials_total`: Counter of authz denials

### Logging
Structured JSON logs with:
- Timestamp
- Service name
- Request ID
- User ID (if authenticated)
- Operation
- Outcome
- Duration
- Error details (if applicable)

### Tracing (OpenTelemetry)
- Trace context propagation
- Span attributes for key values
- Links to related traces
- Events for significant points in processing

## Security Considerations

### Input Validation
All APIs validate input against strict schemas:
- JSON Schema for REST APIs
- GraphQL schema for GraphQL API
- Protocol Buffers for gRPC
- Validation includes:
  - Type checking
  - Range validation
  - Pattern matching (regex)
  - Length limits
  - Enum validation
  - Custom validation functions

### Output Encoding
- JSON responses properly encoded
- Error messages sanitized to prevent information leakage
- Headers set to prevent XSS (Content-Type, X-Content-Type-Options)
- CSP headers where applicable

### Protection Against Common Attacks
- **SQL Injection**: Parameterized queries, ORM usage
- **NoSQL Injection**: Input validation, driver-level protection
- **Command Injection**: Avoid shell commands, use allowed APIs
- **Path Traversal**: Input validation, use of secure file APIs
- **XXE**: XML parsers configured to disable external entities
- **Deserialization**: Strict type checking, allowlists
- **Redirects**: Validate redirect URLs, allowlist of domains
- **File Uploads**: Type validation, virus scanning, sandboxed processing
- **DoS**: Rate limiting, request size limits, timeout handling
- **Brute Force**: Account lockout, CAPTCHA after failures
- **Session Management**: Secure cookies, HTTPS-only, SameSite attributes
- **CSRF**: Stateless APIs (token-based), double-submit cookie for forms

## Data Privacy and Protection

### Data Minimization
APIs only return data necessary for the requested operation:
- Field-level masking for sensitive data
- Optional inclusion of sensitive data via expand parameters
- Aggregation services return summaries by default

### Encryption in Transit
- TLS 1.2+ with strong cipher suites
- Perfect forward secrecy
- HSTS preloading
- Certificate transparency

### Encryption at Rest
- Sensitive fields encrypted with per-record keys
- Key management via HashiCorp Vault or cloud KMS
- Automatic key rotation
- Audit logging of key access

### Consent and Purpose Limitation
- APIs respect user consent for data usage
- Purpose limitation enforced via policy engine
- Audit trail of data access for compliance

### Anonymization and Pseudonymization
- Options for data anonymization in analytics endpoints
- Pseudonymous identifiers where full identification not needed
- Differential privacy techniques for statistical queries

## Internationalization and Localization

### Language Support
APIs support multiple languages via:
- `Accept-Language` header
- Language parameter in requests
- Default to English
- Supported languages: en, es, fr, de, ja, zh

### Localization
- Dates, times, numbers formatted per locale
- Currency amounts localized
- Address formats localized
- Phone number formatting per locale

## Deprecation Policy

### Version Deprecation
- API versions supported for minimum 12 months after deprecation
- Deprecation notices in API responses
- Migration guides provided
- Sunset dates announced 6 months in advance

### Feature Deprecation
- Deprecated features marked in documentation
- Deprecation warnings in API responses (where applicable)
- Migration path provided
- Removal after minimum 6 months

## Compliance and Auditing

### Regulatory Compliance
APIs designed to support:
- GDPR Article 32 (security of processing)
- HIPAA § 164.308 (technical safeguards)
- PCI DSS Requirement 12 (audit trails)
- SOC 2 CC6.1 (logical access)
- ISO 27001 A.12.4 (logging and monitoring)

### Audit Logging
All APIs write to immutable audit log:
- Who performed the action
- What was acted upon
- When it occurred
- Where it originated (IP address)
- How it was authenticated
- Why it was authorized (permissions used)
- What changed (before/after for updates)
- Outcome (success/failure)

### Data Subject Rights
APIs support:
- Right to access (export personal data)
- Right to rectification (correct inaccurate data)
- Right to erasure (delete personal data)
- Right to restrict processing
- Right to data portability
- Right to object

## Change Management

### Backward Compatibility
- Adding new endpoints: Backward compatible
- Adding new optional parameters: Backward compatible
- Adding new fields to responses: Backward compatible (clients should ignore unknown fields)
- Changing response format: Requires new version
- Changing error codes: Requires new version
- Removing endpoints/features: Requires deprecation period

### Testing
API changes require:
- Unit tests for new/modified endpoints
- Integration tests for API behavior
- Contract tests to ensure compatibility
- Performance tests to ensure no regression
- Security tests to ensure no new vulnerabilities

### Deployment
- Blue/green deployment strategy
- Feature flags for gradual rollout
- Rollback procedures
- Health checks during deployment
- Canary releases for risk mitigation

## Support and Contact

For API support and questions:
- **Documentation**: This directory and OpenAPI specs
- **Community Forum**: https://forum.privacypreservingkycvault.com
- **Technical Support**: support@privacypreservingkycvault.com
- **Security Issues**: security@privacypreservingkycvault.com (encrypted)
- **Issues and Bugs**: https://github.com/privacypreservingkycvault/privacy-preserving-kyc-vault/issues
- **Feature Requests**: https://github.com/privacypreservingkycvault/privacy-preserving-kyc-vault/issues

## Appendix

### HTTP Status Codes
- 200: OK
- 201: Created
- 202: Accepted
- 204: No Content
- 304: Not Modified
- 400: Bad Request
- 401: Unauthorized
- 402: Payment Required (for premium features)
- 403: Forbidden
- 404: Not Found
- 405: Method Not Allowed
- 406: Not Acceptable
- 408: Request Timeout
- 409: Conflict
- 410: Gone
- 411: Length Required
- 412: Precondition Failed
- 413: Payload Too Large
- 414: URI Too Long
- 415: Unsupported Media Type
- 416: Range Not Satisfiable
- 417: Expectation Failed
- 422: Unprocessable Entity
- 423: Locked
- 424: Failed Dependency
- 429: Too Many Requests
- 451: Unavailable For Legal Reasons
- 500: Internal Server Error
- 501: Not Implemented
- 502: Bad Gateway
- 503: Service Unavailable
- 504: Gateway Timeout
- 507: Insufficient Storage
- 508: Loop Detected
- 510: Not Extended
- 511: Network Authentication Required

### Common Headers
- `Request-ID`: Unique identifier for tracing
- `API-Version`: Version of the API handling the request
- `Timestamp`: Server timestamp of response
- `Server`: Server identification (hidden in production)
- `Via`: Proxy information (if applicable)
- `Forwarded`: Client information (if behind proxy)

### Query Parameters
Common query parameters across APIs:
- `limit`: Maximum number of results to return
- `offset`: Number of results to skip (for pagination)
- `page`: Page number (alternative to offset/limit)
- `sort`: Field to sort by (prefix with `-` for descending)
- `fields`: Comma-separated list of fields to include
- `exclude`: Comma-separated list of fields to exclude
- `expand`: Comma-separated list of related resources to expand
- `filter`: JSON-encoded filter criteria
- `search`: Free-text search term
- `lang`: Language for localization (ISO 639-1 code)
- `tz`: Timezone for date formatting (IANA timezone database)
