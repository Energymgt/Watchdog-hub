'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const SCHEMA_VERSION = 5;

function nowUtc() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function openRegistry(dbPath) {
    const resolved = path.resolve(dbPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });

    const db = new DatabaseSync(resolved, { timeout: 5000 });
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec(SCHEMA_SQL);

    const insertMigration = db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)');
    const getMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = ?');
    for (let version = 1; version <= SCHEMA_VERSION; version += 1) {
        if (!getMigration.get(version)) {
            insertMigration.run(version, nowUtc());
        }
    }

    const insertStmt = db.prepare(`
        INSERT INTO events (
            event_id, schema, flow_id, event_type, status, timestamp, ingested_at,
            source_id, connector_id, destination_id, execution_id, duration_ms, records,
            error_signature, correlation_key, producer, metadata_json, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const getStmt = db.prepare('SELECT * FROM events WHERE event_id = ?');
    const listStmt = db.prepare('SELECT * FROM events ORDER BY ingested_at DESC, event_id DESC LIMIT ?');
    const countStmt = db.prepare('SELECT COUNT(*) AS n FROM events');

    const insertAnomalyStmt = db.prepare(`
        INSERT INTO anomalies (
            anomaly_id, flow_id, clause_id, error_signature, status, opened_at, closed_at,
            last_event_id, occurrence_count, correlation_key
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `);
    const findOpenAnomalyStmt = db.prepare(`
        SELECT * FROM anomalies
        WHERE flow_id = ? AND clause_id = ? AND error_signature IS ? AND status = 'open'
        LIMIT 1
    `);
    const incrementAnomalyStmt = db.prepare(`
        UPDATE anomalies
        SET occurrence_count = occurrence_count + 1, last_event_id = ?
        WHERE anomaly_id = ?
    `);
    const closeOpenAnomaliesStmt = db.prepare(`
        UPDATE anomalies
        SET status = 'closed', closed_at = ?, last_event_id = ?
        WHERE flow_id = ? AND clause_id = ? AND status = 'open'
    `);
    const getAnomalyStmt = db.prepare('SELECT * FROM anomalies WHERE anomaly_id = ?');
    const listAnomaliesStmt = db.prepare('SELECT * FROM anomalies ORDER BY opened_at DESC, anomaly_id DESC LIMIT ?');
    const listAnomaliesByStatusStmt = db.prepare(
        'SELECT * FROM anomalies WHERE status = ? ORDER BY opened_at DESC, anomaly_id DESC LIMIT ?'
    );
    const countAnomaliesStmt = db.prepare('SELECT COUNT(*) AS n FROM anomalies');
    const countOpenAnomaliesStmt = db.prepare("SELECT COUNT(*) AS n FROM anomalies WHERE status = 'open'");
    const listOpenAnomaliesByClauseStmt = db.prepare(
        "SELECT * FROM anomalies WHERE flow_id = ? AND clause_id = ? AND status = 'open'"
    );

    const insertIncidentStmt = db.prepare(`
        INSERT INTO incidents (
            incident_id, flow_id, clause_id, error_signature, correlation_key,
            state, opened_at, closed_at, last_event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);
    const getIncidentStmt = db.prepare('SELECT * FROM incidents WHERE incident_id = ?');
    const findActiveIncidentStmt = db.prepare(`
        SELECT * FROM incidents
        WHERE flow_id = ? AND correlation_key = ? AND state != 'CLOS'
        ORDER BY opened_at DESC
        LIMIT 1
    `);
    const listIncidentsStmt = db.prepare('SELECT * FROM incidents ORDER BY opened_at DESC, incident_id DESC LIMIT ?');
    const listIncidentsByStateStmt = db.prepare(
        'SELECT * FROM incidents WHERE state = ? ORDER BY opened_at DESC, incident_id DESC LIMIT ?'
    );
    const updateIncidentStateStmt = db.prepare(`
        UPDATE incidents
        SET state = ?, closed_at = ?, last_event_id = COALESCE(?, last_event_id)
        WHERE incident_id = ?
    `);
    const updateIncidentLastEventStmt = db.prepare(
        'UPDATE incidents SET last_event_id = ? WHERE incident_id = ?'
    );
    const insertLinkStmt = db.prepare(`
        INSERT OR IGNORE INTO incident_links (incident_id, target_kind, target_id, linked_at)
        VALUES (?, ?, ?, ?)
    `);
    const listLinksStmt = db.prepare(
        'SELECT * FROM incident_links WHERE incident_id = ? ORDER BY linked_at ASC, target_id ASC'
    );
    const insertHistoryStmt = db.prepare(`
        INSERT INTO incident_state_history (
            history_id, incident_id, from_state, to_state, changed_at, reason, actor
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const listHistoryStmt = db.prepare(
        'SELECT * FROM incident_state_history WHERE incident_id = ? ORDER BY changed_at ASC, history_id ASC'
    );
    const countIncidentsStmt = db.prepare('SELECT COUNT(*) AS n FROM incidents');
    const countActiveIncidentsStmt = db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE state != 'CLOS'");
    const insertActionStmt = db.prepare(`
        INSERT INTO actions (
            action_id, incident_id, actor, kind, comment, to_state, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const listActionsStmt = db.prepare(
        'SELECT * FROM actions WHERE incident_id = ? ORDER BY created_at ASC, action_id ASC'
    );
    const getActionStmt = db.prepare('SELECT * FROM actions WHERE action_id = ?');
    const countActionsStmt = db.prepare('SELECT COUNT(*) AS n FROM actions');
    const latestEventForFlowStmt = db.prepare(
        'SELECT * FROM events WHERE flow_id = ? ORDER BY timestamp DESC, ingested_at DESC LIMIT 1'
    );
    const listOpenAnomaliesForFlowStmt = db.prepare(
        "SELECT * FROM anomalies WHERE flow_id = ? AND status = 'open'"
    );
    const listActiveIncidentsForFlowStmt = db.prepare(
        "SELECT * FROM incidents WHERE flow_id = ? AND state != 'CLOS' ORDER BY opened_at DESC"
    );
    const insertResolutionStmt = db.prepare(`
        INSERT INTO resolutions (resolution_id, incident_id, actor, comment, validated_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    const listResolutionsStmt = db.prepare(
        'SELECT * FROM resolutions WHERE incident_id = ? ORDER BY validated_at ASC, resolution_id ASC'
    );
    const countResolutionsStmt = db.prepare('SELECT COUNT(*) AS n FROM resolutions');

    function insertEvent(event, payloadJson) {
        const ingestedAt = nowUtc();
        try {
            insertStmt.run(
                event.event_id,
                event.schema,
                event.flow_id,
                event.event_type,
                event.status,
                event.timestamp,
                ingestedAt,
                event.source_id,
                event.connector_id,
                event.destination_id,
                event.execution_id ?? null,
                event.duration_ms ?? null,
                event.records ?? null,
                event.error_signature ?? null,
                event.correlation_key ?? null,
                event.producer ?? null,
                event.metadata === undefined ? null : JSON.stringify(event.metadata),
                payloadJson
            );
            return { outcome: 'inserted', ingestedAt };
        } catch (err) {
            const msg = String(err && err.message ? err.message : err);
            if (!msg.includes('UNIQUE')) {
                throw err;
            }
            const existing = getStmt.get(event.event_id);
            if (!existing) {
                throw err;
            }
            if (existing.payload_json === payloadJson) {
                return { outcome: 'duplicate', ingestedAt: existing.ingested_at };
            }
            return { outcome: 'conflict', ingestedAt: existing.ingested_at };
        }
    }

    function getEvent(eventId) {
        return getStmt.get(eventId) || null;
    }

    function listEvents(limit) {
        const n = Number.isInteger(limit) ? limit : 20;
        const capped = Math.min(Math.max(n, 1), 100);
        return listStmt.all(capped);
    }

    function insertAnomaly(row) {
        insertAnomalyStmt.run(
            row.anomaly_id,
            row.flow_id,
            row.clause_id,
            row.error_signature ?? null,
            row.status,
            row.opened_at,
            row.last_event_id ?? null,
            row.occurrence_count ?? 1,
            row.correlation_key ?? null
        );
        return row;
    }

    function findOpenAnomaly(flowId, clauseId, errorSignature) {
        return findOpenAnomalyStmt.get(flowId, clauseId, errorSignature ?? null) || null;
    }

    function incrementAnomaly(anomalyId, eventId) {
        incrementAnomalyStmt.run(eventId, anomalyId);
    }

    function closeOpenAnomalies(flowId, clauseId, eventId, closedAt) {
        const openRows = listOpenAnomaliesByClauseStmt.all(flowId, clauseId);
        if (!openRows.length) return [];
        closeOpenAnomaliesStmt.run(closedAt, eventId, flowId, clauseId);
        return openRows;
    }

    function getAnomaly(anomalyId) {
        return getAnomalyStmt.get(anomalyId) || null;
    }

    function listAnomalies(options = {}) {
        const n = Number.isInteger(options.limit) ? options.limit : 20;
        const capped = Math.min(Math.max(n, 1), 100);
        if (options.status === 'open' || options.status === 'closed') {
            return listAnomaliesByStatusStmt.all(options.status, capped);
        }
        return listAnomaliesStmt.all(capped);
    }

    function insertIncident(row) {
        insertIncidentStmt.run(
            row.incident_id,
            row.flow_id,
            row.clause_id,
            row.error_signature ?? null,
            row.correlation_key,
            row.state,
            row.opened_at,
            row.last_event_id ?? null
        );
        return row;
    }

    function getIncident(incidentId) {
        return getIncidentStmt.get(incidentId) || null;
    }

    function findActiveIncident(flowId, correlationKey) {
        return findActiveIncidentStmt.get(flowId, correlationKey) || null;
    }

    function listIncidents(options = {}) {
        const n = Number.isInteger(options.limit) ? options.limit : 20;
        const capped = Math.min(Math.max(n, 1), 100);
        if (options.state) {
            return listIncidentsByStateStmt.all(options.state, capped);
        }
        return listIncidentsStmt.all(capped);
    }

    function updateIncidentState(incidentId, state, closedAt, lastEventId) {
        updateIncidentStateStmt.run(state, closedAt ?? null, lastEventId ?? null, incidentId);
    }

    function updateIncidentLastEvent(incidentId, eventId) {
        updateIncidentLastEventStmt.run(eventId, incidentId);
    }

    function insertIncidentLink(row) {
        insertLinkStmt.run(row.incident_id, row.target_kind, row.target_id, row.linked_at);
    }

    function listIncidentLinks(incidentId) {
        return listLinksStmt.all(incidentId);
    }

    function insertIncidentHistory(row) {
        insertHistoryStmt.run(
            row.history_id,
            row.incident_id,
            row.from_state ?? null,
            row.to_state,
            row.changed_at,
            row.reason ?? null,
            row.actor
        );
    }

    function listIncidentHistory(incidentId) {
        return listHistoryStmt.all(incidentId);
    }

    function insertAction(row) {
        insertActionStmt.run(
            row.action_id,
            row.incident_id,
            row.actor,
            row.kind,
            row.comment ?? null,
            row.to_state ?? null,
            row.created_at
        );
        return row;
    }

    function listActions(incidentId) {
        return listActionsStmt.all(incidentId);
    }

    function getAction(actionId) {
        return getActionStmt.get(actionId) || null;
    }

    function getLatestEventForFlow(flowId) {
        return latestEventForFlowStmt.get(flowId) || null;
    }

    function listOpenAnomaliesForFlow(flowId) {
        return listOpenAnomaliesForFlowStmt.all(flowId);
    }

    function listActiveIncidentsForFlow(flowId) {
        return listActiveIncidentsForFlowStmt.all(flowId);
    }

    function insertResolution(row) {
        insertResolutionStmt.run(
            row.resolution_id,
            row.incident_id,
            row.actor,
            row.comment,
            row.validated_at
        );
        return row;
    }

    function listResolutions(incidentId) {
        return listResolutionsStmt.all(incidentId);
    }

    function health() {
        const events = countStmt.get();
        const anomalies = countAnomaliesStmt.get();
        const open = countOpenAnomaliesStmt.get();
        const incidents = countIncidentsStmt.get();
        const active = countActiveIncidentsStmt.get();
        const actions = countActionsStmt.get();
        const resolutions = countResolutionsStmt.get();
        return {
            ok: true,
            registry: 'sqlite',
            path: resolved,
            events: events ? events.n : 0,
            anomalies: anomalies ? anomalies.n : 0,
            anomalies_open: open ? open.n : 0,
            incidents: incidents ? incidents.n : 0,
            incidents_active: active ? active.n : 0,
            actions: actions ? actions.n : 0,
            resolutions: resolutions ? resolutions.n : 0
        };
    }

    function close() {
        db.close();
    }

    return {
        path: resolved,
        insertEvent,
        getEvent,
        listEvents,
        insertAnomaly,
        findOpenAnomaly,
        incrementAnomaly,
        closeOpenAnomalies,
        getAnomaly,
        listAnomalies,
        insertIncident,
        getIncident,
        findActiveIncident,
        listIncidents,
        updateIncidentState,
        updateIncidentLastEvent,
        insertIncidentLink,
        listIncidentLinks,
        insertIncidentHistory,
        listIncidentHistory,
        insertAction,
        listActions,
        getAction,
        getLatestEventForFlow,
        listOpenAnomaliesForFlow,
        listActiveIncidentsForFlow,
        insertResolution,
        listResolutions,
        health,
        close
    };
}

module.exports = {
    SCHEMA_VERSION,
    openRegistry
};
