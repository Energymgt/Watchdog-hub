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
const { loadHealthContracts } = require('../runtime/health-contracts');
const { ACTION_KINDS, recordAction } = require('../runtime/actions');

const ROOT = path.join(__dirname, '..');
const SCHEMA = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'watchdog.event.v1.schema.json'), 'utf8')
);
const METEO_TIMEOUT = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-timeout.json'), 'utf8')
);

function tmpDb() {
    return path.join(
        os.tmpdir(),
        `watchdog-lot6-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
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

function openIncident(registry, contracts) {
    ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() }), { contracts });
    ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() }), { contracts });
    return registry.listIncidents({ state: 'DETECTE' })[0];
}

describe('actions Lot 6', { concurrency: false }, () => {
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

    it('applique le schéma version 4', () => {
        assert.ok(SCHEMA_VERSION >= 4);
        assert.deepEqual(ACTION_KINDS, ['note', 'transition']);
        assert.equal(registry.health().actions, 0);
    });

    it('enregistre une note sans changer l\'état', () => {
        const incident = openIncident(registry, contracts);
        const result = recordAction(registry, incident, {
            actor: 'operator',
            kind: 'note',
            comment: 'timeout OGD vu sur Import Auto'
        });
        assert.equal(result.status, 201);
        assert.equal(result.action.kind, 'note');
        assert.equal(registry.getIncident(incident.incident_id).state, 'DETECTE');
        assert.equal(registry.listActions(incident.incident_id).length, 1);
    });

    it('une transition DETECTE → OUVERT est une action, pas un restart', () => {
        const incident = registry.getIncident(openIncident(registry, contracts).incident_id);
        const result = recordAction(registry, incident, {
            actor: 'operator',
            to_state: 'OUVERT',
            comment: 'prise en compte'
        });
        assert.equal(result.status, 201);
        assert.equal(result.incident.state, 'OUVERT');
        assert.equal(result.action.kind, 'transition');
        assert.equal(result.action.to_state, 'OUVERT');
    });

    it('refuse un kind d\'orchestration', () => {
        const incident = registry.listIncidents({ state: 'OUVERT' })[0];
        const result = recordAction(registry, incident, {
            actor: 'operator',
            kind: 'restart',
            comment: 'reboot gateway'
        });
        assert.equal(result.status, 400);
        assert.equal(result.error, 'invalid_kind');
        assert.equal(registry.getIncident(incident.incident_id).state, 'OUVERT');
    });

    it('refuse une note sans commentaire', () => {
        const incident = registry.listIncidents({ state: 'OUVERT' })[0];
        const result = recordAction(registry, incident, { actor: 'operator', kind: 'note' });
        assert.equal(result.status, 400);
        assert.equal(result.error, 'comment_required');
    });
});

describe('HTTP actions Lot 6', { concurrency: false }, () => {
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

    it('POST /v1/incidents/:id/actions note puis GET', async () => {
        const first = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        const second = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        assert.equal((await requestJson(port, 'POST', '/v1/events', first)).status, 201);
        assert.equal((await requestJson(port, 'POST', '/v1/events', second)).status, 201);
        const listed = await requestJson(port, 'GET', '/v1/incidents?state=DETECTE');
        const id = listed.json.incidents[0].incident_id;
        const posted = await requestJson(port, 'POST', `/v1/incidents/${id}/actions`, {
            actor: 'operator',
            comment: 'analyse en cours'
        });
        assert.equal(posted.status, 201);
        assert.equal(posted.json.action.kind, 'note');
        const listedActions = await requestJson(port, 'GET', `/v1/incidents/${id}/actions`);
        assert.equal(listedActions.status, 200);
        assert.equal(listedActions.json.actions.length, 1);
        const detail = await requestJson(port, 'GET', `/v1/incidents/${id}`);
        assert.equal(detail.json.actions.length, 1);
        assert.equal(detail.json.incident.state, 'DETECTE');
    });
});
