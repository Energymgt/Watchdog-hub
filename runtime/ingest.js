'use strict';

const { validateWatchdogEvent } = require('../contracts/validate-event-v1');
const { loadHealthContracts } = require('./health-contracts');
const { applyEventToAnomalies } = require('./anomalies');
const { applyEventToIncidents } = require('./incidents');

/**
 * Valide, persiste, puis évalue anomalies puis incidents sur un insert nouveau.
 * Un throw aval n'échoue jamais l'ingest.
 */
function ingestEvent(registry, schema, event, options = {}) {
    const check = validateWatchdogEvent(event, schema);
    if (!check.ok) {
        return { ok: false, status: 400, error: 'validation_failed', errors: check.errors };
    }

    const payloadJson = JSON.stringify(event);
    const result = registry.insertEvent(event, payloadJson);

    if (result.outcome === 'inserted') {
        try {
            const contracts = options.contracts || loadHealthContracts();
            const anomalyResult = applyEventToAnomalies(registry, event, contracts);
            try {
                applyEventToIncidents(registry, event, anomalyResult);
            } catch {
                /* l'incident ne bloque pas l'événement ni l'anomalie */
            }
        } catch {
            /* fire-and-forget : l'événement reste la source de vérité */
        }
        return {
            ok: true,
            status: 201,
            duplicate: false,
            event_id: event.event_id,
            ingested_at: result.ingestedAt
        };
    }

    if (result.outcome === 'duplicate') {
        return {
            ok: true,
            status: 200,
            duplicate: true,
            event_id: event.event_id,
            ingested_at: result.ingestedAt
        };
    }

    return {
        ok: false,
        status: 409,
        error: 'event_id_conflict',
        event_id: event.event_id
    };
}

function publicEventRow(row) {
    if (!row) return null;
    let payload = null;
    try {
        payload = JSON.parse(row.payload_json);
    } catch {
        payload = null;
    }
    return {
        event_id: row.event_id,
        schema: row.schema,
        flow_id: row.flow_id,
        event_type: row.event_type,
        status: row.status,
        timestamp: row.timestamp,
        ingested_at: row.ingested_at,
        source_id: row.source_id,
        connector_id: row.connector_id,
        destination_id: row.destination_id,
        execution_id: row.execution_id,
        duration_ms: row.duration_ms,
        records: row.records,
        error_signature: row.error_signature,
        correlation_key: row.correlation_key,
        producer: row.producer,
        payload
    };
}

function publicAnomalyRow(row) {
    if (!row) return null;
    return {
        anomaly_id: row.anomaly_id,
        flow_id: row.flow_id,
        clause_id: row.clause_id,
        error_signature: row.error_signature,
        status: row.status,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        last_event_id: row.last_event_id,
        occurrence_count: row.occurrence_count,
        correlation_key: row.correlation_key
    };
}

module.exports = {
    ingestEvent,
    publicEventRow,
    publicAnomalyRow
};
