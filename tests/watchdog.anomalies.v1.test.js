'use strict';

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { openRegistry, SCHEMA_VERSION } = require('../runtime/registry');
const { ingestEvent } = require('../runtime/ingest');
const { createIngestServer } = require('../runtime/server');
const { loadHealthContracts, deriveSupervisionRules } = require('../runtime/health-contracts');
const { applyEventToAnomalies } = require('../runtime/anomalies');

const ROOT = path.join(__dirname, '..');
const SCHEMA = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'watchdog.event.v1.schema.json'), 'utf8')
);
const METEO_TIMEOUT = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-timeout.json'), 'utf8')
);
const METEO_OK = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-data-received.json'), 'utf8')
);
const CSV_FAIL = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-validation-failed.json'), 'utf8')
);
const CSV_OK = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-execution-completed.json'), 'utf8')
);
const CSV_MISSING = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-data-missing.json'), 'utf8')
);

function tmpDb() {
    return path.join(
        os.tmpdir(),
        `watchdog-lot4-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
}

function cloneEvent(base, overrides) {
    return Object.assign({}, base, overrides);
}

function requestJson(port, method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
            headers: Object.assign({
                Accept: 'application/json'
            }, payload ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            } : {})
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try {
                    json = raw ? JSON.parse(raw) : null;
                } catch {
                    json = raw;
                }
                resolve({ status: res.statusCode, json });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

describe('contrats de santé Lot 4', () => {
    it('charge METEO_01 et CSV_OASSIS_01', () => {
        const { flows, rules } = loadHealthContracts();
        assert.equal(flows.length, 2);
        assert.ok(flows.some((f) => f.flow_id === 'METEO_01'));
        assert.ok(flows.some((f) => f.flow_id === 'CSV_OASSIS_01'));
        assert.ok(rules.every((r) => r.source === 'health_contract'));
        assert.ok(rules.every((r) => r.kind === 'event_failure'));
        assert.ok(!JSON.stringify(flows).includes('"kind": "freshness"'));
        assert.ok(!JSON.stringify(flows).includes('"kind":"freshness"'));
    });

    it('dérive les supervision_rules du contrat, pas d\'une copie indépendante', () => {
        const { flows } = loadHealthContracts();
        const rules = deriveSupervisionRules(flows);
        const meteo = rules.find((r) => r.flow_id === 'METEO_01');
        assert.equal(meteo.rule_id, 'METEO_01:availability:v1');
        assert.ok(meteo.event_types.includes('timeout'));
        assert.ok(meteo.success_types.includes('data_received'));
        assert.ok(!meteo.event_types.includes('data_missing'));
    });
});

describe('anomalies event_failure Lot 4', { concurrency: false }, () => {
    let registry;
    let dbPath;
    let contracts;

    before(() => {
        dbPath = tmpDb();
        registry = openRegistry(dbPath);
        contracts = loadHealthContracts();
    });

    after(() => {
        if (registry) registry.close();
        for (const extra of ['', '-wal', '-shm']) {
            try {
                fs.unlinkSync(dbPath + extra);
            } catch {
                /* ignore */
            }
        }
    });

    it('applique le schéma anomalies (v2+)', () => {
        assert.ok(SCHEMA_VERSION >= 2);
        const health = registry.health();
        assert.equal(typeof health.anomalies, 'number');
        assert.equal(health.anomalies_open, 0);
    });

    it('ouvre une anomalie sur timeout météo', () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        const result = ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(result.status, 201);
        const open = registry.listAnomalies({ status: 'open' });
        assert.equal(open.length, 1);
        assert.equal(open[0].flow_id, 'METEO_01');
        assert.equal(open[0].clause_id, 'availability');
        assert.equal(open[0].error_signature, 'http_timeout:ogd-smn');
        assert.equal(open[0].occurrence_count, 1);
        assert.equal(open[0].last_event_id, event.event_id);
    });

    it('incrémente la même anomalie ouverte (même signature)', () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        const open = registry.listAnomalies({ status: 'open' });
        assert.equal(open.length, 1);
        assert.equal(open[0].occurrence_count, 2);
        assert.equal(open[0].last_event_id, event.event_id);
    });

    it('n\'incrémente pas sur un duplicate HTTP 200', () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        const first = ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(first.status, 201);
        const before = registry.listAnomalies({ status: 'open' })[0].occurrence_count;
        const second = ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(second.status, 200);
        assert.equal(second.duplicate, true);
        assert.equal(registry.listAnomalies({ status: 'open' })[0].occurrence_count, before);
    });

    it('ouvre une seconde anomalie si la signature change', () => {
        const event = cloneEvent(METEO_TIMEOUT, {
            event_id: crypto.randomUUID(),
            event_type: 'connector_error',
            error_signature: 'ogd_fetch:smn'
        });
        ingestEvent(registry, SCHEMA, event, { contracts });
        const open = registry.listAnomalies({ status: 'open' });
        assert.equal(open.length, 2);
    });

    it('ne ferme pas et n\'ouvre pas sur status=partial', () => {
        const before = registry.listAnomalies({ status: 'open' }).length;
        const event = cloneEvent(METEO_OK, {
            event_id: crypto.randomUUID(),
            status: 'partial',
            records: 120,
            metadata: { stations_ok: 5, stations_fail: 5 }
        });
        const result = ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(result.status, 201);
        assert.equal(registry.listAnomalies({ status: 'open' }).length, before);
    });

    it('ferme toutes les anomalies open du flux sur success', () => {
        const event = cloneEvent(METEO_OK, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(registry.listAnomalies({ status: 'open' }).length, 0);
        const closed = registry.listAnomalies({ status: 'closed' });
        assert.ok(closed.length >= 2);
        assert.ok(closed.every((a) => a.closed_at && a.flow_id === 'METEO_01'));
    });

    it('crée une nouvelle ligne après une fermeture', () => {
        const fail = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, fail, { contracts });
        const open = registry.listAnomalies({ status: 'open' });
        assert.equal(open.length, 1);
        assert.equal(open[0].occurrence_count, 1);
        const closed = registry.listAnomalies({ status: 'closed' });
        assert.ok(!closed.some((a) => a.anomaly_id === open[0].anomaly_id));
    });

    it('ouvre une anomalie CSV validation_failed', () => {
        const event = cloneEvent(CSV_FAIL, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        const csvOpen = registry.listAnomalies({ status: 'open' }).filter((a) => a.flow_id === 'CSV_OASSIS_01');
        assert.equal(csvOpen.length, 1);
        assert.equal(csvOpen[0].error_signature, 'validation:parse_csv');
    });

    it('n\'ouvre pas d\'anomalie sur data_missing (SLA fichier non tranché)', () => {
        const before = registry.listAnomalies({ status: 'open' }).filter((a) => a.flow_id === 'CSV_OASSIS_01').length;
        const event = cloneEvent(CSV_MISSING, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        const after = registry.listAnomalies({ status: 'open' }).filter((a) => a.flow_id === 'CSV_OASSIS_01').length;
        assert.equal(after, before);
    });

    it('ferme l\'anomalie CSV sur execution_completed', () => {
        const event = cloneEvent(CSV_OK, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        const csvOpen = registry.listAnomalies({ status: 'open' }).filter((a) => a.flow_id === 'CSV_OASSIS_01');
        assert.equal(csvOpen.length, 0);
    });

    it('ignore un flux sans contrat', () => {
        const event = cloneEvent(METEO_TIMEOUT, {
            event_id: crypto.randomUUID(),
            flow_id: 'UNKNOWN_99',
            source_id: 'SRC_X',
            connector_id: 'CONN_X',
            destination_id: 'DST_X'
        });
        const before = registry.health().anomalies;
        ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(registry.health().anomalies, before);
    });

    it('n\'échoue pas l\'ingest si le moteur d\'anomalies throw', () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        const broken = Object.create(registry);
        broken.findOpenAnomaly = () => {
            throw new Error('anomalies boom');
        };
        const result = ingestEvent(broken, SCHEMA, event, { contracts });
        assert.equal(result.status, 201);
        assert.ok(registry.getEvent(event.event_id));
    });

    it('ne crée pas d\'incident', () => {
        const stats = applyEventToAnomalies(registry, cloneEvent(METEO_OK, { event_id: crypto.randomUUID() }), contracts);
        assert.equal(Object.prototype.hasOwnProperty.call(stats, 'incidents'), false);
        assert.equal(registry.health().ok, true);
    });
});

describe('HTTP anomalies Lot 4', { concurrency: false }, () => {
    let registry;
    let server;
    let port;
    let dbPath;

    before(async () => {
        dbPath = tmpDb();
        registry = openRegistry(dbPath);
        server = createIngestServer(registry);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
    });

    after(async () => {
        await new Promise((resolve) => server.close(resolve));
        registry.close();
        for (const extra of ['', '-wal', '-shm']) {
            try {
                fs.unlinkSync(dbPath + extra);
            } catch {
                /* ignore */
            }
        }
    });

    it('GET /v1/flows expose les contrats et les règles projetées', async () => {
        const res = await requestJson(port, 'GET', '/v1/flows');
        assert.equal(res.status, 200);
        assert.equal(res.json.ok, true);
        assert.ok(res.json.flows.some((f) => f.flow_id === 'METEO_01'));
        assert.ok(res.json.rules.some((r) => r.rule_id === 'CSV_OASSIS_01:availability:v1'));
        assert.ok(res.json.rules.every((r) => r.source === 'health_contract'));
    });

    it('POST timeout ouvre une anomalie consultable', async () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        const posted = await requestJson(port, 'POST', '/v1/events', event);
        assert.equal(posted.status, 201);
        const listed = await requestJson(port, 'GET', '/v1/anomalies?status=open');
        assert.equal(listed.status, 200);
        assert.equal(listed.json.anomalies.length, 1);
        const id = listed.json.anomalies[0].anomaly_id;
        const one = await requestJson(port, 'GET', `/v1/anomalies/${id}`);
        assert.equal(one.status, 200);
        assert.equal(one.json.anomaly.flow_id, 'METEO_01');
        const health = await requestJson(port, 'GET', '/healthz');
        assert.equal(health.json.anomalies_open, 1);
    });

    it('refuse un status inconnu', async () => {
        const res = await requestJson(port, 'GET', '/v1/anomalies?status=flapping');
        assert.equal(res.status, 400);
        assert.equal(res.json.error, 'invalid_status');
    });
});
