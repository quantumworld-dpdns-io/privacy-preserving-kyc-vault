CREATE TYPE usage_metric_type AS ENUM (
    'api_call', 'credential_issued', 'credential_verified',
    'kyc_submission', 'storage_bytes', 'bandwidth_bytes',
    'webhook_delivery', 'fl_round', 'tee_attestation',
    'compute_seconds', 'schema_registration'
);

CREATE TYPE billing_status AS ENUM ('pending', 'invoiced', 'paid', 'overdue', 'cancelled', 'refunded');

CREATE TABLE IF NOT EXISTS usage_records (
    id BIGSERIAL PRIMARY KEY,
    platform_id UUID NOT NULL,
    metric_type usage_metric_type NOT NULL,
    metric_value NUMERIC(20, 8) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_records_platform ON usage_records (platform_id);
CREATE INDEX idx_usage_records_metric ON usage_records (metric_type);
CREATE INDEX idx_usage_records_recorded ON usage_records (recorded_at);
CREATE INDEX idx_usage_records_platform_metric ON usage_records (platform_id, metric_type, recorded_at);

CREATE TABLE IF NOT EXISTS billing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id UUID NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    total_amount NUMERIC(16, 4) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status billing_status NOT NULL DEFAULT 'pending',
    line_items JSONB DEFAULT '{}'::jsonb,
    invoice_number VARCHAR(128) UNIQUE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_records_platform ON billing_records (platform_id);
CREATE INDEX idx_billing_records_status ON billing_records (status);
CREATE INDEX idx_billing_records_period ON billing_records (billing_period_start, billing_period_end);
CREATE INDEX idx_billing_records_invoice ON billing_records (invoice_number);

CREATE OR REPLACE FUNCTION aggregate_usage(
    p_platform_id UUID,
    p_start TIMESTAMPTZ,
    p_end TIMESTAMPTZ
) RETURNS TABLE(metric_type usage_metric_type, total NUMERIC(20, 8))
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ur.metric_type,
        SUM(ur.metric_value)::NUMERIC(20, 8) AS total
    FROM usage_records ur
    WHERE ur.platform_id = p_platform_id
      AND ur.recorded_at >= p_start
      AND ur.recorded_at < p_end
    GROUP BY ur.metric_type
    ORDER BY ur.metric_type;
END;
$$;
