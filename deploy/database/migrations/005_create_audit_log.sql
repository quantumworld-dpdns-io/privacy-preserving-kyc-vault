CREATE TYPE audit_event_type AS ENUM (
    'did_created', 'did_updated', 'did_deactivated',
    'credential_issued', 'credential_revoked', 'credential_expired',
    'kyc_submitted', 'kyc_approved', 'kyc_rejected',
    'platform_created', 'platform_updated', 'platform_deleted',
    'api_key_rotated', 'api_key_revoked',
    'consent_granted', 'consent_revoked',
    'session_created', 'session_terminated',
    'webhook_delivered', 'webhook_failed',
    'billing_event', 'compliance_report_generated',
    'tee_attestation', 'schema_registered', 'schema_updated',
    'fl_round_completed', 'revocation_list_updated',
    'user_login', 'user_logout', 'admin_action'
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type audit_event_type NOT NULL,
    actor_did VARCHAR(512),
    platform_id UUID,
    resource_type VARCHAR(128) NOT NULL,
    resource_id VARCHAR(256) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    previous_hash VARCHAR(128) NOT NULL,
    hash VARCHAR(128) NOT NULL UNIQUE
);

CREATE INDEX idx_audit_log_event_type ON audit_log (event_type);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_did);
CREATE INDEX idx_audit_log_resource ON audit_log (resource_type, resource_id);
CREATE INDEX idx_audit_log_occurred ON audit_log (occurred_at);
CREATE INDEX idx_audit_log_platform ON audit_log (platform_id);
CREATE INDEX idx_audit_log_hash ON audit_log (hash);

CREATE OR REPLACE FUNCTION compute_audit_log_hash(
    p_id BIGINT,
    p_event_type TEXT,
    p_actor_did TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT,
    p_payload JSONB,
    p_occurred_at TIMESTAMPTZ,
    p_previous_hash TEXT
) RETURNS VARCHAR(128)
    IMMUTABLE STRICT
    LANGUAGE sql
AS $$
    SELECT encode(
        sha256(
            p_id::TEXT::BYTEA ||
            p_event_type::BYTEA ||
            COALESCE(p_actor_did, '')::BYTEA ||
            p_resource_type::BYTEA ||
            p_resource_id::BYTEA ||
            p_payload::TEXT::BYTEA ||
            p_occurred_at::TEXT::BYTEA ||
            COALESCE(p_previous_hash, '')::BYTEA
        ),
        'hex'
    );
$$;

CREATE OR REPLACE FUNCTION audit_log_hash_chain_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    prev_hash VARCHAR(128);
BEGIN
    SELECT hash INTO prev_hash
    FROM audit_log
    ORDER BY id DESC
    LIMIT 1;

    IF prev_hash IS NULL THEN
        NEW.previous_hash := '0';
    ELSE
        NEW.previous_hash := prev_hash;
    END IF;

    NEW.hash := compute_audit_log_hash(
        NEW.id,
        NEW.event_type::TEXT,
        NEW.actor_did,
        NEW.resource_type,
        NEW.resource_id,
        NEW.payload,
        NEW.occurred_at,
        NEW.previous_hash
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_log_hash_chain
    BEFORE INSERT ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION audit_log_hash_chain_trigger();

CREATE OR REPLACE FUNCTION verify_audit_chain(audit_id BIGINT)
RETURNS TABLE(valid BOOLEAN, message TEXT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    rec RECORD;
    prev_rec RECORD;
    expected_hash VARCHAR(128);
BEGIN
    FOR rec IN
        SELECT * FROM audit_log ORDER BY id
    LOOP
        IF rec.id = 1 THEN
            IF rec.previous_hash <> '0' THEN
                RETURN QUERY SELECT false, 'First record previous_hash must be 0';
                RETURN;
            END IF;
        ELSE
            SELECT * INTO prev_rec FROM audit_log WHERE id = rec.id - 1;
            expected_hash := compute_audit_log_hash(
                prev_rec.id,
                prev_rec.event_type::TEXT,
                prev_rec.actor_did,
                prev_rec.resource_type,
                prev_rec.resource_id,
                prev_rec.payload,
                prev_rec.occurred_at,
                prev_rec.previous_hash
            );
            IF rec.previous_hash <> expected_hash THEN
                RETURN QUERY SELECT false, 'Chain broken at id=' || rec.id::TEXT;
                RETURN;
            END IF;
        END IF;
    END LOOP;

    RETURN QUERY SELECT true, 'Audit chain is intact';
END;
$$;

COMMENT ON TABLE audit_log IS 'Immutable append-only audit log with SHA-256 hash chaining';
COMMENT ON COLUMN audit_log.previous_hash IS 'SHA-256 hash of the previous audit log entry';
COMMENT ON COLUMN audit_log.hash IS 'SHA-256 hash of this entry including previous_hash';
