'use strict';

const { uuidV4FromSeed } = require('./anomalies');
const { transitionIncident } = require('./incidents');

function nowUtc() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function publicResolutionRow(row) {
    if (!row) return null;
    return {
        resolution_id: row.resolution_id,
        incident_id: row.incident_id,
        actor: row.actor,
        comment: row.comment,
        validated_at: row.validated_at
    };
}

/**
 * Constat de retour au nominal, avec validation.
 * Seule voie vers RESOLU. Pas de fraîcheur, pas d'orchestration.
 */
function recordResolution(registry, incident, body) {
    if (!registry || !incident) {
        return { ok: false, status: 404, error: 'not_found' };
    }
    if (incident.state !== 'EN_VALIDATION') {
        return { ok: false, status: 409, error: 'not_en_validation', from_state: incident.state };
    }
    const src = body && typeof body === 'object' ? body : {};
    const actor = String(src.actor || '').trim();
    const comment = src.comment == null ? '' : String(src.comment).trim();
    if (!actor || actor.length > 64) {
        return { ok: false, status: 400, error: 'actor_required' };
    }
    if (!comment) {
        return { ok: false, status: 400, error: 'comment_required' };
    }
    if (comment.length > 2000) {
        return { ok: false, status: 400, error: 'comment_too_long' };
    }

    const moved = transitionIncident(registry, incident, 'RESOLU', {
        actor,
        reason: comment
    });
    if (!moved.ok) {
        return { ok: false, status: 409, error: moved.error };
    }

    const at = nowUtc();
    const action = {
        action_id: uuidV4FromSeed(`action:${incident.incident_id}:${actor}:transition:${at}:${comment}`),
        incident_id: incident.incident_id,
        actor,
        kind: 'transition',
        comment,
        to_state: 'RESOLU',
        created_at: at
    };
    registry.insertAction(action);

    const resolution = {
        resolution_id: uuidV4FromSeed(`resolution:${incident.incident_id}:${actor}:${at}`),
        incident_id: incident.incident_id,
        actor,
        comment,
        validated_at: at
    };
    registry.insertResolution(resolution);
    return {
        ok: true,
        status: 201,
        resolution,
        incident: moved.incident,
        action
    };
}

module.exports = {
    publicResolutionRow,
    recordResolution
};
