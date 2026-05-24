CREATE TYPE kyc_workflow_status AS ENUM (
    'initiated', 'pending_documents', 'submitted', 'in_review',
    'approved', 'rejected', 'escalated', 'expired'
);

CREATE TYPE kyc_workflow_event_type AS ENUM (
    'created', 'document_uploaded', 'submitted', 'review_started',
    'approved', 'rejected', 'escalated', 'expired', 'comment_added',
    'document_requested', 'resubmitted'
);

CREATE TABLE IF NOT EXISTS kyc_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_did VARCHAR(512) NOT NULL,
    schema_id UUID NOT NULL,
    platform_id UUID NOT NULL,
    status kyc_workflow_status NOT NULL DEFAULT 'initiated',
    tier VARCHAR(64) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kyc_workflows_user ON kyc_workflows (user_did);
CREATE INDEX idx_kyc_workflows_platform ON kyc_workflows (platform_id);
CREATE INDEX idx_kyc_workflows_status ON kyc_workflows (status);
CREATE INDEX idx_kyc_workflows_tier ON kyc_workflows (tier);
CREATE INDEX idx_kyc_workflows_created ON kyc_workflows (created_at);

CREATE TABLE IF NOT EXISTS kyc_workflow_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES kyc_workflows(id) ON DELETE CASCADE,
    event_type kyc_workflow_event_type NOT NULL,
    actor_did VARCHAR(512),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kyc_workflow_events_workflow ON kyc_workflow_events (workflow_id);
CREATE INDEX idx_kyc_workflow_events_created ON kyc_workflow_events (created_at);
