-- ============================================================
-- Database Schema Initialization
-- Privacy-Preserving KYC Vault
-- All migrations run in order within a single transaction
-- ============================================================

BEGIN;

-- Track which migrations have been applied
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    filename VARCHAR(256) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checksum VARCHAR(128) NOT NULL
);

-- Migration 001: DID Registry
\ir 001_create_did_registry.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('001', '001_create_did_registry.sql', encode(sha256(pg_read_file('deploy/database/migrations/001_create_did_registry.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 002: Credential Store
\ir 002_create_credential_store.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('002', '002_create_credential_store.sql', encode(sha256(pg_read_file('deploy/database/migrations/002_create_credential_store.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 003: KYC Workflows
\ir 003_create_kyc_workflows.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('003', '003_create_kyc_workflows.sql', encode(sha256(pg_read_file('deploy/database/migrations/003_create_kyc_workflows.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 004: Platform Registry
\ir 004_create_platforms.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('004', '004_create_platforms.sql', encode(sha256(pg_read_file('deploy/database/migrations/004_create_platforms.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 005: Audit Log
\ir 005_create_audit_log.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('005', '005_create_audit_log.sql', encode(sha256(pg_read_file('deploy/database/migrations/005_create_audit_log.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 006: Sessions
\ir 006_create_sessions.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('006', '006_create_sessions.sql', encode(sha256(pg_read_file('deploy/database/migrations/006_create_sessions.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 007: Schema Registry
\ir 007_create_schema_registry.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('007', '007_create_schema_registry.sql', encode(sha256(pg_read_file('deploy/database/migrations/007_create_schema_registry.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 008: Revocation Lists
\ir 008_create_revocation_lists.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('008', '008_create_revocation_lists.sql', encode(sha256(pg_read_file('deploy/database/migrations/008_create_revocation_lists.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 009: Consent Records
\ir 009_create_consent_records.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('009', '009_create_consent_records.sql', encode(sha256(pg_read_file('deploy/database/migrations/009_create_consent_records.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 010: Billing Records
\ir 010_create_billing_records.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('010', '010_create_billing_records.sql', encode(sha256(pg_read_file('deploy/database/migrations/010_create_billing_records.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 011: Federated Learning Rounds
\ir 011_create_federated_learning_rounds.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('011', '011_create_federated_learning_rounds.sql', encode(sha256(pg_read_file('deploy/database/migrations/011_create_federated_learning_rounds.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 012: Webhook Queue
\ir 012_create_webhook_queue.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('012', '012_create_webhook_queue.sql', encode(sha256(pg_read_file('deploy/database/migrations/012_create_webhook_queue.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 013: API Key Management
\ir 013_create_api_key_management.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('013', '013_create_api_key_management.sql', encode(sha256(pg_read_file('deploy/database/migrations/013_create_api_key_management.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 014: Compliance Reports
\ir 014_create_compliance_reports.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('014', '014_create_compliance_reports.sql', encode(sha256(pg_read_file('deploy/database/migrations/014_create_compliance_reports.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

-- Migration 015: TEE Attestations
\ir 015_create_tee_attestations.sql
INSERT INTO schema_migrations (version, filename, checksum)
VALUES ('015', '015_create_tee_attestations.sql', encode(sha256(pg_read_file('deploy/database/migrations/015_create_tee_attestations.sql')::BYTEA), 'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
