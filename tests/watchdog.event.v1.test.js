'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { validateWatchdogEvent, MAX_METADATA_BYTES } = require('../contracts/validate-event-v1');

const ROOT = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'contracts', 'watchdog.event.v1.schema.json');
const GLOSSARY_PATH = path.join(ROOT, 'contracts', 'glossary.md');
const VALID_DIR = path.join(ROOT, 'contracts', 'fixtures', 'valid');
const INVALID_DIR = path.join(ROOT, 'contracts', 'fixtures', 'invalid');

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const REQUIRED_GLOSSARY_TERMS = [
    'Source',
    'Connector',
    'Flow',
    'Event',
    'Anomaly',
    'Incident',
    'Health Contract',
    'watchdog.event.v1',
    'HTTP interne',
    'T_METEO_ALERTS',
    'Fleet'
];

function loadJsonDir(dir) {
    return fs.readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name) => ({
            name,
            payload: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
        }));
}

describe('watchdog.event.v1 schema', () => {
    it('déclare le contrat et interdit les propriétés inconnues', () => {
        assert.equal(schema.title, 'watchdog.event.v1');
        assert.equal(schema.additionalProperties, false);
        assert.equal(schema.properties.schema.const, 'watchdog.event.v1');
        assert.ok(schema.properties.event_type.enum.includes('timeout'));
        assert.ok(!schema.properties.event_type.enum.includes('heartbeat'));
        assert.equal(schema.properties.records.type, 'integer');
    });
});

describe('fixtures valides', () => {
    const files = loadJsonDir(VALID_DIR);
    assert.ok(files.length >= 6, 'au moins 6 fixtures valides');

    for (const file of files) {
        it(`accepte ${file.name}`, () => {
            const result = validateWatchdogEvent(file.payload, schema);
            assert.equal(result.ok, true, result.errors.join('; '));
        });
    }
});

describe('fixtures invalides', () => {
    const files = loadJsonDir(INVALID_DIR);
    assert.ok(files.length >= 8, 'au moins 8 fixtures invalides');

    for (const file of files) {
        it(`rejette ${file.name}`, () => {
            const result = validateWatchdogEvent(file.payload, schema);
            assert.equal(result.ok, false, `${file.name} aurait dû être rejeté`);
            assert.ok(result.errors.length > 0);
        });
    }
});

describe('règles métier du contrat', () => {
    const base = {
        schema: 'watchdog.event.v1',
        event_id: '01K3N7R4VQK8M2P9X5C6B1A0ZT',
        flow_id: 'METEO_01',
        event_type: 'data_received',
        status: 'success',
        timestamp: '2026-08-24T10:00:00Z',
        source_id: 'SRC_METEOSWISS_OGD',
        connector_id: 'CONN_API_METEO',
        destination_id: 'DST_SQL_METEO'
    };

    it('rejette ingested_at côté producteur', () => {
        const result = validateWatchdogEvent({ ...base, ingested_at: '2026-08-24T10:00:01Z' }, schema);
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((e) => e.startsWith('ingested_at:')));
    });

    it('rejette un metadata trop volumineux', () => {
        const result = validateWatchdogEvent({
            ...base,
            metadata: { blob: 'x'.repeat(MAX_METADATA_BYTES) }
        }, schema);
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((e) => e.startsWith('metadata:')));
    });

    it('ne confond pas un event et une ligne métier', () => {
        const result = validateWatchdogEvent({
            ...base,
            records: [{ station: 'GVE', t: 21 }]
        }, schema);
        assert.equal(result.ok, false);
    });
});

describe('glossaire Lot 0', () => {
    const text = fs.readFileSync(GLOSSARY_PATH, 'utf8');

    it('contient les termes verrouillés', () => {
        for (const term of REQUIRED_GLOSSARY_TERMS) {
            assert.ok(text.includes(term), `terme manquant: ${term}`);
        }
    });

    it('rappelle que les seuils météo et le SLA fichier OASSIS ne sont pas tranchés', () => {
        assert.ok(text.includes('non décidés') || text.includes('non décidé'));
        assert.ok(text.includes('20 min vs 30 min'));
        assert.ok(text.includes('Un fichier OASSIS'));
    });
});
