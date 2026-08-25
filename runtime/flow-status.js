'use strict';

const CONFIRMED_DOWN = Object.freeze([
    'OUVERT',
    'EN_ANALYSE',
    'EN_CORRECTION',
    'EN_VALIDATION'
]);

/**
 * État de flux calculé, jamais saisi.
 * unknown / ok / degraded / down. Pas de seuil de fraîcheur.
 * @param {Object} registry
 * @param {Object} flow
 * @returns {{ status: string, status_reason: string, last_event_id: string|null }}
 */
function projectFlowStatus(registry, flow) {
    if (!registry || !flow || !flow.flow_id) {
        return { status: 'unknown', status_reason: 'no_contract', last_event_id: null };
    }
    const last = registry.getLatestEventForFlow(flow.flow_id);
    const openAnomalies = registry.listOpenAnomaliesForFlow(flow.flow_id);
    const active = registry.listActiveIncidentsForFlow(flow.flow_id);
    const confirmed = active.filter((i) => CONFIRMED_DOWN.includes(i.state));
    const detected = active.filter((i) => i.state === 'DETECTE');

    if (!last) {
        return { status: 'unknown', status_reason: 'no_events', last_event_id: null };
    }
    if (confirmed.length) {
        return {
            status: 'down',
            status_reason: 'incident_confirmed',
            last_event_id: last.event_id
        };
    }
    if (detected.length || openAnomalies.length) {
        return {
            status: 'degraded',
            status_reason: detected.length ? 'incident_detecte' : 'anomaly_open',
            last_event_id: last.event_id
        };
    }
    return { status: 'ok', status_reason: 'nominal', last_event_id: last.event_id };
}

function decorateFlow(registry, flow) {
    const projection = projectFlowStatus(registry, flow);
    return Object.assign({}, flow, projection);
}

module.exports = {
    CONFIRMED_DOWN,
    projectFlowStatus,
    decorateFlow
};
