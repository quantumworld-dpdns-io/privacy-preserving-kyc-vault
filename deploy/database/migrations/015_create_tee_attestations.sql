CREATE TYPE tee_platform AS ENUM ('sgx', 'tdx', 'sev', 'nitro', 'trustzone', 'securcore');
CREATE TYPE attestation_status AS ENUM ('pending', 'verified', 'failed', 'expired');

CREATE TABLE IF NOT EXISTS tee_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tee_platform tee_platform NOT NULL,
    attestation_version VARCHAR(64) NOT NULL,
    enclave_id VARCHAR(256) NOT NULL,
    mr_enclave VARCHAR(128),
    mr_signer VARCHAR(128),
    report_json JSONB NOT NULL,
    verifier_pubkey BYTEA,
    verification_status attestation_status NOT NULL DEFAULT 'pending',
    verification_detail JSONB DEFAULT '{}'::jsonb,
    verifier_did VARCHAR(512),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tee_attestations_platform ON tee_attestations (tee_platform);
CREATE INDEX idx_tee_attestations_enclave ON tee_attestations (enclave_id);
CREATE INDEX idx_tee_attestations_status ON tee_attestations (verification_status);
CREATE INDEX idx_tee_attestations_verified ON tee_attestations (is_verified) WHERE is_verified = true;
CREATE INDEX idx_tee_attestations_expires ON tee_attestations (expires_at);

CREATE TABLE IF NOT EXISTS tee_measurement_log (
    id BIGSERIAL PRIMARY KEY,
    attestation_id UUID NOT NULL REFERENCES tee_attestations(id) ON DELETE CASCADE,
    measurement_type VARCHAR(64) NOT NULL,
    measurement_value BYTEA NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tee_measurement_log_attestation ON tee_measurement_log (attestation_id);
