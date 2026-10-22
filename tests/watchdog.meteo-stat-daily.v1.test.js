'use strict';

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { openRegistry } = require('../runtime/registry');
const { ingestEvent } = require('../runtime/ingest');
const { createIngestServer } = require('../runtime/server');
const { loadHealthContracts, deriveSupervisionRules } = require('../runtime/health-contracts');
const { projectFlowStatus } = require('../runtime/flow-status');

const ROOT = path.join(__dirname, '..');
const SCHEMA = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'watchdog.event.v1.schema.json'), 'utf8')
);

function tmpDb() {
    return path.join(
        os.tmpdir(),
        `watchdog-dju-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
}

function dailyEvent(overrides) {
    return Object.assign({
        schema: 'watchdog.event.v1',
        event_id: crypto.randomUUID(),
        flow_id: 'METEO_STAT_DAILY',
        event_type: 'execution_completed',
        status: 'success',
        timestamp: '2026-10-23T02:31:00Z',
        source_id: 'SRC_SQLSERVER_METEO',
        connector_id: 'CONN_DJU_DAILY',
        destination_id: 'DST_SQL_GENEVE_METEO_STAT',
        execution_id: 'dju-daily:2026-10-23:attempt',
        producer: 'dju-daily',
        metadata: { step: 'readback', verified: true, slot_date: '2026-10-23' }
    }, overrides);
}

function failureEvent(signature, eventType) {
    return dailyEvent({
        event_type: eventType,
        status: 'failure',
        error_signature: signature,
        metadata: { step: 'destination_write', code: signature }
    });
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
            res.on('data', (chunk) => chunks.push(chunk));
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

function openDb() {
    const dbPath = tmpDb();
    const registry = openRegistry(dbPath);
    return {
        dbPath,
        registry,
        contracts: loadHealthContracts(),
        close() {
            registry.close();
            for (const extra of ['', '-wal', '-shm']) {
                try {
                    fs.unlinkSync(dbPath + extra);
                } catch {
                    /* ignore */
                }
            }
        }
    };
}

describe('flux METEO_STAT_DAILY', () => {
    it('charge le contrat et dérive availability plus source_completeness', () => {
        const { flows, rules } = loadHealthContracts();
        const flow = flows.find((item) => item.flow_id === 'METEO_STAT_DAILY');
        assert.ok(flow);
        assert.equal(flow.source_id, 'SRC_SQLSERVER_METEO');
        assert.equal(flow.connector_id, 'CONN_DJU_DAILY');
        assert.equal(flow.destination_id, 'DST_SQL_GENEVE_METEO_STAT');
        const derived = deriveSupervisionRules(flows).filter((item) => item.flow_id === 'METEO_STAT_DAILY');
        assert.equal(derived.length, 2);
        const availability = derived.find((item) => item.clause_id === 'availability');
        const completeness = derived.find((item) => item.clause_id === 'source_completeness');
        assert.equal(availability.rule_id, 'METEO_STAT_DAILY:availability:v1');
        assert.equal(availability.kind, 'event_failure');
        assert.deepEqual(availability.open_statuses, ['failure']);
        assert.deepEqual(availability.success_types, ['execution_completed']);
        assert.ok(!availability.event_types.includes('data_missing'));
        assert.equal(completeness.rule_id, 'METEO_STAT_DAILY:source_completeness:v1');
        assert.deepEqual(completeness.event_types, ['data_missing']);
        assert.deepEqual(completeness.open_statuses, ['partial']);
        assert.equal(completeness.error_signature, 'source_data_incomplete');
        assert.equal(rules.filter((item) => item.flow_id === 'METEO_01').length, 1);
        assert.equal(rules.filter((item) => item.flow_id === 'CSV_OASSIS_01').length, 1);
        const meteo = rules.find((item) => item.flow_id === 'METEO_01');
        assert.deepEqual(meteo.open_statuses, ['failure']);
        assert.ok(!meteo.event_types.includes('data_missing'));
    });
});

describe('ingest dju-daily', { concurrency: false }, () => {
    let db;

    before(() => {
        db = openDb();
    });

    after(() => {
        db.close();
    });

    it('accepte un execution_completed et rejette un producteur inconnu', () => {
        const event = dailyEvent();
        const accepted = ingestEvent(db.registry, SCHEMA, event, { contracts: db.contracts });
        assert.equal(accepted.status, 201);
        assert.equal(db.registry.getEvent(event.event_id).producer, 'dju-daily');
        const rejected = ingestEvent(db.registry, SCHEMA, dailyEvent({ producer: 'not-a-producer' }), { contracts: db.contracts });
        assert.equal(rejected.status, 400);
        assert.equal(rejected.error, 'validation_failed');
    });

    it('déduplique le même event_id et refuse une collision de contenu', () => {
        const event = dailyEvent();
        const first = ingestEvent(db.registry, SCHEMA, event, { contracts: db.contracts });
        const second = ingestEvent(db.registry, SCHEMA, event, { contracts: db.contracts });
        assert.equal(first.status, 201);
        assert.equal(second.status, 200);
        assert.equal(second.duplicate, true);
        const conflict = ingestEvent(db.registry, SCHEMA, Object.assign({}, event, {
            metadata: { step: 'stored_match', verified: true }
        }), { contracts: db.contracts });
        assert.equal(conflict.status, 409);
        assert.equal(conflict.error, 'event_id_conflict');
    });
});

describe('anomalies METEO_STAT_DAILY', { concurrency: false }, () => {
    let db;

    before(() => {
        db = openDb();
    });

    after(() => {
        db.close();
    });

    it('ouvre sur un échec terminal, garde data_missing à part, puis revient au nominal', () => {
        const first = failureEvent('destination_write_failed', 'destination_error');
        assert.equal(ingestEvent(db.registry, SCHEMA, first, { contracts: db.contracts }).status, 201);
        const open = db.registry.listAnomalies({ status: 'open' }).filter((item) => item.flow_id === 'METEO_STAT_DAILY');
        assert.equal(open.length, 1);
        assert.equal(open[0].error_signature, 'destination_write_failed');
        assert.equal(open[0].occurrence_count, 1);
        assert.equal(db.registry.listIncidents({}).filter((item) => item.flow_id === 'METEO_STAT_DAILY').length, 0);

        const second = failureEvent('destination_write_failed', 'destination_error');
        assert.equal(ingestEvent(db.registry, SCHEMA, second, { contracts: db.contracts }).status, 201);
        assert.equal(db.registry.listAnomalies({ status: 'open' })[0].occurrence_count, 2);
        const detected = db.registry.listIncidents({ state: 'DETECTE' }).filter((item) => item.flow_id === 'METEO_STAT_DAILY');
        assert.equal(detected.length, 1);

        const missing = dailyEvent({
            event_type: 'data_missing',
            status: 'partial',
            metadata: { step: 'source', code: 'source_data_incomplete', incomplete_days: 1 }
        });
        delete missing.error_signature;
        assert.equal(ingestEvent(db.registry, SCHEMA, missing, { contracts: db.contracts }).status, 201);
        const during = db.registry.listAnomalies({ status: 'open' });
        assert.equal(during.length, 2);
        const gap = during.find((item) => item.clause_id === 'source_completeness');
        const technical = during.find((item) => item.error_signature === 'destination_write_failed');
        assert.equal(gap.error_signature, 'source_data_incomplete');
        assert.equal(gap.occurrence_count, 1);
        assert.equal(technical.occurrence_count, 2);
        const storedMissing = db.registry.getEvent(missing.event_id);
        assert.equal(storedMissing.event_type, 'data_missing');
        assert.equal(storedMissing.status, 'partial');
        assert.equal(storedMissing.error_signature, null);
        assert.equal(db.registry.listIncidents({ state: 'DETECTE' }).length, 1);

        const done = dailyEvent();
        assert.equal(ingestEvent(db.registry, SCHEMA, done, { contracts: db.contracts }).status, 201);
        assert.equal(db.registry.listAnomalies({ status: 'open' }).filter((item) => item.flow_id === 'METEO_STAT_DAILY').length, 0);
        const closed = db.registry.listIncidents({}).filter((item) => item.flow_id === 'METEO_STAT_DAILY');
        assert.equal(closed.length, 1);
        assert.equal(closed[0].state, 'CLOS');
        assert.equal(db.registry.listAnomalies({ status: 'open' }).filter((item) => item.flow_id === 'METEO_01').length, 0);
        assert.equal(db.registry.listAnomalies({ status: 'open' }).filter((item) => item.flow_id === 'CSV_OASSIS_01').length, 0);
    });

    it('classe une lecture source en connector_error sans fermer une autre signature', () => {
        const source = failureEvent('source_read_failed', 'connector_error');
        assert.equal(ingestEvent(db.registry, SCHEMA, source, { contracts: db.contracts }).status, 201);
        const open = db.registry.listAnomalies({ status: 'open' }).filter((item) => item.flow_id === 'METEO_STAT_DAILY');
        assert.equal(open.length, 1);
        assert.equal(open[0].error_signature, 'source_read_failed');
    });
});

describe('anomalie données manquantes METEO_STAT_DAILY', { concurrency: false }, () => {
    const FIXTURE = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'dju-data-missing.json'), 'utf8')
    );
    const CSV_MISSING = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-data-missing.json'), 'utf8')
    );
    const METEO_OK = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-data-received.json'), 'utf8')
    );
    let db;

    before(() => {
        db = openDb();
    });

    after(() => {
        db.close();
    });

    it('ouvre une anomalie stable, ignore les répétitions équivalentes, puis le succès la résout', () => {
        const flow = db.contracts.flows.find((item) => item.flow_id === 'METEO_STAT_DAILY');
        const first = Object.assign({}, FIXTURE, { event_id: crypto.randomUUID() });
        assert.equal(first.event_type, 'data_missing');
        assert.equal(first.status, 'partial');
        assert.equal(first.error_signature, undefined);
        const raw = JSON.stringify(first);
        assert.equal(/tagValue|temperature|password|Geneve_DJU|Geneve_temp|SELECT /i.test(raw), false);
        assert.ok(Object.values(first.metadata).every((value) => !Array.isArray(value)));
        assert.equal(ingestEvent(db.registry, SCHEMA, first, { contracts: db.contracts }).status, 201);

        const open = db.registry.listAnomalies({ status: 'open' });
        assert.equal(open.length, 1);
        assert.equal(open[0].flow_id, 'METEO_STAT_DAILY');
        assert.equal(open[0].clause_id, 'source_completeness');
        assert.equal(open[0].error_signature, 'source_data_incomplete');
        assert.equal(open[0].occurrence_count, 1);
        assert.equal(open[0].status, 'open');
        assert.equal(Object.prototype.hasOwnProperty.call(open[0], 'days'), false);
        assert.equal(open[0].error_signature.includes('2026'), false);
        const stored = db.registry.getEvent(first.event_id);
        assert.equal(stored.event_type, 'data_missing');
        assert.equal(stored.status, 'partial');
        assert.equal(stored.error_signature, null);
        assert.equal(JSON.parse(stored.payload_json).metadata.business_date, '2026-10-22');
        assert.equal(projectFlowStatus(db.registry, flow).status, 'degraded');
        assert.equal(projectFlowStatus(db.registry, flow).status_reason, 'anomaly_open');
        assert.equal(db.registry.listIncidents({}).length, 0);

        const repeated = dailyEvent({
            event_type: 'data_missing',
            status: 'partial',
            error_signature: 'other_gap',
            metadata: { step: 'source', code: 'source_data_incomplete', incomplete_days: 3 }
        });
        assert.equal(ingestEvent(db.registry, SCHEMA, repeated, { contracts: db.contracts }).status, 201);
        const still = db.registry.listAnomalies({ status: 'open' });
        assert.equal(still.length, 1);
        assert.equal(still[0].anomaly_id, open[0].anomaly_id);
        assert.equal(still[0].occurrence_count, 2);
        assert.equal(still[0].error_signature, 'source_data_incomplete');
        assert.equal(Object.prototype.hasOwnProperty.call(still[0], 'business_date'), false);
        assert.ok(db.registry.getEvent(first.event_id));
        assert.equal(db.registry.getEvent(repeated.event_id).event_type, 'data_missing');
        assert.equal(JSON.parse(db.registry.getEvent(repeated.event_id).payload_json).metadata.business_date, undefined);
        const detected = db.registry.listIncidents({ state: 'DETECTE' });
        assert.equal(detected.length, 1);
        assert.equal(detected[0].error_signature, 'source_data_incomplete');
        assert.equal(detected[0].clause_id, 'source_completeness');
        assert.equal(projectFlowStatus(db.registry, flow).status_reason, 'incident_detecte');

        const replay = ingestEvent(db.registry, SCHEMA, repeated, { contracts: db.contracts });
        assert.equal(replay.status, 200);
        assert.equal(replay.duplicate, true);
        assert.equal(db.registry.listAnomalies({ status: 'open' })[0].occurrence_count, 2);

        const technical = failureEvent('destination_write_failed', 'destination_error');
        assert.equal(ingestEvent(db.registry, SCHEMA, technical, { contracts: db.contracts }).status, 201);
        const split = db.registry.listAnomalies({ status: 'open' });
        assert.equal(split.length, 2);
        assert.equal(split.find((item) => item.clause_id === 'source_completeness').occurrence_count, 2);
        assert.equal(split.find((item) => item.clause_id === 'availability').error_signature, 'destination_write_failed');

        const fatalLookalike = dailyEvent({
            event_type: 'data_missing',
            status: 'failure',
            error_signature: 'source_data_incomplete',
            metadata: { step: 'source', code: 'source_data_incomplete' }
        });
        assert.equal(ingestEvent(db.registry, SCHEMA, fatalLookalike, { contracts: db.contracts }).status, 201);
        assert.equal(db.registry.getEvent(fatalLookalike.event_id).event_type, 'data_missing');
        assert.equal(db.registry.listAnomalies({ status: 'open' }).length, 2);
        assert.equal(
            db.registry.listAnomalies({ status: 'open' }).some((item) => item.error_signature === 'execution_failed' || item.error_signature === 'execution:failed'),
            false
        );

        const csv = Object.assign({}, CSV_MISSING, { event_id: crypto.randomUUID() });
        assert.equal(ingestEvent(db.registry, SCHEMA, csv, { contracts: db.contracts }).status, 201);
        assert.equal(db.registry.listAnomalies({ status: 'open' }).filter((item) => item.flow_id === 'CSV_OASSIS_01').length, 0);
        const meteoPartial = Object.assign({}, METEO_OK, {
            event_id: crypto.randomUUID(),
            status: 'partial'
        });
        assert.equal(ingestEvent(db.registry, SCHEMA, meteoPartial, { contracts: db.contracts }).status, 201);
        assert.equal(db.registry.listAnomalies({ status: 'open' }).filter((item) => item.flow_id === 'METEO_01').length, 0);

        const rejected = ingestEvent(db.registry, SCHEMA, dailyEvent({ producer: 'not-a-producer' }), { contracts: db.contracts });
        assert.equal(rejected.status, 400);
        assert.equal(rejected.error, 'validation_failed');

        const done = dailyEvent();
        assert.equal(ingestEvent(db.registry, SCHEMA, done, { contracts: db.contracts }).status, 201);
        assert.equal(db.registry.listAnomalies({ status: 'open' }).length, 0);
        const incidents = db.registry.listIncidents({});
        assert.equal(incidents.length, 1);
        assert.equal(incidents[0].state, 'CLOS');
        assert.equal(incidents[0].error_signature, 'source_data_incomplete');
        const nominal = projectFlowStatus(db.registry, flow);
        assert.equal(nominal.status, 'ok');
        assert.equal(nominal.status_reason, 'nominal');
        assert.equal(db.registry.listAnomalies({ status: 'closed' }).filter((item) => item.clause_id === 'source_completeness').length, 1);
    });
});

describe('HTTP flux METEO_STAT_DAILY', { concurrency: false }, () => {
    let db;
    let server;
    let port;

    before(async () => {
        db = openDb();
        server = createIngestServer(db.registry, { contracts: db.contracts, token: '' });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
    });

    after(async () => {
        if (server) await new Promise((resolve) => server.close(resolve));
        if (db) db.close();
    });

    it('expose le flux déclaré sans modifier METEO_01', async () => {
        const listed = await requestJson(port, 'GET', '/v1/flows');
        assert.equal(listed.status, 200);
        const daily = listed.json.flows.find((item) => item.flow_id === 'METEO_STAT_DAILY');
        const meteo = listed.json.flows.find((item) => item.flow_id === 'METEO_01');
        assert.ok(daily);
        assert.equal(daily.source_id, 'SRC_SQLSERVER_METEO');
        assert.ok(meteo);
        assert.equal(meteo.connector_id, 'CONN_API_METEO');
        assert.ok(listed.json.rules.some((item) => item.rule_id === 'METEO_STAT_DAILY:availability:v1'));
        assert.ok(listed.json.rules.some((item) => item.rule_id === 'METEO_STAT_DAILY:source_completeness:v1'));
        assert.ok(listed.json.rules.some((item) => item.rule_id === 'METEO_01:availability:v1'));
        assert.ok(listed.json.rules.some((item) => item.rule_id === 'CSV_OASSIS_01:availability:v1'));
    });
});
