CREATE TABLE IF NOT EXISTS did_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    did VARCHAR(512) NOT NULL UNIQUE,
    document_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(32) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'deactivated', 'suspended', 'expired')),
    method VARCHAR(64) NOT NULL,
    method_specific_id VARCHAR(512) NOT NULL,
    UNIQUE (method, method_specific_id)
);

CREATE INDEX idx_did_registry_did ON did_registry (did);
CREATE INDEX idx_did_registry_method ON did_registry (method);
CREATE INDEX idx_did_registry_status ON did_registry (status);
CREATE INDEX idx_did_registry_method_specific_id ON did_registry (method, method_specific_id);
CREATE INDEX idx_did_registry_updated_at ON did_registry (updated_at);
