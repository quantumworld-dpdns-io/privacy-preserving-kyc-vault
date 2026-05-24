# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

## Reporting a Vulnerability

Report vulnerabilities to **security@kyc-vault.example.com**.

Do NOT file public GitHub issues for security vulnerabilities.

### What to include:
- Type of vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if known)

## Disclosure Timeline
1. Report received — 24h acknowledgment
2. Triage — 72h severity assessment
3. Fix development — based on severity
4. Public disclosure — 90 days after fix

## Security Practices
- All code reviewed with SAST (Semgrep, Trivy, CodeQL)
- Dependencies scanned (OSV-Scanner, Dependabot)
- Container images signed with Cosign
- SLSA provenance generated for releases
- OWASP Top 10 tested via Robot Framework
- Penetration testing before major releases
- Bug bounty program for validated findings

## Cryptographic Agility
This project maintains forward compatibility with:
- Post-Quantum Cryptography (ML-KEM, ML-DSA, SLH-DSA)
- Hybrid mode (classical + PQ) for transition period
- Zero-knowledge proofs (Noir, RISC Zero, BBS+)

## Compliance
- SOC 2 Type II (in progress)
- ISO 27001 (in progress)
- GDPR readiness
- CCPA/CPRA compliance
- eIDAS 2.0 alignment
