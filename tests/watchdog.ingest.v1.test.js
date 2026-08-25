'use strict';

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');

const { openRegistry } = require('../runtime/registry');
const { ingestEvent, publicEventRow } = require('../runtime/ingest');
const { createIngestServer } = require('../runtime/server');

const ROOT = path.join(__dirname, '..');
const SCHEMA = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'watchdog.event.v1.schema.json'), 'utf8')
);
const VALID_METEO = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-data-received.json'), 'utf8')
);

function tmpDb() {
    return path.join(
        os.tmpdir(),
        `watchdog-lot1-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
    );
}

function requestJson(port, method, urlPath, body, headers) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
            headers: Object.assign({
                Accept: 'application/json',
                ...(payload ? {
                    'Content-Type': 'application/json',
                    'Content-Length': payload.length
                } : {})
            }, headers || {})
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

describe('registre SQLite Lot 1', () => {
    let registry;
    let dbPath;

    before(() => {
        dbPath = tmpDb();
        registry = openRegistry(dbPath);
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

    it('persiste un événement valide et pose ingested_at', () => {
        const result = ingestEvent(registry, SCHEMA, VALID_METEO);
        assert.equal(result.status, 201);
        assert.equal(result.duplicate, false);
        assert.ok(result.ingested_at);
        assert.match(result.ingested_at, /Z$/);
        const row = registry.getEvent(VALID_METEO.event_id);
        assert.ok(row);
        assert.equal(row.flow_id, 'METEO_01');
        assert.equal(row.event_type, 'data_received');
        assert.equal(publicEventRow(row).payload.records, 240);
        assert.equal(Object.prototype.hasOwnProperty.call(publicEventRow(row).payload, 'ingested_at'), false);
    });

    it('est idempotent sur le même payload', () => {
        const result = ingestEvent(registry, SCHEMA, VALID_METEO);
        assert.equal(result.status, 200);
        assert.equal(result.duplicate, true);
        assert.equal(registry.health().events, 1);
    });

    it('rejette un même event_id avec un payload différent', () => {
        const conflicting = Object.assign({}, VALID_METEO, { records: 1 });
        const result = ingestEvent(registry, SCHEMA, conflicting);
        assert.equal(result.status, 409);
        assert.equal(result.error, 'event_id_conflict');
        assert.equal(registry.getEvent(VALID_METEO.event_id).records, 240);
    });

    it('refuse un événement hors contrat', () => {
        const result = ingestEvent(registry, SCHEMA, { schema: 'watchdog.event.v1' });
        assert.equal(result.status, 400);
        assert.equal(result.error, 'validation_failed');
        assert.ok(result.errors.length > 0);
        assert.equal(registry.health().events, 1);
    });
});

describe('HTTP ingest Lot 1', () => {
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

    it('POST /v1/events accepte une fixture météo', async () => {
        const fixture = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-execution-completed.json'), 'utf8')
        );
        const res = await requestJson(port, 'POST', '/v1/events', fixture);
        assert.equal(res.status, 201);
        assert.equal(res.json.ok, true);
        assert.equal(res.json.duplicate, false);
        assert.equal(res.json.event_id, fixture.event_id);
    });

    it('POST /v1/events rejoue sans dupliquer la ligne', async () => {
        const fixture = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-execution-completed.json'), 'utf8')
        );
        const res = await requestJson(port, 'POST', '/v1/events', fixture);
        assert.equal(res.status, 200);
        assert.equal(res.json.duplicate, true);
        const listed = await requestJson(port, 'GET', '/v1/events?limit=10');
        assert.equal(listed.status, 200);
        const matches = listed.json.events.filter((e) => e.event_id === fixture.event_id);
        assert.equal(matches.length, 1);
    });

    it('POST /v1/events refuse un contrat invalide', async () => {
        const res = await requestJson(port, 'POST', '/v1/events', { schema: 'watchdog.event.v0' });
        assert.equal(res.status, 400);
        assert.equal(res.json.error, 'validation_failed');
    });

    it('GET /v1/events/:id relit l\'événement ingéré', async () => {
        const fixture = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-execution-completed.json'), 'utf8')
        );
        const res = await requestJson(port, 'GET', `/v1/events/${fixture.event_id}`);
        assert.equal(res.status, 200);
        assert.equal(res.json.event.flow_id, 'CSV_OASSIS_01');
        assert.equal(res.json.event.payload.records, 1540);
    });

    it('GET /healthz expose le registre', async () => {
        const res = await requestJson(port, 'GET', '/healthz');
        assert.equal(res.status, 200);
        assert.equal(res.json.ok, true);
        assert.equal(res.json.registry, 'sqlite');
        assert.ok(res.json.events >= 1);
    });

    it('POST refuse un Content-Type non JSON', async () => {
        const res = await requestJson(port, 'POST', '/v1/events', VALID_METEO, {
            'Content-Type': 'text/plain'
        });
        assert.equal(res.status, 415);
    });
});

describe('HTTP ingest auth (WATCHDOG_INGEST_TOKEN)', () => {
    const TOKEN = 'test-ingest-token-a0';
    let registry;
    let server;
    let port;
    let dbPath;
    const fixture = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'csv-execution-completed.json'), 'utf8')
    );

    before(async () => {
        dbPath = tmpDb();
        registry = openRegistry(dbPath);
        server = createIngestServer(registry, { token: TOKEN });
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

    it('POST /v1/events sans header → 401', async () => {
        const res = await requestJson(port, 'POST', '/v1/events', fixture);
        assert.equal(res.status, 401);
        assert.equal(res.json.ok, false);
        assert.equal(res.json.error, 'unauthorized');
        assert.equal(JSON.stringify(res.json).includes(TOKEN), false);
    });

    it('GET /v1/events sans header → 401', async () => {
        const res = await requestJson(port, 'GET', '/v1/events');
        assert.equal(res.status, 401);
        assert.equal(res.json.error, 'unauthorized');
        assert.equal(JSON.stringify(res.json).includes(TOKEN), false);
    });

    it('POST /v1/events avec un mauvais token → 401', async () => {
        const res = await requestJson(port, 'POST', '/v1/events', fixture, {
            'X-Watchdog-Token': 'wrong-token'
        });
        assert.equal(res.status, 401);
        assert.equal(res.json.error, 'unauthorized');
        assert.equal(JSON.stringify(res.json).includes(TOKEN), false);
        assert.equal(JSON.stringify(res.json).includes('wrong-token'), false);
    });

    it('POST /v1/events avec X-Watchdog-Token → succès', async () => {
        const res = await requestJson(port, 'POST', '/v1/events', fixture, {
            'X-Watchdog-Token': TOKEN
        });
        assert.equal(res.status, 201);
        assert.equal(res.json.ok, true);
        assert.equal(res.json.event_id, fixture.event_id);
    });

    it('GET /v1/events avec Authorization Bearer → succès', async () => {
        const res = await requestJson(port, 'GET', '/v1/events?limit=5', undefined, {
            Authorization: `Bearer ${TOKEN}`
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.ok, true);
        assert.ok(Array.isArray(res.json.events));
    });

    it('GET /healthz sans header → 200', async () => {
        const res = await requestJson(port, 'GET', '/healthz');
        assert.equal(res.status, 200);
        assert.equal(res.json.ok, true);
        assert.equal(res.json.registry, 'sqlite');
    });
});
