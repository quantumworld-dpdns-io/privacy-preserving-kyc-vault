CREATE TYPE revocation_list_status AS ENUM ('active', 'expired', 'superseded');

CREATE TABLE IF NOT EXISTS revocation_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer_did VARCHAR(512) NOT NULL,
    list_version INTEGER NOT NULL,
    bitstring BYTEA NOT NULL,
    bitstring_length INTEGER NOT NULL,
    status revocation_list_status NOT NULL DEFAULT 'active',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    previous_list_id UUID REFERENCES revocation_lists(id),
    accumulator_value VARCHAR(256),
    signature_value BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (issuer_did, list_version)
);

CREATE INDEX idx_revocation_lists_issuer ON revocation_lists (issuer_did);
CREATE INDEX idx_revocation_lists_status ON revocation_lists (status);
CREATE INDEX idx_revocation_lists_valid ON revocation_lists (valid_from, valid_until);

CREATE OR REPLACE FUNCTION revoke_credential(
    p_list_id UUID,
    p_revocation_index INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    byte_index INTEGER;
    bit_position INTEGER;
    current_byte INTEGER;
    new_byte INTEGER;
BEGIN
    byte_index := p_revocation_index / 8;
    bit_position := p_revocation_index % 8;

    UPDATE credential_store
    SET status = 'revoked', updated_at = now()
    WHERE list_id = p_list_id AND revocation_index = p_revocation_index;

    UPDATE revocation_lists
    SET bitstring = overlay(
        bitstring
        SET (get_byte(bitstring, byte_index) | (1 << bit_position))::BYTEA
        PLACING 1
    )
    WHERE id = p_list_id;

    RETURN FOUND;
END;
$$;
