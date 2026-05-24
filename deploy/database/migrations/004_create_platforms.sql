CREATE TYPE platform_tier AS ENUM ('free', 'starter', 'professional', 'enterprise');
CREATE TYPE billing_plan AS ENUM ('monthly', 'annual', 'pay_as_you_go');

CREATE TABLE IF NOT EXISTS platform_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(256) NOT NULL,
    api_key_hash VARCHAR(256) NOT NULL,
    api_key_prefix VARCHAR(16) NOT NULL,
    webhook_url VARCHAR(1024),
    webhook_secret_hash VARCHAR(256),
    allowed_origins TEXT[] NOT NULL DEFAULT '{}',
    tier platform_tier NOT NULL DEFAULT 'free',
    billing_plan billing_plan NOT NULL DEFAULT 'monthly',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_registry_api_key_hash ON platform_registry (api_key_hash);
CREATE INDEX idx_platform_registry_tier ON platform_registry (tier);
CREATE INDEX idx_platform_registry_active ON platform_registry (is_active);
