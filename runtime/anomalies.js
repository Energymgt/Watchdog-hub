'use strict';

const crypto = require('crypto');

function nowUtc() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function uuidV4FromSeed(seed) {
    const hex = crypto.createHash('sha256').update(String(seed)).digest('hex');
    const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `4${hex.slice(13, 16)}`,
        `${variant}${hex.slice(18, 20)}`,
        hex.slice(20, 32)
    ].join('-');
}

function correlationKey(flowId, clauseId, errorSignature) {
    return `${flowId}|${clauseId}|${errorSignature || 'none'}`;
}

function statusesThatOpen(rule) {
    const declared = Array.isArray(rule.open_statuses) ? rule.open_statuses : ['failure'];
    return declared.filter((status) => status && status !== 'success');
}

function signatureForOpen(rule, event) {
    if (typeof rule.error_signature === 'string' && rule.error_signature) {
        return rule.error_signature;
    }
    return event.error_signature || 'execution:failed';
}

/**
 * Applique un événement nouvellement inséré aux clauses event_failure.
 * L'ouverture suit open_statuses (défaut failure). Le succès ferme la clause.
 * Ne crée pas d'incident. N'évalue pas de fraîcheur temporelle.
 * @returns {{ opened: number, incremented: number, closed: number, incrementedRows: Object[], closedRows: Object[] }}
 */
function applyEventToAnomalies(registry, event, contracts) {
    const stats = {
        opened: 0,
        incremented: 0,
        closed: 0,
        incrementedRows: [],
        closedRows: []
    };
    if (!event || !event.flow_id || !registry) return stats;
    const rules = (contracts && contracts.rules) || [];
    const matching = rules.filter((r) => r.enabled && r.flow_id === event.flow_id && r.kind === 'event_failure');
    if (!matching.length) return stats;

    const at = nowUtc();

    for (const rule of matching) {
        const isFailure = statusesThatOpen(rule).includes(event.status)
            && Array.isArray(rule.event_types)
            && rule.event_types.includes(event.event_type);
        const isSuccess = event.status === 'success'
            && Array.isArray(rule.success_types)
            && rule.success_types.includes(event.event_type);

        if (isFailure) {
            const signature = signatureForOpen(rule, event);
            const open = registry.findOpenAnomaly(event.flow_id, rule.clause_id, signature);
            if (open) {
                const previousEventId = open.last_event_id;
                registry.incrementAnomaly(open.anomaly_id, event.event_id);
                const updated = registry.getAnomaly(open.anomaly_id);
                stats.incremented += 1;
                if (updated) {
                    stats.incrementedRows.push(Object.assign({}, updated, { previous_event_id: previousEventId }));
                }
            } else {
                registry.insertAnomaly({
                    anomaly_id: uuidV4FromSeed(`open:${event.flow_id}:${rule.clause_id}:${signature}:${event.event_id}`),
                    flow_id: event.flow_id,
                    clause_id: rule.clause_id,
                    error_signature: signature,
                    status: 'open',
                    opened_at: at,
                    last_event_id: event.event_id,
                    occurrence_count: 1,
                    correlation_key: correlationKey(event.flow_id, rule.clause_id, signature)
                });
                stats.opened += 1;
            }
        } else if (isSuccess) {
            const closed = registry.closeOpenAnomalies(event.flow_id, rule.clause_id, event.event_id, at);
            const rows = Array.isArray(closed) ? closed : [];
            stats.closed += rows.length;
            stats.closedRows.push(...rows);
        }
    }

    return stats;
}

module.exports = {
    applyEventToAnomalies,
    uuidV4FromSeed,
    correlationKey
};
