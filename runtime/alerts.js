'use strict';

const { uuidV4FromSeed } = require('./anomalies');
const { MIN_SIMILAR_FACTS } = require('./incidents');
const { enqueueDelivery } = require('./alert-delivery');

/**
 * Alerte = notification liée à une source déjà décidée par un moteur existant.
 * Ne change pas le cycle d'un incident et ne recalcule ni anomalie, ni incident, ni état d'appareil.
 *
 * Politique d'aggravation : sur la même alerte active, une hausse high → critical
 * met à jour la gravité, ajoute un historique `aggravation` et une livraison Teams.
 * Le statut, l'acteur, l'horodatage d'accusé et les lignes d'historique déjà écrites restent.
 */

const ALERT_STATUSES = Object.freeze(['open', 'acknowledged', 'closed']);
const SEVERITIES = Object.freeze(['critical', 'high']);
const SEVERITY_RANK = Object.freeze({ high: 1, critical: 2 });
const FAULT_SEVERITY = Object.freeze({
    dead: 'critical',
    heartbeat_missing: 'high',
    cloud_down: 'high',
    unknown_online: 'high'
});
const ACTOR_INTERNAL = 'watchdog-internal';

function nowUtc() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isUniqueError(err) {
    return String(err && err.message ? err.message : err).includes('UNIQUE');
}

function normalizeActor(raw) {
    const actor = String(raw || '').trim();
    if (!actor || actor.length > 64) return null;
    return actor;
}

function clip(value, max) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.slice(0, max);
}

function publicDeliveryRow(row) {
    if (!row) return null;
    return {
        delivery_id: row.delivery_id,
        alert_id: row.alert_id,
        history_id: row.history_id,
        channel: row.channel,
        event_type: row.event_type,
        status: row.status,
        attempt: row.attempt,
        http_status: row.http_status,
        error_kind: row.error_kind,
        possible_duplicate: Number(row.possible_duplicate) === 1,
        created_at: row.created_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
        next_attempt_at: row.next_attempt_at
    };
}

function latestDelivery(rows) {
    if (!rows || !rows.length) return null;
    return publicDeliveryRow(rows[rows.length - 1]);
}

function publicHistoryRow(row) {
    if (!row) return null;
    return {
        history_id: row.history_id,
        alert_id: row.alert_id,
        event_type: row.event_type,
        from_status: row.from_status,
        to_status: row.to_status,
        from_severity: row.from_severity,
        to_severity: row.to_severity,
        device_state: row.device_state,
        actor: row.actor,
        reason: row.reason,
        at: row.at
    };
}

function publicAlertRow(row, deliveries) {
    if (!row) return null;
    return {
        alert_id: row.alert_id,
        plan: row.plan,
        source_kind: row.source_kind,
        source_id: row.source_id,
        correlation_key: row.correlation_key,
        dedup_key: row.dedup_key,
        status: row.status,
        severity: row.severity,
        device_state: row.device_state,
        flow_id: row.flow_id,
        incident_id: row.incident_id,
        subject_name: row.subject_name,
        detail: row.detail,
        opened_at: row.opened_at,
        updated_at: row.updated_at,
        acknowledged_at: row.acknowledged_at,
        acknowledged_by: row.acknowledged_by,
        closed_at: row.closed_at,
        close_reason: row.close_reason,
        latest_delivery: latestDelivery(deliveries)
    };
}

function appendHistory(registry, alert, eventType, patch, at, actor, reason) {
    const history = {
        history_id: uuidV4FromSeed(
            `ahist:${alert.alert_id}:${eventType}:${at}:${patch.to_severity || ''}:${patch.device_state || ''}:${reason || ''}`
        ),
        alert_id: alert.alert_id,
        event_type: eventType,
        from_status: alert.status,
        to_status: patch.status || alert.status,
        from_severity: alert.severity,
        to_severity: patch.severity || alert.severity,
        device_state: patch.device_state || alert.device_state || null,
        actor: actor || ACTOR_INTERNAL,
        reason: reason || null,
        at
    };
    registry.insertAlertHistory(history);
    return history;
}

function openFlowAlert(registry, incident) {
    if (!registry || !incident || !incident.incident_id || !incident.correlation_key) {
        return { created: false, alert: null };
    }
    const dedupKey = `flow:${incident.correlation_key}`;
    const at = nowUtc();
    try {
        return registry.transaction(() => {
            const existing = registry.findActiveAlert(dedupKey);
            if (existing) return { created: false, alert: existing };
            const alert = {
                alert_id: uuidV4FromSeed(`alert:flow:${incident.incident_id}`),
                plan: 'flow',
                source_kind: 'incident',
                source_id: incident.incident_id,
                correlation_key: incident.correlation_key,
                dedup_key: dedupKey,
                status: 'open',
                severity: 'high',
                device_state: null,
                flow_id: incident.flow_id,
                incident_id: incident.incident_id,
                subject_name: incident.flow_id,
                detail: incident.error_signature || incident.clause_id || incident.correlation_key,
                opened_at: at,
                updated_at: at,
                acknowledged_at: null,
                acknowledged_by: null,
                closed_at: null,
                close_reason: null
            };
            registry.insertAlert(alert);
            const history = appendHistory(registry, alert, 'trigger', { status: 'open', severity: 'high' }, at, ACTOR_INTERNAL, 'incident_detecte');
            enqueueDelivery(registry, alert, history, 'trigger', { at });
            return { created: true, alert: registry.getAlert(alert.alert_id) };
        });
    } catch (err) {
        if (!isUniqueError(err)) throw err;
        return { created: false, alert: registry.findActiveAlert(dedupKey) };
    }
}

