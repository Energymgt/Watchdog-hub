'use strict';

const TOPIC_PATTERN = /^bacnet\/gateway\/([A-Za-z0-9._:-]{8,128})\/heartbeat$/;

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkString(value, name, spec, errors) {
    if (typeof value !== 'string') {
        errors.push(`${name}: string attendu`);
        return;
    }
    if (spec.minLength !== undefined && value.length < spec.minLength) {
        errors.push(`${name}: minLength ${spec.minLength}`);
    }
    if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        errors.push(`${name}: maxLength ${spec.maxLength}`);
    }
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
        errors.push(`${name}: motif invalide`);
    }
    if (spec.enum && !spec.enum.includes(value)) {
        errors.push(`${name}: valeur "${value}" hors enum`);
    }
}

function checkObject(value, name, spec, errors) {
    if (!isObject(value)) {
        errors.push(`${name}: objet attendu`);
        return;
    }
    for (const key of spec.required || []) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
            errors.push(`${name}.${key}: champ obligatoire manquant`);
        }
    }
    if (spec.additionalProperties === false) {
        const allowed = new Set(Object.keys(spec.properties || {}));
        for (const key of Object.keys(value)) {
            if (!allowed.has(key)) errors.push(`${name}.${key}: propriété non autorisée`);
        }
    }
}

/**
 * Valide le socle utilisé par les producteurs BACnet et Modbus.
 *
 * @param {object} heartbeat
 * @param {object} schema
 * @param {string} [topic]
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateWatchdogHeartbeat(heartbeat, schema, topic) {
    const errors = [];
    if (!isObject(heartbeat)) {
        return { ok: false, errors: ['root: un objet JSON est requis'] };
    }

    const properties = schema.properties || {};
    checkObject(heartbeat, 'root', schema, errors);

    if (heartbeat.schema !== undefined && heartbeat.schema !== properties.schema.const) {
        errors.push(`schema: valeur constante attendue "${properties.schema.const}"`);
    }
    if (!Number.isInteger(heartbeat.ts) || heartbeat.ts < 0) {
        errors.push('ts: entier positif en millisecondes attendu');
    }

    checkObject(heartbeat.device, 'device', properties.device, errors);
    if (isObject(heartbeat.device)) {
        const deviceProperties = properties.device.properties;
        for (const key of ['uuid', 'name', 'app', 'host', 'protocol']) {
            if (heartbeat.device[key] !== undefined) {
                checkString(heartbeat.device[key], `device.${key}`, deviceProperties[key], errors);
            }
        }
    }

    checkObject(heartbeat.health, 'health', properties.health, errors);
    if (isObject(heartbeat.health) && typeof heartbeat.health.ok !== 'boolean') {
        errors.push('health.ok: booléen attendu');
    }
    checkObject(heartbeat.mqtt, 'mqtt', properties.mqtt, errors);
    if (isObject(heartbeat.mqtt) && typeof heartbeat.mqtt.ok !== 'boolean') {
        errors.push('mqtt.ok: booléen attendu');
    }
    checkObject(heartbeat.buffer, 'buffer', properties.buffer, errors);
    if (isObject(heartbeat.buffer)) {
        const states = properties.buffer.properties.state.enum;
        if (!states.includes(heartbeat.buffer.state)) errors.push('buffer.state: valeur hors enum');
        if (!Number.isInteger(heartbeat.buffer.pending) || heartbeat.buffer.pending < 0) {
            errors.push('buffer.pending: entier positif attendu');
        }
    }

    if (isObject(heartbeat.device) && heartbeat.device.protocol === 'modbus') {
        if (!isObject(heartbeat.health) || heartbeat.health.protocol !== 'modbus') {
            errors.push('health.protocol: "modbus" obligatoire pour un device Modbus');
        }
        if (!isObject(heartbeat.health) || !isObject(heartbeat.health.modbus)) {
            errors.push('health.modbus: objet obligatoire pour un device Modbus');
        }
    }

    if (topic !== undefined) {
        const match = TOPIC_PATTERN.exec(topic);
        if (!match) {
            errors.push('topic: bacnet/gateway/{uuid}/heartbeat attendu');
        } else if (!isObject(heartbeat.device) || match[1] !== heartbeat.device.uuid) {
            errors.push('topic: UUID différent de device.uuid');
        }
    }

    return { ok: errors.length === 0, errors };
}

module.exports = {
    TOPIC_PATTERN,
    validateWatchdogHeartbeat
};
