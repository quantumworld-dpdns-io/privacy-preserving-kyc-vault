-- ============================================================
-- Seed Data
-- Privacy-Preserving KYC Vault
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Default Admin User (DID-based)
-- ============================================================
INSERT INTO did_registry (did, document_json, status, method, method_specific_id)
VALUES (
    'did:kyc:admin:00000000-0000-0000-0000-000000000001',
    '{
        "@context": "https://www.w3.org/ns/did/v1",
        "id": "did:kyc:admin:00000000-0000-0000-0000-000000000001",
        "verificationMethod": [{
            "id": "did:kyc:admin:00000000-0000-0000-0000-000000000001#key-1",
            "type": "Ed25519VerificationKey2020",
            "controller": "did:kyc:admin:00000000-0000-0000-0000-000000000001"
        }],
        "authentication": ["did:kyc:admin:00000000-0000-0000-0000-000000000001#key-1"],
        "service": [{
            "id": "did:kyc:admin:00000000-0000-0000-0000-000000000001#admin",
            "type": "AdminService",
            "serviceEndpoint": "https://api.kyc-vault.example/admin"
        }]
    }'::jsonb,
    'active',
    'kyc',
    'admin:00000000-0000-0000-0000-000000000001'
) ON CONFLICT (did) DO NOTHING;

-- ============================================================
-- 2. Default Platform
-- ============================================================
INSERT INTO platform_registry (name, api_key_hash, api_key_prefix, webhook_url, allowed_origins, tier, billing_plan, is_active)
VALUES (
    'Default Enterprise Platform',
    '$2a$12$LJ3m4ys3Lk0TSwHnbfOMgOn5HjCFIHtMOVw8pGWB1VFuWYZFQe8Si',
    'kyc_ep_',
    'https://webhook.example.com/kyc-events',
    ARRAY['https://app.example.com', 'https://admin.example.com'],
    'enterprise',
    'annual',
    true
) ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. Default Credential Schemas
-- ============================================================
INSERT INTO schema_registry (name, version, schema_json, schema_json_ld, status, description, author_did, is_latest)
VALUES
(
    'KYCBasisIdentity',
    1,
    '{
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "title": "KYC Basis Identity",
        "description": "Minimum KYC identity verification credential",
        "properties": {
            "firstName": {"type": "string"},
            "lastName": {"type": "string"},
            "dateOfBirth": {"type": "string", "format": "date"},
            "nationality": {"type": "string"}
        },
        "required": ["firstName", "lastName", "dateOfBirth"]
    }'::jsonb,
    '{
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "type": ["VerifiableCredential", "KYCBasisIdentityCredential"]
    }'::jsonb,
    'published',
    'Minimum KYC identity verification credential',
    'did:kyc:admin:00000000-0000-0000-0000-000000000001',
    true
),
(
    'KYCStandardIdentity',
    2,
    '{
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "title": "KYC Standard Identity",
        "description": "Standard KYC identity with address verification",
        "properties": {
            "firstName": {"type": "string"},
            "lastName": {"type": "string"},
            "dateOfBirth": {"type": "string", "format": "date"},
            "nationality": {"type": "string"},
            "address": {
                "type": "object",
                "properties": {
                    "street": {"type": "string"},
                    "city": {"type": "string"},
                    "postalCode": {"type": "string"},
                    "country": {"type": "string"}
                }
            },
            "phoneNumber": {"type": "string"},
            "email": {"type": "string", "format": "email"}
        },
        "required": ["firstName", "lastName", "dateOfBirth", "address"]
    }'::jsonb,
    '{
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "type": ["VerifiableCredential", "KYCStandardIdentityCredential"]
    }'::jsonb,
    'published',
    'Standard KYC identity with address verification',
    'did:kyc:admin:00000000-0000-0000-0000-000000000001',
    true
),
(
    'KYCEnhancedDueDiligence',
    3,
    '{
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "title": "KYC Enhanced Due Diligence",
        "description": "Enhanced due diligence for high-risk individuals",
        "allOf": [{"$ref": "#/definitions/standardIdentity"}],
        "properties": {
            "sourceOfFunds": {"type": "string"},
            "occupation": {"type": "string"},
            "employer": {"type": "string"},
            "taxResidency": {"type": "string"},
            "politicallyExposed": {"type": "boolean"},
            "sanctionsScreening": {
                "type": "object",
                "properties": {
                    "screenedAt": {"type": "string", "format": "date-time"},
                    "result": {"type": "string", "enum": ["clear", "hit", "pending"]}
                }
            }
        },
        "required": ["sourceOfFunds", "occupation"]
    }'::jsonb,
    '{
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "type": ["VerifiableCredential", "KYCEnhancedDueDiligenceCredential"]
    }'::jsonb,
    'draft',
    'Enhanced due diligence for high-risk individuals',
    'did:kyc:admin:00000000-0000-0000-0000-000000000001',
    true
) ON CONFLICT (name, version) DO NOTHING;

-- ============================================================
-- 4. Default KYC Tiers
-- ============================================================
INSERT INTO kyc_workflows (user_did, schema_id, platform_id, status, tier, metadata)
SELECT
    'did:kyc:admin:00000000-0000-0000-0000-000000000001',
    sr.id,
    pr.id,
    'approved',
    CASE sr.name
        WHEN 'KYCBasisIdentity' THEN 'basic'
        WHEN 'KYCStandardIdentity' THEN 'standard'
        WHEN 'KYCEnhancedDueDiligence' THEN 'enhanced'
    END,
    '{
        "description": "Default approved tier template",
        "limits": {"daily_transaction": 10000, "monthly_transaction": 100000}
    }'::jsonb
FROM schema_registry sr
CROSS JOIN platform_registry pr
WHERE sr.status = 'published' OR sr.name = 'KYCEnhancedDueDiligence'
  AND NOT EXISTS (
      SELECT 1 FROM kyc_workflows kw
      WHERE kw.tier = CASE sr.name
          WHEN 'KYCBasisIdentity' THEN 'basic'
          WHEN 'KYCStandardIdentity' THEN 'standard'
          WHEN 'KYCEnhancedDueDiligence' THEN 'enhanced'
      END
  );

-- ============================================================
-- 5. Default Billing Plans
-- ============================================================
INSERT INTO billing_records (platform_id, billing_period_start, billing_period_end, total_amount, currency, status, line_items)
SELECT
    pr.id,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 month',
    0,
    'USD',
    'paid',
    '{
        "plan": "enterprise_annual",
        "items": [
            {"description": "Setup fee", "amount": 0, "currency": "USD"}
        ],
        "discounts": [],
        "taxes": []
    }'::jsonb
FROM platform_registry pr
WHERE NOT EXISTS (
    SELECT 1 FROM billing_records br WHERE br.platform_id = pr.id
);

-- ============================================================
-- 6. Default Consent Record (admin consent to platform)
-- ============================================================
INSERT INTO consent_records (user_did, platform_id, data_categories, purpose, status, consent_version, consent_hash)
SELECT
    'did:kyc:admin:00000000-0000-0000-0000-000000000001',
    pr.id,
    ARRAY['identity', 'contact', 'analytics']::data_category[],
    'Administrative access and platform management',
    'granted',
    'v1.0',
    encode(sha256('admin-consent-default-v1.0'::BYTEA), 'hex')
FROM platform_registry pr
WHERE NOT EXISTS (
    SELECT 1 FROM consent_records cr WHERE cr.platform_id = pr.id
);

COMMIT;
