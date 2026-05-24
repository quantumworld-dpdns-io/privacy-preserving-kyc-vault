CREATE TYPE fl_round_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'aborted');

CREATE TABLE IF NOT EXISTS federated_learning_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_number INTEGER NOT NULL,
    model_name VARCHAR(256) NOT NULL,
    model_version VARCHAR(64) NOT NULL,
    status fl_round_status NOT NULL DEFAULT 'pending',
    global_model_hash VARCHAR(128),
    global_model_path TEXT,
    total_clients INTEGER NOT NULL DEFAULT 0,
    participating_clients INTEGER NOT NULL DEFAULT 0,
    aggregation_algorithm VARCHAR(128) NOT NULL DEFAULT 'fed_avg',
    hyperparameters JSONB DEFAULT '{}'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (model_name, round_number)
);

CREATE INDEX idx_fl_rounds_model ON federated_learning_rounds (model_name, model_version);
CREATE INDEX idx_fl_rounds_status ON federated_learning_rounds (status);
CREATE INDEX idx_fl_rounds_round ON federated_learning_rounds (round_number);

CREATE TABLE IF NOT EXISTS fl_client_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES federated_learning_rounds(id) ON DELETE CASCADE,
    client_id VARCHAR(256) NOT NULL,
    client_model_hash VARCHAR(128),
    client_model_path TEXT,
    data_metrics JSONB DEFAULT '{}'::jsonb,
    data_size INTEGER,
    training_duration_seconds NUMERIC(12, 4),
    encryption_proof TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (round_id, client_id)
);

CREATE INDEX idx_fl_client_contributions_round ON fl_client_contributions (round_id);
CREATE INDEX idx_fl_client_contributions_client ON fl_client_contributions (client_id);

CREATE TABLE IF NOT EXISTS fl_model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(256) NOT NULL,
    model_version VARCHAR(64) NOT NULL,
    round_id UUID REFERENCES federated_learning_rounds(id),
    model_hash VARCHAR(128) NOT NULL,
    model_path TEXT NOT NULL,
    metrics JSONB DEFAULT '{}'::jsonb,
    is_production BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (model_name, model_version)
);

CREATE INDEX idx_fl_model_versions_name ON fl_model_versions (model_name);
CREATE INDEX idx_fl_model_versions_production ON fl_model_versions (is_production) WHERE is_production = true;
