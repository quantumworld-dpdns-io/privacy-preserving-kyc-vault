WITH credentials AS (
    SELECT * FROM {{ ref('stg_credentials') }}
),

platform AS (
    SELECT * FROM {{ ref('dim_platform') }}
),

verifications AS (
    SELECT
        {{ dbt_utils.generate_surrogate_key(['credential_id', 'verified_at']) }} AS verification_key,
        credential_id,
        platform.platform_key,
        credentials.status AS verification_status,
        credentials.verified_at,
        credentials.issued_at,
        credentials.expires_at,
        DATE_PART('day', credentials.verified_at - credentials.issued_at) AS days_to_verify,
        CASE
            WHEN credentials.expires_at IS NOT NULL
                AND credentials.expires_at < CURRENT_TIMESTAMP THEN 'expired'
            WHEN credentials.is_revoked THEN 'revoked'
            ELSE 'active'
        END AS credential_lifecycle_status,
        credentials.metadata
    FROM credentials
    LEFT JOIN platform
        ON credentials.platform = platform.platform_id
)

SELECT * FROM verifications
