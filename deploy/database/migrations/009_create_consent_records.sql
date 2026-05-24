CREATE TYPE consent_status AS ENUM ('granted', 'revoked', 'expired');
CREATE TYPE data_category AS ENUM (
    'identity', 'contact', 'financial', 'biometric',
    'document', 'employment', 'education', 'criminal_record',
    'tax_information', 'analytics', 'marketing', 'third_party_sharing'
);

CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_did VARCHAR(512) NOT NULL,
    platform_id UUID NOT NULL,
    data_categories data_category[] NOT NULL,
    purpose VARCHAR(512) NOT NULL,
    status consent_status NOT NULL DEFAULT 'granted',
    consent_version VARCHAR(64) NOT NULL,
    consent_hash VARCHAR(128) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_records_user ON consent_records (user_did);
CREATE INDEX idx_consent_records_platform ON consent_records (platform_id);
CREATE INDEX idx_consent_records_status ON consent_records (status);
CREATE INDEX idx_consent_records_categories ON consent_records USING gin (data_categories);
CREATE INDEX idx_consent_records_expires ON consent_records (expires_at);

CREATE OR REPLACE FUNCTION revoke_expired_consent()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE consent_records
    SET status = 'expired', updated_at = now()
    WHERE status = 'granted'
      AND expires_at IS NOT NULL
      AND expires_at < now();

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$;
