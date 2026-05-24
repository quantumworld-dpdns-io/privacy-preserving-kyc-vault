WITH verifications AS (
    SELECT * FROM {{ ref('fct_verifications') }}
),

billing_calc AS (
    SELECT
        {{ dbt_utils.generate_surrogate_key(['platform_key', 'DATE_TRUNC(\'month\', verified_at)']) }} AS billing_key,
        platform_key,
        DATE_TRUNC('month', verified_at) AS billing_month,
        COUNT(*) AS total_verifications,
        SUM(CASE WHEN verification_status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN verification_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN verification_status = 'approved' THEN 1 ELSE 0 END) * 0.50 AS revenue_estimated,
        COUNT(DISTINCT credential_id) AS unique_credentials
    FROM verifications
    WHERE verified_at IS NOT NULL
    GROUP BY platform_key, DATE_TRUNC('month', verified_at)
)

SELECT * FROM billing_calc