/**
 * Ferme l'alerte active de la clé de corrélation.
 * Le dossier incident n'est pas modifié : la récupération technique et la résolution manuelle restent distinctes.
 */
function closeFlowAlert(registry, source) {
    if (!registry || !source || !source.correlation_key) return { closed: false, alert: null };
    const dedupKey = `flow:${source.correlation_key}`;
    const at = nowUtc();
    return registry.transaction(() => {
        const existing = registry.findActiveAlert(dedupKey);
        if (!existing) return { closed: false, alert: null };
        const next = Object.assign({}, existing, {
            status: 'closed',
            updated_at: at,
            closed_at: at,
            close_reason: source.reason || 'flow_recovered'
        });
        registry.saveAlert(next);
        const history = appendHistory(
            registry,
            existing,
            'recovery',
            { status: 'closed' },
            at,
            ACTOR_INTERNAL,
            next.close_reason
        );
        enqueueDelivery(registry, next, history, 'recovery', { at });
        return { closed: true, alert: registry.getAlert(existing.alert_id) };
    });
}

function syncFlowAlerts(registry, anomalyResult) {
    const stats = { opened: 0, closed: 0 };
    if (!registry || !anomalyResult) return stats;
    for (const row of anomalyResult.incrementedRows || []) {
        if (!row || Number(row.occurrence_count) < MIN_SIMILAR_FACTS) continue;
        const incident = registry.findActiveIncident(row.flow_id, row.correlation_key);
        if (!incident) continue;
        const opened = openFlowAlert(registry, incident);
        if (opened.created) stats.opened += 1;
    }
    for (const row of anomalyResult.closedRows || []) {
        if (!row || !row.correlation_key) continue;
        const closed = closeFlowAlert(registry, {
            flow_id: row.flow_id,
            correlation_key: row.correlation_key,
            reason: 'flow_recovered'
        });
        if (closed.closed) stats.closed += 1;
    }
    return stats;
}

function normalizeSignalId(raw) {
    const text = String(raw || '').trim();
    if (!text || text.length > 200 || !/^[A-Za-z0-9:._|-]+$/.test(text)) return '';
    return text;
}

function duplicateSignal(registry, signalId) {
    if (!signalId) return null;
    const prior = registry.getAlertSignal(signalId);
    if (!prior) return null;
    return {
        outcome: prior.outcome,
        reason: 'duplicate_signal',
        duplicate: true,
        signal_id: signalId,
        alert: prior.alert_id ? registry.getAlert(prior.alert_id) : null
    };
}

function rememberSignal(registry, signalId, outcome, alert) {
    if (!signalId) return { outcome, alert: alert || null, signal_id: null };
    const duplicate = duplicateSignal(registry, signalId);
    if (duplicate) return duplicate;
    registry.insertAlertSignal({
        signal_id: signalId,
        alert_id: alert ? alert.alert_id : null,
        outcome,
        received_at: nowUtc()
    });
    return { outcome, alert: alert || null, signal_id: signalId };
}

