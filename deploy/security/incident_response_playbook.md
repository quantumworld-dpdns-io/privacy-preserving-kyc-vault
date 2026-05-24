# KYC Vault — Incident Response Playbook

> **Version:** 1.0
> **Classification:** Confidential — Security Team Only
> **Last Updated:** 2026-05-24

---

## Table of Contents

1. [Response Phases](#1-response-phases)
2. [Severity Classification](#2-severity-classification)
3. [Incident Types & Procedures](#3-incident-types--procedures)
4. [Communication Plan](#4-communication-plan)
5. [Post-Mortem Process](#5-post-mortem-process)
6. [Appendix: Runbooks & Scripts](#6-appendix-runbooks--scripts)

---

## 1. Response Phases

### Phase 1: Detection & Triage (0–1 hour)

| Action | Owner | Tooling |
|--------|-------|---------|
| Detect anomalous event | Monitoring/SOC | Prometheus, Grafana, Loki, Tetragon |
| Classify severity | Security Lead | See [Severity Classification](#2-severity-classification) |
| Open incident ticket | Incident Commander | PagerDuty / OpsGenie |
| Assemble response team | Incident Commander | Slack #incident-response |
| Begin timeline log | Scribe | Shared Google Doc |

### Phase 2: Containment (1–4 hours)

| Action | Owner |
|--------|-------|
| Isolate affected component(s) via network policy | Infrastructure Lead |
| Rotate compromised credentials / API keys | Security Lead |
| Block malicious IPs via WAF/ingress | Network Lead |
| Revoke affected DID documents | DID Service Lead |
| Scale up monitoring for related indicators | Monitoring Lead |

### Phase 3: Eradication (4–24 hours)

| Action | Owner |
|--------|-------|
| Identify root cause | Security Engineering |
| Apply security patch | Service Owner |
| Verify patch effectiveness | QA/Security |
| Audit affected code paths for similar issues | Security Engineering |

### Phase 4: Recovery (24–72 hours)

| Action | Owner |
|--------|-------|
| Restore service from clean state | Infrastructure |
| Verify data integrity | Data Engineering |
| Rotate all system secrets | Security Lead |
| Re-enable normal traffic gradually | SRE |

### Phase 5: Post-Mortem (1–2 weeks)

| Action | Owner |
|--------|-------|
| Timeline reconstruction | Scribe |
| Root cause analysis | Security Engineering |
| Blameless post-mortem meeting | Incident Commander |
| Update playbooks / runbooks | Security Team |
| Implement preventive controls | Engineering Teams |

---

## 2. Severity Classification

| Severity | Definition | SLA | Examples |
|----------|------------|-----|----------|
| **SEV-1 (Critical)** | Active compromise of credential data, private keys, or ability to issue credentials | 15min response, 1hr containment | Credential DB exfiltration, private key leak, unauthorized credential issuance |
| **SEV-2 (High)** | Authentication bypass, privilege escalation, ZKP proof forging | 30min response, 4hr containment | DID document takeover, API key bypass, proof malleability exploit |
| **SEV-3 (Medium)** | PII leakage, SSRF, DoS affecting subset of users | 2hr response, 24hr containment | Error message leaking PII, rate limiting bypass |
| **SEV-4 (Low)** | Minor misconfiguration, informational disclosure, best-practice gap | 24hr response, next release | Missing security header, verbose debug logging |

---

## 3. Incident Types & Procedures

### 3.1 Credential Data Breach

**Severity:** SEV-1

**Indicators:**
- Unusual database query volume or pattern
- Large outbound data transfer from credential-service
- Unauthorized API calls to credential endpoints
- Alert from DLP / data loss prevention tooling

**Immediate Actions:**
1. Isolate credential-service Pod (apply `deny-all` network policy)
2. Rotate database credentials in Vault
3. Revoke all active sessions and API keys
4. Enable audit logging at debug level for credential endpoints
5. Notify CISO and Legal

**Containment:**
- Take forensic snapshot of affected database
- Block originating IPs at ingress level
- Review credential-service access logs for unauthorized access
- Check Rekor transparency log for unexpected signing operations

**Recovery:**
- Restore from pre-incident backup
- Verify no persistent access (review Kubernetes audit logs)
- Rotate all database encryption keys
- Notify affected users per regulatory requirements

### 3.2 DID Document Compromise

**Severity:** SEV-2

**Indicators:**
- DID document modification without valid signature
- Unregistered DID resolving to attacker-controlled keys
- Phishing emails referencing specific DIDs

**Immediate Actions:**
1. Suspend DID update operations
2. Revoke compromised DID documents
3. Increase DID resolution rate limiting
4. Scan for similar DIDs registered during compromise window

**Containment:**
- Audit all DID updates in last 24 hours
- Verify key rotation timestamps
- Check for DID method confusion attacks
- Review universal resolver plugin integrity

**Recovery:**
- Re-publish valid DID documents with new keys
- Enable DID document change notifications
- Deploy DID verification hardening

### 3.3 ZKP Proof Forgery

**Severity:** SEV-1

**Indicators:**
- Verification failures on previously valid proofs
- Unexpected proof acceptance for invalid inputs
- Circuit parameter mismatch alerts

**Immediate Actions:**
1. Halt all ZKP verification operations
2. Isolate ZKP engine service
3. Verify circuit integrity (check circuit hash against trusted setup)
4. Review proving key access logs

**Containment:**
- Validate all active proofs with alternative verifier
- Audit circuit deployment pipeline
- Check for toxic waste exposure signals
- Verify Fiat-Shamir transform implementation

**Recovery:**
- Rotate proving keys if compromised
- Deploy circuit fix
- Re-run trusted setup ceremony if needed
- Incremental re-verification of issued credentials

### 3.4 Infrastructure Compromise (K8s / Container)

**Severity:** SEV-1

**Indicators:**
- Unknown Pods or containers running
- Kubernetes audit log alerts (RBAC violations)
- Container breakout detection (Tetragon)
- Unexpected network connections to external IPs

**Immediate Actions:**
1. Suspend node scheduling
2. Isolate compromised node(s) via network policy
3. Capture container forensics (memory dump, filesystem snapshot)
4. Revoke all node credentials

**Containment:**
- Review Kubernetes audit logs for unauthorized API calls
- Check for mounted service account tokens
- Scan for crypto-miners or backdoor containers
- Verify etcd access logs

**Recovery:**
- Rebuild nodes from hardened image
- Rotate cluster CA certificates
- Re-image all worker nodes
- Enable additional Tetragon monitoring policies

### 3.5 Supply Chain Attack

**Severity:** SEV-2

**Indicators:**
- Unexpected dependency version changes
- CI/CD pipeline anomalies
- Binary size or checksum mismatch
- New maintainer on critical dependency

**Immediate Actions:**
1. Halt all deployment pipelines
2. Pin dependency versions to known-good
3. Verify container image signatures (Notary/Notation)
4. Audit recent dependency updates

**Containment:**
- Scan all dependencies with Snyk / Trivy
- Verify SBOM against known-good baseline
- Check Rekor log for recent signing events
- Rotate any signing keys that touched affected build

**Recovery:**
- Rebuild all images from pinned dependencies
- Enable dependency review automation
- Implement SLSA Level 3 build provenance
- Add additional signing verification steps

---

## 4. Communication Plan

### Internal Communication

| Channel | Audience | Purpose |
|---------|----------|---------|
| #incident-response | Response team | Real-time coordination |
| #security-alerts | Engineering | Incident notification |
| Email (security-team) | Security team | Detailed updates |
| Slack DM | Executives | SEV-1 escalation |

### External Communication

| Audience | Trigger | Message | Owner |
|----------|---------|---------|-------|
| Regulatory bodies | SEV-1 with PII breach | Within 72 hours per GDPR | CISO + Legal |
| Affected users | SEV-1/2 impacting data | Within 24 hours of confirmation | CISO + Legal |
| Bug bounty reporters | SEV-1/2 fix deployed | Within 7 days | Security Lead |
| Public disclosure | All SEV-1 resolved | Coordinated disclosure | PR + Security |

### Notification Template

```
Subject: [INCIDENT] KYC Vault - <Component> - <Severity>

Severity: <SEV-1/2/3/4>
Status: <Detection / Containment / Eradication / Recovery / Post-Mortem>
Opened: <timestamp>
Updated: <timestamp>
Incident Commander: <name>

Summary:
<brief description>

Impact:
<affected services, users, data>

Actions Taken:
- <action 1>
- <action 2>

Next Steps:
- <step 1>
- <step 2>

Slack: #incident-<id>
Ticket: INC-<id>
```

---

## 5. Post-Mortem Process

### Timeline

- **Day 1:** Incident closed, initial timeline drafted
- **Week 1:** Root cause analysis complete
- **Week 2:** Blameless post-mortem meeting held
- **Week 3:** Action items tracked to completion
- **Month 1:** Preventive controls verified

### Post-Mortem Template

```markdown
# Post-Mortem: INC-XXXX

## Summary
<one-paragraph overview>

## Timeline
| Time | Event |
|------|-------|
| T-0 | First detection |
| T+30min | Incident declared |
| T+2h | Containment achieved |
| T+8h | Eradication complete |
| T+24h | Service restored |

## Root Cause
<technical explanation>

## Impact
- Users affected:
- Data compromised:
- Downtime duration:

## Action Items
| # | Action | Owner | Due | Status |
|---|--------|-------|-----|--------|
| 1 | Fix code bug | @eng | YYYY-MM-DD | Open |
| 2 | Add monitoring | @ops | YYYY-MM-DD | Open |
| 3 | Update runbook | @sec | YYYY-MM-DD | Open |

## Lessons Learned
<what went well, what could improve>

## Blameless Conclusion
<system-level fixes, no individual blame>
```

---

## 6. Appendix: Runbooks & Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| Network isolation | `deploy/security/nmap_scan.sh` | Identify exposed endpoints |
| Forensics image capture | `deploy/security/clair_container_scan.sh` | Container vulnerability triage |
| Key revocation | (Vault API) | Rotate secrets during incident |
| Audit log extraction | (Loki API) | Pull logs for forensic analysis |
| Rekor search | `deploy/security/rekor_search.sh` | Check transparency log for tampering |
| Container signature verify | `deploy/security/notary_verify.sh` | Verify image integrity |
| Post-incident scan | `deploy/security/owasp_zap_full_scan.sh` | Full vulnerability rescan |

### Quick Commands

```bash
# Isolate a pod
kubectl label pod -n kyc-vault $POD_NAME isolate=true
kubectl apply -f deploy/security/runbooks/isolate-pod.yaml

# Revoke API keys
curl -X POST https://vault.kyc-vault.io/v1/auth/api-key/revoke \
  -d '{"key_id": "'$KEY_ID'"}'

# Capture forensic data
kubectl exec -n kyc-vault $POD_NAME -- cat /proc/1/environ > forensics/environ.txt
kubectl cp kyc-vault/$POD_NAME:/tmp/ forensics/fs/ -c app

# Verify image signature
deploy/security/notary_verify.sh kyc-vault/api-server:latest

# Search rekor for unexpected entries
deploy/security/rekor_search.sh subject attacker@evil.com
```

---

## Classification & Access

This document is classified as **Confidential** and should only be
shared with the KYC Vault Security Team and designated incident
responders. Distribution outside this group requires CISO approval.

Document access is tracked via Git. All changes require signed commits.
