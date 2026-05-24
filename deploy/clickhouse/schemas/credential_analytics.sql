CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.credential_events_local
(
    event_id UUID,
    credential_id String,
    platform String,
    event_type String,
    status String,
    timestamp DateTime64(3),
    metadata String,
    ingested_at DateTime DEFAULT now()
)
ENGINE = ReplicatedMergeTree(
    '/clickhouse/tables/{shard}/credential_events',
    '{replica}'
)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, platform, event_type)
TTL timestamp + INTERVAL 6 MONTH;

CREATE TABLE IF NOT EXISTS analytics.credential_events
(
    event_id UUID,
    credential_id String,
    platform String,
    event_type String,
    status String,
    timestamp DateTime64(3),
    metadata String,
    ingested_at DateTime DEFAULT now()
)
ENGINE = Distributed('cluster', 'analytics', 'credential_events_local', rand());

CREATE TABLE IF NOT EXISTS analytics.platform_metrics_mv
(
    platform String,
    event_type String,
    status String,
    event_count UInt64,
    window_start DateTime
)
ENGINE = SummingMergeTree()
ORDER BY (window_start, platform, event_type, status)
TTL window_start + INTERVAL 12 MONTH
AS SELECT
    platform,
    event_type,
    status,
    count() AS event_count,
    toStartOfHour(timestamp) AS window_start
FROM analytics.credential_events
GROUP BY platform, event_type, status, window_start;

CREATE TABLE IF NOT EXISTS analytics.verification_duration_agg
(
    platform String,
    credential_type String,
    avg_verification_seconds Float64,
    p50_verification_seconds Float64,
    p95_verification_seconds Float64,
    p99_verification_seconds Float64,
    sample_count UInt64,
    window_start DateTime
)
ENGINE = SummingMergeTree()
ORDER BY (window_start, platform, credential_type)
TTL window_start + INTERVAL 3 MONTH;
