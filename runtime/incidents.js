'use strict';

const { uuidV4FromSeed } = require('./anomalies');

const STATES = Object.freeze([
    'DETECTE',
    'OUVERT',
    'EN_ANALYSE',
    'EN_CORRECTION',
    'EN_VALIDATION',
    'RESOLU',
    'CLOS'
]);

const ALLOWED_TRANSITIONS = Object.freeze({
    DETECTE: ['OUVERT', 'CLOS'],
    OUVERT: ['EN_ANALYSE'],
    EN_ANALYSE: ['EN_CORRECTION'],
    EN_CORRECTION: ['EN_VALIDATION'],
    EN_VALIDATION: ['RESOLU'],
    RESOLU: ['CLOS'],
    CLOS: []
});

const MIN_SIMILAR_FACTS = 2;
const ACTOR_INTERNAL = 'watchdog-internal';

function nowUtc() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isKnownState(state) {
    return STATES.includes(state);
}

function canTransition(from, to) {
    return Boolean(from && to && ALLOWED_TRANSITIONS[from] && ALLOWED_TRANSITIONS[from].includes(to));
}

function publicIncidentRow(row) {
    if (!row) return null;
    return {
        incident_id: row.incident_id,
        flow_id: row.flow_id,
        clause_id: row.clause_id,
        error_signature: row.error_signature,
        correlation_key: row.correlation_key,
        state: row.state,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        last_event_id: row.last_event_id
    };
}

function publicLinkRow(row) {
    if (!row) return null;
    return {
        incident_id: row.incident_id,
        target_kind: row.target_kind,
        target_id: row.target_id,
        linked_at: row.linked_at
    };
}

function publicHistoryRow(row) {
    if (!row) return null;
    return {
        history_id: row.history_id,
        incident_id: row.incident_id,
        from_state: row.from_state,
        to_state: row.to_state,
        changed_at: row.changed_at,
        reason: row.reason,
        actor: row.actor
    };
}

function linkTarget(registry, incidentId, kind, targetId, at) {
    if (!incidentId || !kind || !targetId) return;
    registry.insertIncidentLink({
        incident_id: incidentId,
        target_kind: kind,
        target_id: targetId,
        linked_at: at
    });
}

function appendHistory(registry, incidentId, fromState, toState, at, reason, actor) {
    registry.insertIncidentHistory({
        history_id: uuidV4FromSeed(`hist:${incidentId}:${fromState || 'none'}:${toState}:${at}`),
        incident_id: incidentId,
        from_state: fromState,
        to_state: toState,
        changed_at: at,
        reason: reason || null,
        actor: actor || ACTOR_INTERNAL
    });
}

/**
 * Transition d'état. Historique obligatoire. Pas de saut hors graphe.
 * @returns {{ ok: boolean, error?: string, incident?: Object }}
 */
function transitionIncident(registry, incident, toState, options = {}) {
    if (!incident || !toState) {
        return { ok: false, error: 'invalid_transition' };
    }
    if (!isKnownState(toState)) {
        return { ok: false, error: 'unknown_state' };
    }
    if (!canTransition(incident.state, toState)) {
        return { ok: false, error: 'invalid_transition' };
    }
    const at = options.at || nowUtc();
    const actor = options.actor || ACTOR_INTERNAL;
    const reason = options.reason || null;
    const closedAt = toState === 'CLOS' ? at : null;
    registry.updateIncidentState(incident.incident_id, toState, closedAt, incident.last_event_id);
    appendHistory(registry, incident.incident_id, incident.state, toState, at, reason, actor);
    return { ok: true, incident: registry.getIncident(incident.incident_id) };
}

function openDetectedIncident(registry, event, anomaly, at) {
    const incidentId = uuidV4FromSeed(
        `incident:${anomaly.flow_id}:${anomaly.clause_id}:${anomaly.error_signature}:${event.event_id}`
    );
    registry.insertIncident({
        incident_id: incidentId,
        flow_id: anomaly.flow_id,
        clause_id: anomaly.clause_id,
        error_signature: anomaly.error_signature || null,
        correlation_key: anomaly.correlation_key,
        state: 'DETECTE',
        opened_at: at,
        last_event_id: event.event_id
    });
    appendHistory(registry, incidentId, null, 'DETECTE', at, 'correlated_similar_facts', ACTOR_INTERNAL);
    return registry.getIncident(incidentId);
}

/**
 * Corrélation flux : plusieurs faits similaires (même correlation_key) → 1 incident.
 * Distinct de l'anti-flap device Fleet (2 polls Balena). Pas de fenêtre temporelle inventée.
 * Un incident DETECTE se ferme tout seul si le flux revient au succès. Les états suivants restent manuels.
 * @returns {{ opened: number, linked: number, closed: number }}
 */
function applyEventToIncidents(registry, event, anomalyResult) {
    const stats = { opened: 0, linked: 0, closed: 0 };
    if (!registry || !event || !anomalyResult) return stats;
    const at = nowUtc();

    for (const row of anomalyResult.incrementedRows || []) {
        if (!row || Number(row.occurrence_count) < MIN_SIMILAR_FACTS) continue;
        let incident = registry.findActiveIncident(row.flow_id, row.correlation_key);
        if (!incident) {
            incident = openDetectedIncident(registry, event, row, at);
            stats.opened += 1;
            linkTarget(registry, incident.incident_id, 'anomaly', row.anomaly_id, at);
            if (row.previous_event_id) {
                linkTarget(registry, incident.incident_id, 'event', row.previous_event_id, at);
                stats.linked += 1;
            }
        }
        linkTarget(registry, incident.incident_id, 'event', event.event_id, at);
        registry.updateIncidentLastEvent(incident.incident_id, event.event_id);
        stats.linked += 1;
    }

    for (const row of anomalyResult.closedRows || []) {
        const incident = registry.findActiveIncident(row.flow_id, row.correlation_key);
        if (!incident || incident.state !== 'DETECTE') continue;
        const moved = transitionIncident(registry, incident, 'CLOS', {
            at,
            actor: ACTOR_INTERNAL,
            reason: 'flow_recovered'
        });
        if (moved.ok) stats.closed += 1;
    }

    return stats;
}

module.exports = {
    STATES,
    ALLOWED_TRANSITIONS,
    MIN_SIMILAR_FACTS,
    ACTOR_INTERNAL,
    isKnownState,
    canTransition,
    publicIncidentRow,
    publicLinkRow,
    publicHistoryRow,
    transitionIncident,
    applyEventToIncidents
};
