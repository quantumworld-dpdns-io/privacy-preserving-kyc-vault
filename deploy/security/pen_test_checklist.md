# KYC Vault — Penetration Testing Checklist

## 1. Information Gathering

- [ ] Identify all exposed endpoints (API, DID resolver, ZKP service, compliance)
- [ ] Enumerate DNS records for `*.kyc-vault.io`, `*.kyc-vault.internal`
- [ ] Discover subdomains and virtual hosts
- [ ] Fingerprint technologies (Rust/Actix, TypeScript/Fastify, Go, PostgreSQL, Redis, Kafka)
- [ ] Review OpenAPI/Swagger specs (`/api/v1/openapi.json`)
- [ ] Map all DID methods (`did:kyc:*`, `did:key:*`, `did:web:*`)

## 2. Authentication & Authorization

- [ ] Test API key authentication bypass (missing header, empty key, SQLi in key)
- [ ] Verify JWT signature validation (alg=none, alg=HS256 with public key)
- [ ] Check for privilege escalation via DID manipulation
- [ ] Test horizontal access control (User A accessing User B's credentials)
- [ ] Verify ZKP proof re-use across different contexts
- [ ] Check DID document update authorization
- [ ] Test session fixation and token replay

## 3. Credential Operations

- [ ] Test credential issuance without proper authorization
- [ ] Verify credential revocation effectiveness
- [ ] Check for unsigned credential acceptance
- [ ] Test credential attribute tampering
- [ ] Verify expiration enforcement
- [ ] Check for bulk credential enumeration
- [ ] Test credential status oracle (revocation privacy)

## 4. DID Operations

- [ ] Test DID creation without authentication
- [ ] Verify DID document integrity checks
- [ ] Check for DID method confusion attacks
- [ ] Test DID resolution redirection/SSRF
- [ ] Verify key delegation and rotation controls
- [ ] Check for DID parameter injection
- [ ] Test DIDComm endpoint validation

## 5. ZKP / Cryptographic Operations

- [ ] Verify Groth16/PLONK proof verification correctness
- [ ] Test with malformed proofs
- [ ] Check for proof malleability
- [ ] Verify Fiat-Shamir transform soundness
- [ ] Test circuit public input manipulation
- [ ] Check for timing side-channels in verification
- [ ] Verify toxic waste disposal (trusted setup)

## 6. API Security

- [ ] Rate limiting effectiveness (credential issuance, ZKP generation)
- [ ] Input validation (JSON schema enforcement)
- [ ] SSRF in URL-based credential fetching
- [ ] Path traversal in DID resolution
- [ ] Mass assignment in credential attributes
- [ ] HTTP method override attacks
- [ ] Content-type confusion (JSON vs XML)
- [ ] Large payload DoS (ZKP proofs, DID documents)

## 7. Infrastructure Security

- [ ] Kubernetes RBAC review
- [ ] Network policy effectiveness (zero-trust)
- [ ] Secret store access controls (Vault, External Secrets)
- [ ] Pod security contexts (non-root, read-only root fs)
- [ ] Container image vulnerability scan
- [ ] TLS configuration (versions, ciphers, certificate chain)
- [ ] mTLS enforcement between services
- [ ] etcd encryption and access control

## 8. Data Security

- [ ] Verify encryption at rest (AES-256-GCM for credentials)
- [ ] Check encryption key management
- [ ] Audit log immutability
- [ ] PII data minimization in ZKP circuits
- [ ] Database connection string exposure
- [ ] Backup encryption
- [ ] Data retention policy enforcement
- [ ] Token/digest computation for rekor entries

## 9. Compliance & Privacy

- [ ] GDPR right to erasure effectiveness
- [ ] Data residency enforcement
- [ ] Consent record integrity
- [ ] Jurisdiction-based access controls
- [ ] Sanctions screening bypass attempts
- [ ] Audit trail completeness
- [ ] Privacy-preserving credential verification (zero-disclosure)

## 10. Network Security

- [ ] Open ports on public endpoints
- [ ] Internal service exposure
- [ ] DNS zone transfer
- [ ] K8s API server exposure
- [ ] etcd unauthenticated access
- [ ] Redis unprotected access
- [ ] Kafka unprotected access
- [ ] MinIO bucket enumeration

## 11. Supply Chain Security

- [ ] Container image signature verification (Notary/Notation)
- [ ] Dependency vulnerability scan (Cargo, npm, Go modules)
- [ ] SBOM generation and verification
- [ ] Build provenance (SLSA level)
- [ ] Sigstore/Rekor transparency log inclusion
- [ ] Binary integrity verification

## 12. Post-Exploitation

- [ ] Credential exfiltration via DID documents
- [ ] Lateral movement between services
- [ ] Container breakout
- [ ] Persistent access via manipulated DID documents
- [ ] Data exfiltration via ZKP proof channels
- [ ] Audit log tampering

---

## Tools to Use

| Tool | Purpose |
|------|---------|
| Burp Suite | Web API testing (with `deploy/security/burp_suite_config.json`) |
| OWASP ZAP | Automated scanning (via `deploy/security/owasp_zap_full_scan.sh`) |
| nmap | Network discovery (via `deploy/security/nmap_scan.sh`) |
| nuclei | Vulnerability scanning (templates in `deploy/security/nuclei_templates/`) |
| kube-bench | K8s CIS benchmark (via `deploy/security/kube_bench.sh`) |
| snyk | SAST scanning (via `deploy/security/snyk_code_test.sh`) |
| clair | Container scanning (via `deploy/security/clair_container_scan.sh`) |
| rekor-cli | Transparency log verification (via `deploy/security/rekor_search.sh`) |
| notary/notation | Container signature verification (via `deploy/security/notary_verify.sh`) |

---

## Reporting

- [ ] Document all findings with severity, CVSS score, and proof of concept
- [ ] Provide remediation guidance per finding
- [ ] Include request/response logs
- [ ] Generate timeline of testing activities
- [ ] Attach scan reports and tool output
- [ ] Classify findings per OWASP Risk Rating Methodology