function applyDeviceTransition(registry, transition, retried) {
    const signalId = normalizeSignalId(transition && transition.signal_id);
    function reject(reason) {
        return registry.transaction(() => {
            const duplicate = duplicateSignal(registry, signalId);
            if (duplicate) return duplicate;
            return Object.assign(rememberSignal(registry, signalId, 'rejected', null), { reason });
        });
    }

    if (!transition || transition.confirmed !== true) return reject('not_confirmed');
    const uuid = clip(transition.uuid, 128);
    if (!uuid || /[\s/?#]/.test(uuid)) return reject('invalid_device');
    const to = clip(transition.to, 64);
    if (!to || to === 'unknown' || transition.severity === 'unknown') return reject('not_notifiable');
    const dedupKey = `device:${uuid}`;
    const at = nowUtc();
    const name = clip(transition.name, 200) || uuid;
    const detail = clip(transition.detail, 500);

    if (to === 'ok' || transition.direction === 'up') {
        return registry.transaction(() => {
            const duplicate = duplicateSignal(registry, signalId);
            if (duplicate) return duplicate;
            const existing = registry.findActiveAlert(dedupKey);
            if (!existing) {
                return Object.assign(rememberSignal(registry, signalId, 'ignored', null), { reason: 'no_active_alert' });
            }
            const next = Object.assign({}, existing, {
                status: 'closed',
                device_state: 'ok',
                subject_name: name,
                detail: detail || existing.detail,
                updated_at: at,
                closed_at: at,
                close_reason: 'device_recovered'
            });
            registry.saveAlert(next);
            const history = appendHistory(
                registry,
                existing,
                'recovery',
                { status: 'closed', device_state: 'ok' },
                at,
                ACTOR_INTERNAL,
                'device_recovered'
            );
            enqueueDelivery(registry, next, history, 'recovery', { at });
            return rememberSignal(registry, signalId, 'closed', registry.getAlert(existing.alert_id));
        });
    }

    const severity = FAULT_SEVERITY[to];
    if (!severity) return reject('not_notifiable');

    try {
        return registry.transaction(() => {
            const duplicate = duplicateSignal(registry, signalId);
            if (duplicate) return duplicate;
            const existing = registry.findActiveAlert(dedupKey);
            if (!existing) {
                const alert = {
                    alert_id: uuidV4FromSeed(`alert:device:${uuid}:${to}:${at}`),
                    plan: 'device',
                    source_kind: 'device',
                    source_id: uuid,
                    correlation_key: null,
                    dedup_key: dedupKey,
                    status: 'open',
                    severity,
                    device_state: to,
                    flow_id: null,
                    incident_id: null,
                    subject_name: name,
                    detail,
                    opened_at: at,
                    updated_at: at,
                    acknowledged_at: null,
                    acknowledged_by: null,
                    closed_at: null,
                    close_reason: null
                };
                registry.insertAlert(alert);
                const history = appendHistory(
                    registry,
                    alert,
                    'trigger',
                    { status: 'open', severity, device_state: to },
                    at,
                    ACTOR_INTERNAL,
                    'device_confirmed'
                );
                enqueueDelivery(registry, alert, history, 'trigger', { at });
                return rememberSignal(registry, signalId, 'opened', registry.getAlert(alert.alert_id));
            }
            if (existing.device_state === to && existing.severity === severity) {
                return rememberSignal(registry, signalId, 'unchanged', existing);
            }
            const aggravated = SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity];
            const next = Object.assign({}, existing, {
                severity: aggravated ? severity : existing.severity,
                device_state: to,
                subject_name: name,
                detail: detail || existing.detail,
                updated_at: at
            });
            registry.saveAlert(next);
            const eventType = aggravated ? 'aggravation' : 'state_change';
            const history = appendHistory(
                registry,
                existing,
                eventType,
                { severity: next.severity, device_state: to },
                at,
                ACTOR_INTERNAL,
                aggravated ? 'severity_increased' : 'state_changed'
            );
            if (aggravated) enqueueDelivery(registry, next, history, 'aggravation', { at });
            const saved = registry.getAlert(existing.alert_id);
            return rememberSignal(registry, signalId, aggravated ? 'aggravated' : 'updated', saved);
        });
    } catch (err) {
        if (isUniqueError(err) && !retried) return applyDeviceTransition(registry, transition, true);
        if (isUniqueError(err)) return { outcome: 'unchanged', alert: registry.findActiveAlert(dedupKey) };
        throw err;
    }
}

function applyDeviceTransitions(registry, transitions) {
    const results = [];
    const list = Array.isArray(transitions) ? transitions : [];
    for (const transition of list) {
        results.push(applyDeviceTransition(registry, transition));
    }
    return results;
}

function acknowledgeAlert(registry, alertId, actorRaw) {
    const actor = normalizeActor(actorRaw);
    if (!actor) return { ok: false, status: 400, error: 'actor_required' };
    const at = nowUtc();
    return registry.transaction(() => {
        const alert = registry.getAlert(alertId);
        if (!alert) return { ok: false, status: 404, error: 'not_found' };
        if (alert.status === 'closed') return { ok: false, status: 409, error: 'alert_closed' };
        if (alert.status === 'acknowledged') {
            return { ok: true, status: 200, duplicate: true, alert };
        }
        const next = Object.assign({}, alert, {
            status: 'acknowledged',
            updated_at: at,
            acknowledged_at: at,
            acknowledged_by: actor
        });
        registry.saveAlert(next);
        appendHistory(registry, alert, 'acknowledge', { status: 'acknowledged' }, at, actor, 'acknowledged');
        return { ok: true, status: 200, duplicate: false, alert: registry.getAlert(alertId) };
    });
}

function alertDetail(registry, alertId) {
    const alert = registry.getAlert(alertId);
    if (!alert) return null;
    const history = registry.listAlertHistory(alertId).map(publicHistoryRow);
    const deliveries = registry.listAlertDeliveries(alertId).map(publicDeliveryRow);
    return {
        alert: publicAlertRow(alert, registry.listAlertDeliveries(alertId)),
        history,
        deliveries
    };
}

module.exports = {
    ALERT_STATUSES,
    SEVERITIES,
    FAULT_SEVERITY,
    ACTOR_INTERNAL,
    publicAlertRow,
    publicHistoryRow,
    publicDeliveryRow,
    openFlowAlert,
    closeFlowAlert,
    syncFlowAlerts,
    applyDeviceTransition,
    applyDeviceTransitions,
    acknowledgeAlert,
    alertDetail
};
