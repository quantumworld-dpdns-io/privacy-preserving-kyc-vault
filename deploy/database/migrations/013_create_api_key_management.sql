CREATE TYPE api_key_status AS ENUM ('active', 'expired', 'revoked', 'rotated');

CREATE TABLE IF NOT EXISTS api_key_management (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id UUID NOT NULL,
    key_alias VARCHAR(128) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    key_hash VARCHAR(256) NOT NULL,
    key_salt BYTEA NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    allowed_ips INET[],
    status api_key_status NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    rotated_from_key_id UUID REFERENCES api_key_management(id),
    rotated_to_key_id UUID REFERENCES api_key_management(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_key_management_platform ON api_key_management (platform_id);
CREATE INDEX idx_api_key_management_prefix ON api_key_management (key_prefix);
CREATE INDEX idx_api_key_management_status ON api_key_management (status);
CREATE INDEX idx_api_key_management_expires ON api_key_management (expires_at)
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION rotate_api_key(
    p_old_key_id UUID,
    p_new_key_hash VARCHAR(256),
    p_new_key_salt BYTEA,
    p_new_key_prefix VARCHAR(16),
    p_new_expires_at TIMESTAMPTZ
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    new_key_id UUID;
    p_platform_id UUID;
    p_scopes TEXT[];
    p_allowed_ips INET[];
BEGIN
    SELECT platform_id, scopes, allowed_ips INTO p_platform_id, p_scopes, p_allowed_ips
    FROM api_key_management WHERE id = p_old_key_id;

    UPDATE api_key_management
    SET status = 'rotated', updated_at = now()
    WHERE id = p_old_key_id;

    INSERT INTO api_key_management (
        platform_id, key_alias, key_prefix, key_hash, key_salt,
        scopes, allowed_ips, status, expires_at, rotated_from_key_id
    ) VALUES (
        p_platform_id,
        'rotated-' || gen_random_uuid()::TEXT,
        p_new_key_prefix,
        p_new_key_hash,
        p_new_key_salt,
        p_scopes,
        p_allowed_ips,
        'active',
        p_new_expires_at,
        p_old_key_id
    ) RETURNING id INTO new_key_id;

    UPDATE api_key_management
    SET rotated_to_key_id = new_key_id
    WHERE id = p_old_key_id;

    RETURN new_key_id;
END;
$$;
