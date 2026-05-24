WITH source AS (
    SELECT * FROM {{ ref('stg_credentials') }}
),

platforms AS (
    SELECT DISTINCT
        platform AS platform_id,
        platform AS platform_name,
        LAST_VALUE(credential_type) OVER (
            PARTITION BY platform
            ORDER BY ingested_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS latest_credential_type
    FROM source
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['platform_id']) }} AS platform_key,
    platform_id,
    platform_name,
    latest_credential_type,
    CURRENT_TIMESTAMP AS loaded_at
FROM platforms
