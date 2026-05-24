package kyc_vault.rate_limit

# ============================================================
# OPA/Rego Policy: API Rate Limiting by DID Reputation
# Enforces rate limits based on Decentralized Identifier (DID)
# reputation scores, tier levels, and historical compliance.
# ============================================================
# Input schema:
#   input.request: { method, path, timestamp, body_size }
#   input.client: { did, reputation_score, tier, verified_until }
#   input.rate: { window_count, window_seconds, total_bytes }
#   input.history: { violations_24h, success_rate_1h, avg_latency_ms }

import data.kyc_vault.rate_limits
import data.kyc_vault.reputation

# ============================================================
# Tier definitions with rate limits
# ============================================================
tier_limits = {
    "platinum": {
        "requests_per_second": 500,
        "requests_per_minute": 15000,
        "requests_per_hour": 300000,
        "burst_size": 1000,
        "max_body_size_bytes": 10485760,
        "concurrent_requests": 100,
    },
    "gold": {
        "requests_per_second": 200,
        "requests_per_minute": 6000,
        "requests_per_hour": 120000,
        "burst_size": 400,
        "max_body_size_bytes": 5242880,
        "concurrent_requests": 50,
    },
    "silver": {
        "requests_per_second": 100,
        "requests_per_minute": 3000,
        "requests_per_hour": 60000,
        "burst_size": 200,
        "max_body_size_bytes": 2097152,
        "concurrent_requests": 25,
    },
    "bronze": {
        "requests_per_second": 50,
        "requests_per_minute": 1500,
        "requests_per_hour": 30000,
        "burst_size": 100,
        "max_body_size_bytes": 1048576,
        "concurrent_requests": 10,
    },
    "untrusted": {
        "requests_per_second": 10,
        "requests_per_minute": 300,
        "requests_per_hour": 6000,
        "burst_size": 20,
        "max_body_size_bytes": 524288,
        "concurrent_requests": 2,
    },
}

# ============================================================
# Reputation tiers by score
# ============================================================
reputation_tier(score) := "platinum" { score >= 95 }
reputation_tier(score) := "gold" { score >= 80; score < 95 }
reputation_tier(score) := "silver" { score >= 60; score < 80 }
reputation_tier(score) := "bronze" { score >= 40; score < 60 }
reputation_tier(score) := "untrusted" { score < 40 }

# ============================================================
# Reputation modifiers
# ============================================================
violation_penalty(violations) := 0 { violations == 0 }
violation_penalty(violations) := 10 { violations <= 3 }
violation_penalty(violations) := 25 { violations <= 10 }
violation_penalty(violations) := 50 { violations > 10 }

latency_penalty(avg_latency_ms) := 0 { avg_latency_ms < 100 }
latency_penalty(avg_latency_ms) := 5 { avg_latency_ms < 500 }
latency_penalty(avg_latency_ms) := 15 { avg_latency_ms < 1000 }
latency_penalty(avg_latency_ms) := 30 { avg_latency_ms >= 1000 }

adjusted_reputation_score := score - violation_penalty(violations) - latency_penalty(latency) {
    score := input.client.reputation_score
    violations := input.history.violations_24h
    latency := input.history.avg_latency_ms
}

effective_tier := reputation_tier(adjusted_reputation_score)

default allow = false

# ============================================================
# Rate limit rules
# ============================================================

# Allow within tier limits
allow {
    limits := tier_limits[effective_tier]
    input.rate.window_count <= limits.requests_per_second
    input.body_size <= limits.max_body_size_bytes
}

# ============================================================
# Deny rules
# ============================================================

# Deny: per-second limit exceeded
deny[{"msg": "rate_limit_per_second_exceeded", "code": "RATE_001"}] {
    limits := tier_limits[effective_tier]
    input.rate.window_count > limits.requests_per_second
}

# Deny: per-minute limit exceeded
deny[{"msg": "rate_limit_per_minute_exceeded", "code": "RATE_002"}] {
    limits := tier_limits[effective_tier]
    input.rate.window_count * (60 / input.rate.window_seconds) > limits.requests_per_minute
}

# Deny: body size exceeds tier limit
deny[{"msg": "body_size_exceeds_limit", "code": "RATE_003"}] {
    limits := tier_limits[effective_tier]
    input.body_size > limits.max_body_size_bytes
}

# Deny: burst limit exceeded
deny[{"msg": "burst_limit_exceeded", "code": "RATE_004"}] {
    limits := tier_limits[effective_tier]
    input.rate.window_count > limits.burst_size
    input.rate.window_seconds < 2
}

# Deny: DID reputation too low
deny[{"msg": "insufficient_reputation", "code": "RATE_005"}] {
    effective_tier == "untrusted"
    input.client.reputation_score < 20
}

# Deny: DID verification expired
deny[{"msg": "did_verification_expired", "code": "RATE_006"}] {
    now := time.now_ns() / 1000000000
    input.client.verified_until < now
}

# Deny: concurrent requests exceeded
deny[{"msg": "concurrent_requests_exceeded", "code": "RATE_007"}] {
    limits := tier_limits[effective_tier]
    input.rate.concurrent_requests > limits.concurrent_requests
}

# Deny: rate limit with reputation penalty
deny[{"msg": "rate_limit_exceeded_with_penalty", "code": "RATE_008"}] {
    limits := tier_limits[effective_tier]
    input.rate.window_count > limits.requests_per_second
    input.history.violations_24h > 0
}

# ============================================================
# Stricter limits for sensitive endpoints
# ============================================================

# Stricter limits for credential write operations
deny[{"msg": "write_rate_limit_exceeded", "code": "RATE_009"}] {
    limits := tier_limits[effective_tier]
    input.request.method == "POST"
    contains(input.request.path, "/credentials")
    input.rate.window_count > (limits.requests_per_second / 2)
}

# Very strict limits for deletion
deny[{"msg": "delete_rate_limit_exceeded", "code": "RATE_010"}] {
    limits := tier_limits[effective_tier]
    input.request.method == "DELETE"
    input.rate.window_count > (limits.requests_per_second / 5)
}

# ============================================================
# Rate limit headers calculation
# ============================================================
rate_limit_headers := headers {
    limits := tier_limits[effective_tier]
    headers := {
        "X-RateLimit-Limit": sprintf("%d", [limits.requests_per_second]),
        "X-RateLimit-Remaining": sprintf("%d", [limits.requests_per_second - input.rate.window_count]),
        "X-RateLimit-Reset": sprintf("%d", [input.rate.window_seconds]),
        "X-RateLimit-Tier": effective_tier,
        "X-Reputation-Score": sprintf("%.1f", [adjusted_reputation_score]),
    }
}

# ============================================================
# Decision
# ============================================================
decision := {"allowed": true, "headers": rate_limit_headers} {
    allow
    deny == set()
}

decision := {"allowed": false, "deny_reasons": deny} {
    deny != []
}
