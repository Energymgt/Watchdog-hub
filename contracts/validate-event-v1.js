'use strict';

/**
 * Validateur du contrat watchdog.event.v1.
 * Aucune I/O métier, aucune base, aucune dépendance npm.
 */

const MAX_METADATA_BYTES = 4096;

const EXECUTION_TYPES = new Set([
    'execution_started',
    'execution_completed',
    'execution_failed'
]);

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchOneOfPatterns(value, schemas) {
    return schemas.some((entry) => {
        if (!entry.pattern) return false;
        return new RegExp(entry.pattern).test(value);
    });
}

function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/**
 * @param {object} event
 * @param {object} schema
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateWatchdogEvent(event, schema) {
    const errors = [];

    if (!isObject(event)) {
        return { ok: false, errors: ['root: un objet JSON est requis'] };
    }

    if (Object.prototype.hasOwnProperty.call(event, 'ingested_at')) {
        errors.push('ingested_at: interdit côté producteur (posé uniquement à l\'ingest Watchdog)');
    }

    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(event)) {
        if (!allowed.has(key)) {
            errors.push(`${key}: propriété non autorisée (additionalProperties=false)`);
        }
    }

    for (const key of schema.required || []) {
        if (!Object.prototype.hasOwnProperty.call(event, key)) {
            errors.push(`${key}: champ obligatoire manquant`);
        }
    }

    const props = schema.properties || {};
    for (const [key, spec] of Object.entries(props)) {
        if (!Object.prototype.hasOwnProperty.call(event, key)) continue;
        checkProperty(key, event[key], spec, errors);
    }

    if (EXECUTION_TYPES.has(event.event_type) && (event.execution_id === undefined || event.execution_id === '')) {
        errors.push('execution_id: obligatoire lorsque event_type commence par execution_');
    }

    if (event.status === 'failure' && (event.error_signature === undefined || event.error_signature === '')) {
        errors.push('error_signature: obligatoire lorsque status=failure');
    }

    if (Object.prototype.hasOwnProperty.call(event, 'records') && Array.isArray(event.records)) {
        errors.push('records: entier attendu, pas un tableau de lignes métier');
    }

    if (Object.prototype.hasOwnProperty.call(event, 'metadata')) {
        if (!isObject(event.metadata)) {
            errors.push('metadata: objet attendu');
        } else {
            let serialized = '';
            try {
                serialized = JSON.stringify(event.metadata);
            } catch {
                errors.push('metadata: non sérialisable');
            }
            if (serialized && Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) {
                errors.push(`metadata: taille maximale ${MAX_METADATA_BYTES} octets dépassée`);
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

function checkProperty(key, value, spec, errors) {
    if (spec.const !== undefined && value !== spec.const) {
        errors.push(`${key}: valeur constante attendue "${spec.const}"`);
        return;
    }

    if (spec.enum && !spec.enum.includes(value)) {
        errors.push(`${key}: valeur "${value}" hors enum`);
        return;
    }

    if (spec.type === 'string') {
        if (typeof value !== 'string') {
            errors.push(`${key}: string attendu, reçu ${typeOf(value)}`);
            return;
        }
        if (spec.minLength !== undefined && value.length < spec.minLength) {
            errors.push(`${key}: minLength ${spec.minLength}`);
        }
        if (spec.maxLength !== undefined && value.length > spec.maxLength) {
            errors.push(`${key}: maxLength ${spec.maxLength}`);
        }
        if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
            errors.push(`${key}: motif invalide`);
        }
        if (Array.isArray(spec.oneOf) && !matchOneOfPatterns(value, spec.oneOf)) {
            errors.push(`${key}: UUID v4 ou ULID attendu`);
        }
        return;
    }

    if (spec.type === 'integer') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
            errors.push(`${key}: entier attendu, reçu ${typeOf(value)}`);
            return;
        }
        if (spec.minimum !== undefined && value < spec.minimum) {
            errors.push(`${key}: minimum ${spec.minimum}`);
        }
        return;
    }

    if (spec.type === 'object' && !isObject(value)) {
        errors.push(`${key}: objet attendu, reçu ${typeOf(value)}`);
    }
}

module.exports = {
    MAX_METADATA_BYTES,
    EXECUTION_TYPES,
    validateWatchdogEvent
};
