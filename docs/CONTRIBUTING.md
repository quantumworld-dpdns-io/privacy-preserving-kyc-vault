# Contributing to KYC Vault

## Code of Conduct

This project follows a code of conduct. All participants must maintain a harassment-free, inclusive environment. Report issues to security@kyc-vault.com.

## Getting Started

```bash
# Prerequisites
rustup toolchain install stable  # Rust 1.85+
pnpm install                     # Node >=22, pnpm >=9
uv sync                          # Python setup
make setup                       # Full project setup

# Start dev dependencies
docker compose up -d postgres redis minio weaviate
```

## Development Workflow

### 1. Branch Strategy

```
main          — Production-ready, protected branch
dev           — Integration branch for feature work
feature/*     — Feature branches (branch from dev)
fix/*         — Bug fixes
docs/*        — Documentation changes
chore/*       — Maintenance, tooling, CI
```

### 2. Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add age verification Noir circuit
fix(credential): resolve RevocationList index out-of-bounds
docs: add ZKP upgrade runbook
chore(deps): bump ml-kem crate to 0.4.1
refactor(zkp): extract UniversalVerifier trait
test: add integration test for hybrid KEM
```

Commit messages are validated via commitlint (`.commitlint.config.js`).

### 3. Before You Commit

```bash
# Run all lint and format checks
make lint

# Run all tests
make test

# Ensure secure code (no unsafe blocks allowed)
cargo clippy --workspace -- -D warnings

# Audit dependencies
cargo audit
pnpm audit
```

### 4. PR Process

1. Open PR against `dev` (not `main`)
2. Fill the PR template with:
   - Description of changes
   - Link to related issue
   - Testing performed
   - Breaking changes noted
3. CI must pass: build, lint, test (Rust + TS + Python), Robot Framework, security scan
4. At least one code owner review required
5. Squash-merge into `dev` with clean commit message
6. PRs to `main` require 2 approvals + full E2E test pass

## Coding Standards

### Rust

- All crates: `cargo clippy -- -D warnings` (zero warnings)
- `unsafe` code is **denied** (`crates/` workspace lint)
- `cargo fmt` required (rustfmt.toml with default config)
- Async runtime: Tokio (with `full` features)
- Error handling: `thiserror` for library crates, `anyhow` for binaries
- Testing: `#[cfg(test)]` modules in every source file; integration tests in `tests/`
- Documentation: `///` doc comments on all public API items

```rust
// Good
pub struct VerifiableCredential {
    pub id: String,
    pub issuer: String,
    pub credential_subject: CredentialSubject,
    pub proof: Option<Proof>,
}

impl VerifiableCredential {
    pub fn is_expired(&self) -> bool {
        self.expiration_date
            .map(|date| date < Utc::now())
            .unwrap_or(false)
    }
}
```

### TypeScript

- Strict TypeScript (`tsconfig.json` with strict: true)
- Formatting: Prettier (`.prettierrc`)
- Linting: ESLint with `@typescript-eslint`
- Input validation: Zod schemas for all API endpoints
- Testing: Vitest
- No `any` types; prefer `unknown` + type guards

```typescript
// Good
const DocumentSchema = z.object({
  documentId: z.string().uuid(),
  imageData: z.string().max(10_000_000),
});

type Document = z.infer<typeof DocumentSchema>;
```

### Python

- Type hints required on all function signatures
- Formatting: Ruff (pyproject.toml)
- Testing: pytest with coverage
- No PII in test data; use faker or fixtures

### Architecture Principles

- **Hexagonal architecture**: Business logic is framework-agnostic; ports and adapters pattern
- **Event-driven**: Service communication via Kafka; not direct HTTP calls
- **Privacy by design**: ZKP for selective disclosure; TEE for sensitive processing
- **Post-quantum ready**: Hybrid mode (classical + PQC) enabled by default
- **Defense in depth**: All 9 security layers active in production

## Testing Requirements

| Test Type | Tool | Required For | Minimum Coverage |
|-----------|------|--------------|------------------|
| Unit | cargo test / vitest | All code | 80% line coverage |
| Integration | cargo test (integration) | API + DB interactions | Key flows (KYC, ZKP, DID) |
| E2E | Robot Framework | API endpoints | All public endpoints |
| Security | OWASP Top 10 Robot tests | Every release | All OWASP categories |
| Load | K6 | Performance-critical endpoints | p99 < 500ms |
| Fuzz | cargo-fuzz / Jazzer.js | Parser + crypto functions | No crashes in 1M iterations |
| PQC | NIST ACVP test vectors | PQC modules | All test vectors pass |

```bash
# Run specific test suites
cargo test --package zkp                    # ZKP unit tests
pnpm test --filter=@kyc-vault/api           # API tests
cd tests && robot robot/kyc_workflow.robot  # Robot E2E
k6 run tests/load/kyc_scenarios.js          # Load tests
```

## PR Review Checklist

### For Reviewers

- [ ] Does the code follow the architecture patterns (hexagonal, event-driven)?
- [ ] Are there any `unsafe` blocks? (should be none — workspace lint denies it)
- [ ] Are PQC considerations addressed? (hybrid mode for crypto changes)
- [ ] Are ZKP circuits updated with proper proof versioning?
- [ ] Are there tests for the happy path AND error cases?
- [ ] Is there a corresponding ADR for architectural decisions?
- [ ] Are secrets handled correctly? (never logged, Vault-managed)
- [ ] Is rate limiting applied to new API endpoints?
- [ ] Is data classification (sensitivity level) set on new schema attributes?
- [ ] Are retention policies defined for new data types?
- [ ] Is the change backwards-compatible? If not, is a migration runbook provided?

### For Authors

- [ ] Have you run `make lint` and `make test` locally?
- [ ] Have you added/updated doc comments?
- [ ] Have you updated the API spec (docs/API.md) for endpoint changes?
- [ ] Have you updated relevant runbooks for operational changes?
- [ ] Have you run the security scanner (`semgrep --config=auto .`)?
- [ ] Is your branch up-to-date with `dev`?

## Documentation

- All runbooks go in `docs/runbooks/`
- ADRs go in `docs/adr/` (use `docs/adr/template.md`)
- API endpoints documented in `docs/API.md`
- Architecture diagrams in `docs/ARCHITECTURE.md`
- Security controls in `docs/SECURITY.md`
- Compliance mappings in `docs/compliance/`
- README is the project overview — keep it concise

## Release Process

```
dev ──(squash)──► main ──(tag)──► vX.Y.Z ──(CI)──► Release
```

1. PR merged from `dev` to `main`
2. CI runs full test suite + security scan + integration tests
3. Release workflow tags `vX.Y.Z` via semantic-release
4. Docker images built and signed with Cosign (SLSA Level 2)
5. Helm chart published to chart repository
6. Release notes auto-generated from conventional commits

## Questions?

- Architecture discussions: GitHub Issues with `discussion` label
- Security concerns: security@kyc-vault.com
- General help: Open a GitHub Discussion
