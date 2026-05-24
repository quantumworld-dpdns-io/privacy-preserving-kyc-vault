CREATE TYPE schema_status AS ENUM ('draft', 'published', 'deprecated', 'archived');

CREATE TABLE IF NOT EXISTS schema_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(256) NOT NULL,
    version INTEGER NOT NULL,
    schema_json JSONB NOT NULL,
    schema_json_ld JSONB,
    status schema_status NOT NULL DEFAULT 'draft',
    description TEXT,
    author_did VARCHAR(512),
    is_latest BOOLEAN NOT NULL DEFAULT false,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, version)
);

CREATE INDEX idx_schema_registry_name ON schema_registry (name);
CREATE INDEX idx_schema_registry_status ON schema_registry (status);
CREATE INDEX idx_schema_registry_latest ON schema_registry (is_latest) WHERE is_latest = true;
CREATE INDEX idx_schema_registry_tags ON schema_registry USING gin (tags);

CREATE OR REPLACE FUNCTION promote_schema_version(p_name VARCHAR, p_new_version INTEGER)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    new_id UUID;
BEGIN
    UPDATE schema_registry SET is_latest = false WHERE name = p_name AND is_latest = true;

    SELECT id INTO new_id
    FROM schema_registry
    WHERE name = p_name AND version = p_new_version;

    IF new_id IS NULL THEN
        RAISE EXCEPTION 'Schema version % not found for %', p_new_version, p_name;
    END IF;

    UPDATE schema_registry SET is_latest = true WHERE id = new_id;

    RETURN new_id;
END;
$$;
