'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { validateWatchdogEvent } = require('../contracts/validate-event-v1');
const { validateWatchdogHeartbeat } = require('../contracts/validate-heartbeat-v1');

const ROOT = path.join(__dirname, '..');
const KIT = path.join(ROOT, 'integration-kit');
const HEARTBEAT_SCHEMA = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'contracts', 'watchdog.heartbeat.v1.schema.json'),
    'utf8'
));
const EVENT_SCHEMA = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'contracts', 'watchdog.event.v1.schema.json'),
    'utf8'
));

function readJson(...parts) {
    return JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));
}

describe('watchdog.heartbeat.v1', () => {
    const examples = ['bacnet-heartbeat.json', 'modbus-heartbeat.json'];

    it('déclare un contrat strict à la racine et compatible avec le legacy', () => {
        assert.equal(HEARTBEAT_SCHEMA.title, 'watchdog.heartbeat.v1');
        assert.equal(HEARTBEAT_SCHEMA.additionalProperties, false);
        assert.equal(HEARTBEAT_SCHEMA.properties.schema.const, 'watchdog.heartbeat.v1');
        assert.ok(!HEARTBEAT_SCHEMA.required.includes('schema'));
    });

    for (const filename of examples) {
        it(`accepte l'exemple ${filename}`, () => {
            const heartbeat = readJson(KIT, 'examples', filename);
            const topic = `bacnet/gateway/${heartbeat.device.uuid}/heartbeat`;
            const result = validateWatchdogHeartbeat(heartbeat, HEARTBEAT_SCHEMA, topic);
            assert.equal(result.ok, true, result.errors.join('; '));
        });
    }

    it('accepte un heartbeat historique sans champ schema', () => {
        const heartbeat = readJson(KIT, 'examples', 'bacnet-heartbeat.json');
        delete heartbeat.schema;
        const result = validateWatchdogHeartbeat(
            heartbeat,
            HEARTBEAT_SCHEMA,
            `bacnet/gateway/${heartbeat.device.uuid}/heartbeat`
        );
        assert.equal(result.ok, true, result.errors.join('; '));
    });

    it('rejette un UUID de topic différent du payload', () => {
        const heartbeat = readJson(KIT, 'examples', 'bacnet-heartbeat.json');
        const result = validateWatchdogHeartbeat(
            heartbeat,
            HEARTBEAT_SCHEMA,
            'bacnet/gateway/another-device/heartbeat'
        );
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((error) => error.includes('UUID différent')));
    });

    it('exige le détail de santé Modbus', () => {
        const heartbeat = readJson(KIT, 'examples', 'modbus-heartbeat.json');
        delete heartbeat.health.modbus;
        const result = validateWatchdogHeartbeat(
            heartbeat,
            HEARTBEAT_SCHEMA,
            `bacnet/gateway/${heartbeat.device.uuid}/heartbeat`
        );
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((error) => error.startsWith('health.modbus:')));
    });
});

describe('artefacts du kit', () => {
    const templates = [
        'watchdog-heartbeat-bacnet.json',
        'watchdog-heartbeat-modbus.json'
    ];

    for (const filename of templates) {
        it(`fournit un template Node-RED générique ${filename}`, () => {
            const nodes = readJson(KIT, 'node-red', filename);
            const serialized = JSON.stringify(nodes);
            const inject = nodes.find((node) => node.type === 'inject');
            const mqttOut = nodes.find((node) => node.type === 'mqtt out');

            assert.ok(Array.isArray(nodes) && nodes.length > 0);
            assert.equal(inject.repeat, '60');
            assert.ok(mqttOut);
            assert.ok(serialized.includes('BALENA_DEVICE_UUID'));
            assert.ok(serialized.includes('msg.qos = 1'));
            assert.ok(serialized.includes('msg.retain = true'));
            assert.ok(!serialized.includes('000e2d54189d86440ccfba5554b554e9'));
            assert.ok(!serialized.includes('UltrafluxUF801-673'));
            assert.ok(!serialized.includes('"credentials"'));
        });
    }

    it('fournit un exemple HTTP conforme à watchdog.event.v1', () => {
        const event = readJson(KIT, 'examples', 'http-event.json');
        const result = validateWatchdogEvent(event, EVENT_SCHEMA);
        assert.equal(result.ok, true, result.errors.join('; '));
    });

    it('fournit un modèle de contrat de flux exploitable', () => {
        const contract = readJson(KIT, 'flow-contracts', 'FLOW_ID.example.json');
        assert.match(contract.flow_id, /^[A-Z][A-Z0-9_]*$/);
        assert.ok(Array.isArray(contract.health_contract.clauses));
        assert.ok(contract.health_contract.clauses.length > 0);
    });

    it('versionne explicitement le kit', () => {
        const version = fs.readFileSync(path.join(KIT, 'VERSION'), 'utf8').trim();
        assert.match(version, /^\d+\.\d+\.\d+$/);
    });
});
