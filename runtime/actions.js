'use strict';

const { uuidV4FromSeed } = require('./anomalies');
const { transitionIncident } = require('./incidents');

const ACTION_KINDS = Object.freeze(['note', 'transition']);

function nowUtc() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function publicActionRow(row) {
    if (!row) return null;
    return {
        action_id: row.action_id,
        incident_id: row.incident_id,
        actor: row.actor,
        kind: row.kind,
        comment: row.comment,
        to_state: row.to_state,
        created_at: row.created_at
    };
}

function normalizeActor(raw) {
    const actor = String(raw || '').trim();
    if (!actor || actor.length > 64) return null;
    return actor;
}

function normalizeComment(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const comment = String(raw);
    if (comment.length > 2000) return undefined;
    return comment;
}

/**
 * Enregistre une intervention. N'orchestre rien (pas de restart connecteur, pas de SSH).
 * @returns {{ ok: boolean, status: number, error?: string, action?: Object, incident?: Object }}
 */
function recordAction(registry, incident, body) {
    if (!registry || !incident) {
        return { ok: false, status: 404, error: 'not_found' };
    }
    const src = body && typeof body === 'object' ? body : {};
    const actor = normalizeActor(src.actor);
    if (!actor) {
        return { ok: false, status: 400, error: 'actor_required' };
    }
    const comment = normalizeComment(src.comment);
    if (comment === undefined) {
        return { ok: false, status: 400, error: 'comment_too_long' };
    }

    const wantsTransition = typeof src.to_state === 'string' && src.to_state.trim() !== '';
    const kind = wantsTransition ? 'transition' : (src.kind || 'note');
    if (!ACTION_KINDS.includes(kind)) {
        return { ok: false, status: 400, error: 'invalid_kind', allowed: ACTION_KINDS.slice() };
    }
    if (kind === 'note' && !comment) {
        return { ok: false, status: 400, error: 'comment_required' };
    }
    if (kind === 'transition' && !wantsTransition) {
        return { ok: false, status: 400, error: 'to_state_required' };
    }
    if (wantsTransition && src.to_state.trim() === 'RESOLU') {
        return { ok: false, status: 409, error: 'resolution_required' };
    }

    let incidentAfter = incident;
    if (wantsTransition) {
        const moved = transitionIncident(registry, incident, src.to_state.trim(), {
            actor,
            reason: comment || 'action_transition'
        });
        if (!moved.ok) {
            return { ok: false, status: 409, error: moved.error };
        }
        incidentAfter = moved.incident;
    }

    const at = nowUtc();
    const action = {
        action_id: uuidV4FromSeed(`action:${incident.incident_id}:${actor}:${kind}:${at}:${comment || ''}`),
        incident_id: incident.incident_id,
        actor,
        kind,
        comment,
        to_state: wantsTransition ? src.to_state.trim() : null,
        created_at: at
    };
    registry.insertAction(action);
    return { ok: true, status: 201, action, incident: incidentAfter };
}

module.exports = {
    ACTION_KINDS,
    publicActionRow,
    recordAction
};
