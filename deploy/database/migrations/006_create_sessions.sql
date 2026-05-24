CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_did VARCHAR(512) NOT NULL,
    platform_id UUID,
    encrypted_session_data BYTEA NOT NULL,
    encryption_iv BYTEA NOT NULL,
    encryption_tag BYTEA NOT NULL,
    session_expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions (user_did);
CREATE INDEX idx_sessions_expires ON sessions (session_expires_at);
CREATE INDEX idx_sessions_revoked ON sessions (is_revoked);
CREATE INDEX idx_sessions_last_accessed ON sessions (last_accessed_at);

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    id BIGSERIAL PRIMARY KEY,
    bucket_key VARCHAR(512) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_duration_seconds INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bucket_key, window_start, window_duration_seconds)
);

CREATE INDEX idx_rate_limit_counters_bucket ON rate_limit_counters (bucket_key, window_start);
CREATE INDEX idx_rate_limit_counters_window ON rate_limit_counters (window_start);

CREATE OR REPLACE FUNCTION increment_rate_limit_counter(
    p_bucket_key VARCHAR,
    p_window_start TIMESTAMPTZ,
    p_window_duration_seconds INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    current_count INTEGER;
BEGIN
    INSERT INTO rate_limit_counters (bucket_key, window_start, window_duration_seconds, request_count)
    VALUES (p_bucket_key, p_window_start, p_window_duration_seconds, 1)
    ON CONFLICT (bucket_key, window_start, window_duration_seconds)
    DO UPDATE SET request_count = rate_limit_counters.request_count + 1,
                  updated_at = now()
    RETURNING request_count INTO current_count;

    RETURN current_count;
END;
$$;
