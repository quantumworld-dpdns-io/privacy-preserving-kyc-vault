CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'in_flight', 'delivered', 'failed', 'permanently_failed');

CREATE TABLE IF NOT EXISTS webhook_queue (
    id BIGSERIAL PRIMARY KEY,
    platform_id UUID NOT NULL,
    webhook_url VARCHAR(1024) NOT NULL,
    event_type VARCHAR(256) NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(256) NOT NULL UNIQUE,
    status webhook_delivery_status NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    last_response_code INTEGER,
    last_response_body TEXT,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_queue_platform ON webhook_queue (platform_id);
CREATE INDEX idx_webhook_queue_status ON webhook_queue (status);
CREATE INDEX idx_webhook_queue_next_attempt ON webhook_queue (next_attempt_at)
    WHERE status IN ('pending', 'failed');
CREATE INDEX idx_webhook_queue_idempotency ON webhook_queue (idempotency_key);
CREATE INDEX idx_webhook_queue_event ON webhook_queue (event_type);

CREATE OR REPLACE FUNCTION calculate_webhook_backoff(attempt_count INTEGER)
RETURNS INTERVAL
IMMUTABLE STRICT
LANGUAGE sql
AS $$
    SELECT CASE
        WHEN attempt_count <= 1 THEN INTERVAL '10 seconds'
        WHEN attempt_count <= 2 THEN INTERVAL '30 seconds'
        WHEN attempt_count <= 3 THEN INTERVAL '1 minute'
        WHEN attempt_count <= 4 THEN INTERVAL '5 minutes'
        ELSE INTERVAL '15 minutes'
    END;
$$;

CREATE OR REPLACE FUNCTION process_webhook_delivery(
    p_webhook_id BIGINT,
    p_status webhook_delivery_status,
    p_response_code INTEGER,
    p_response_body TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    current_attempt INTEGER;
    max_attempt INTEGER;
    next_interval INTERVAL;
BEGIN
    SELECT attempt_count, max_attempts INTO current_attempt, max_attempt
    FROM webhook_queue WHERE id = p_webhook_id;

    IF p_status = 'delivered' THEN
        UPDATE webhook_queue
        SET status = 'delivered',
            last_attempt_at = now(),
            last_response_code = p_response_code,
            last_response_body = p_response_body,
            updated_at = now()
        WHERE id = p_webhook_id;
    ELSIF current_attempt >= max_attempt THEN
        UPDATE webhook_queue
        SET status = 'permanently_failed',
            last_attempt_at = now(),
            last_response_code = p_response_code,
            last_response_body = p_response_body,
            updated_at = now()
        WHERE id = p_webhook_id;
    ELSE
        next_interval := calculate_webhook_backoff(current_attempt + 1);
        UPDATE webhook_queue
        SET status = 'failed',
            attempt_count = current_attempt + 1,
            last_attempt_at = now(),
            last_response_code = p_response_code,
            last_response_body = p_response_body,
            next_attempt_at = now() + next_interval,
            updated_at = now()
        WHERE id = p_webhook_id;
    END IF;
END;
$$;
