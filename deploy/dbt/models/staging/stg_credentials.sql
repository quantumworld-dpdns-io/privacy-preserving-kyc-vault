WITH source AS (
    SELECT * FROM {{ source('kyc_vault', 'credentials') }}
),

renamed AS (
    SELECT
        id AS credential_id,
        platform_user_id,
        platform,
        credential_type,
        status,
        issued_at,
        expires_at,
        verified_at,
        revoked_at,
        is_revoked,
        metadata,
        created_at,
        updated_at,
        ingested_at
    FROM source
)

SELECT * FROM renamed
