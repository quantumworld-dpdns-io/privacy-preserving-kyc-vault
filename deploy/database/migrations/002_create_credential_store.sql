CREATE TABLE IF NOT EXISTS credential_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID NOT NULL,
    issuer_did VARCHAR(512) NOT NULL,
    subject_did VARCHAR(512) NOT NULL,
    credential_json JSONB NOT NULL,
    issuance_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    expiration_date TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked', 'suspended')),
    revocation_index BIGINT,
    list_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credential_store_subject ON credential_store (subject_did);
CREATE INDEX idx_credential_store_issuer ON credential_store (issuer_did);
CREATE INDEX idx_credential_store_schema ON credential_store (schema_id);
CREATE INDEX idx_credential_store_status ON credential_store (status);
CREATE INDEX idx_credential_store_expiration ON credential_store (expiration_date);
CREATE INDEX idx_credential_store_revocation ON credential_store (list_id, revocation_index);
