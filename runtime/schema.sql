-- Registre Watchdog-Fleet
-- events + anomalies + incidents + actions + resolutions. Aucune donnée métier.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    event_id TEXT PRIMARY KEY,
    schema TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    ingested_at TEXT NOT NULL,
    source_id TEXT NOT NULL,
    connector_id TEXT NOT NULL,
    destination_id TEXT NOT NULL,
    execution_id TEXT,
    duration_ms INTEGER,
    records INTEGER,
    error_signature TEXT,
    correlation_key TEXT,
    producer TEXT,
    metadata_json TEXT,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_ingested_at ON events (ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_flow_timestamp ON events (flow_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS anomalies (
    anomaly_id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    clause_id TEXT NOT NULL,
    error_signature TEXT,
    status TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    last_event_id TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    correlation_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomalies_flow_status ON anomalies (flow_id, status);
CREATE INDEX IF NOT EXISTS idx_anomalies_opened_at ON anomalies (opened_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    incident_id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    clause_id TEXT NOT NULL,
    error_signature TEXT,
    correlation_key TEXT NOT NULL,
    state TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    last_event_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_flow_state ON incidents (flow_id, state);
CREATE INDEX IF NOT EXISTS idx_incidents_opened_at ON incidents (opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_correlation ON incidents (correlation_key, state);

CREATE TABLE IF NOT EXISTS incident_links (
    incident_id TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    PRIMARY KEY (incident_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_links_target ON incident_links (target_kind, target_id);

CREATE TABLE IF NOT EXISTS incident_state_history (
    history_id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    reason TEXT,
    actor TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incident_history_incident ON incident_state_history (incident_id, changed_at);

CREATE TABLE IF NOT EXISTS actions (
    action_id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    kind TEXT NOT NULL,
    comment TEXT,
    to_state TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actions_incident ON actions (incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS resolutions (
    resolution_id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    comment TEXT NOT NULL,
    validated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resolutions_incident ON resolutions (incident_id, validated_at DESC);
