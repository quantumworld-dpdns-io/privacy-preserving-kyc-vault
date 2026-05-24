# KYC Vault — Bug Bounty Program

## Introduction

KYC Vault is a privacy-preserving identity credential platform. We
welcome security researchers to help us maintain the highest security
standards. This program covers all components of the KYC Vault system,
including API services, cryptographic implementations, zero-knowledge
proof circuitry, DID infrastructure, and deployment configurations.

## Scope

### In-Scope

- API endpoints: `*.kyc-vault.io`, `*.kyc-vault.internal`
- All microservices (api-gateway, credential-service, did-resolver,
  zkp-engine, compliance-service, orchestrator, billing-service)
- Cryptographic implementations (HPKE, Ed25519, Falcon, Dilithium,
  Groth16, PLONK)
- Zero-knowledge proof circuits under `circuits/`
- DID method implementations (`did:kyc:*`)
- Smart contracts / on-chain verification (if applicable)
- Container images and deployment manifests under `deploy/`
- Build and CI/CD pipeline configurations
- Any subdomain or service that handles KYC credential data

### Out-of-Scope

- Physical security attacks
- Social engineering of KYC Vault employees or contractors
- Denial of Service attacks that exceed 10 Gbps or affect production
- Third-party services not operated by KYC Vault (e.g., cloud providers,
  OIDC providers)
- Attacks requiring man-in-the-middle access to encrypted traffic
- Previously reported vulnerabilities (check our disclosure list)
- Theoretical vulnerabilities without a practical exploit path
- Self-XSS or vulnerabilities requiring the victim to paste malicious content

## Rewards

| Severity | Reward (USD) | Minimum Criteria |
|----------|--------------|------------------|
| Critical | $25,000 | Remote code execution, credential database exfiltration, private key compromise |
| High | $10,000 | Authentication bypass, privilege escalation, unauthorized credential issuance |
| Medium | $3,000 | PII leakage, SSRF with impact, logic flaws in ZKP verification |
| Low | $500 | Information disclosure (non-PII), minor misconfigurations |
| Informational | $100 | Best practices, documentation improvements, missing headers |

Bounties are paid in USDC (preferred) or USD via wire transfer.

## Rules of Engagement

1. **Authorization:** You are authorized to test the in-scope targets.
   Do not access, modify, or exfiltrate user data beyond what is
   necessary to demonstrate the vulnerability.

2. **Testing Accounts:** Use the provided test credentials. Contact
   security@kyc-vault.io if you need additional test accounts.

3. **No Production Disruption:** Do not perform tests that may degrade
   production services. If you are unsure about a test, ask us first.

4. **Responsible Disclosure:** Report vulnerabilities immediately.
   Do not disclose the vulnerability publicly until we have resolved it
   and granted permission.

5. **Confidentiality:** Vulnerability details, communications, and
   bounty amounts are confidential unless we agree otherwise.

## Reporting Process

### How to Report

Send your report to **security@kyc-vault.io** with:

```
Subject: [Bug Bounty] <Component> - <Vulnerability Type>

Required fields:
- Component: affected service/component
- Vulnerability type: (e.g., SQLi, SSRF, auth bypass)
- Description: clear description of the issue
- Steps to reproduce: numbered steps or proof of concept
- Impact: what an attacker can achieve
- Severity rating: your assessment (Critical/High/Medium/Low)
- Environment: version, commit hash, deployment context

Optional:
- Suggested fix
- CVSS v3.1 vector string
- CVE applicability
```

### PGP Key

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
...
(Contact security@kyc-vault.io to obtain current PGP key)
-----END PGP PUBLIC KEY BLOCK-----
```

We strongly prefer PGP-encrypted reports for critical/high findings.

### Response Timeline

| Step | Timeframe |
|------|-----------|
| Acknowledgment | Within 24 hours |
| Initial triage | Within 72 hours |
| Validation | Within 5 business days |
| Fix deployment | Based on severity (critical: 48h, high: 7d, medium: 30d) |
| Bounty payment | Within 30 days of fix deployment |

## Legal Safe Harbor

We commit to:
- Not pursuing legal action for good-faith security research
- Not referring matters to law enforcement for research within scope
- Advocating for vulnerability disclosure safe harbor

We request:
- Good-faith effort to avoid privacy violations and service disruption
- No destruction or manipulation of data
- Compliance with all applicable laws

## Hall of Fame

Researchers who submit valid vulnerabilities will be listed (with
permission) in our public Hall of Fame:

- Researcher Name / Handle — CVE-2026-XXXX (Critical, $25,000)
- ...

## Contact

- **Email:** security@kyc-vault.io
- **PGP Key ID:** (request via email)
- **Bug bounty platform:** https://hackerone.com/kyc-vault *(coming soon)*

---

*Version 1.0 — Last updated 2026-05-24*
