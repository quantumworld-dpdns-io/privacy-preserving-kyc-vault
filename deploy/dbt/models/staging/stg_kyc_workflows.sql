WITH source AS (
    SELECT * FROM {{ source('kyc_vault', 'kyc_workflows') }}
),

renamed AS (
    SELECT
        id AS workflow_id,
        user_id,
        workflow_type,
        status,
        initiated_at,
        completed_at,
        current_step,
        verification_method,
        risk_score,
        assigned_reviewer,
        notes,
        created_at,
        updated_at
    FROM source
)

SELECT * FROM renamed
