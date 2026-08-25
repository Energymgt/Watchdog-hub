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
const { recordAction } = require('../runtime/actions');
const { recordResolution } = require('../runtime/resolutions');
const { projectFlowStatus } = require('../runtime/flow-status');

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

function tmpDb() {
    return path.join(
        os.tmpdir(),
        `watchdog-lot7-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
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

function advanceTo(registry, incidentId, toState) {
    const incident = registry.getIncident(incidentId);
    return recordAction(registry, incident, {
        actor: 'operator',
        to_state: toState,
        comment: `to ${toState}`
    });
}

function toEnValidation(registry, incidentId) {
    for (const state of ['OUVERT', 'EN_ANALYSE', 'EN_CORRECTION', 'EN_VALIDATION']) {
        const moved = advanceTo(registry, incidentId, state);
        assert.equal(moved.status, 201, moved.error);
    }
    return registry.getIncident(incidentId);
}

describe('resolutions Lot 7', { concurrency: false }, () => {
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

    it('applique le schéma version 5', () => {
        assert.ok(SCHEMA_VERSION >= 5);
        assert.equal(registry.health().resolutions, 0);
    });

    it('un flux sans événement est unknown', () => {
        const flow = contracts.flows.find((f) => f.flow_id === 'CSV_OASSIS_01');
        const projection = projectFlowStatus(registry, flow);
        assert.equal(projection.status, 'unknown');
        assert.equal(projection.status_reason, 'no_events');
    });

    it('deux échecs puis DETECTE projettent degraded', () => {
        const incident = openIncident(registry, contracts);
        const flow = contracts.flows.find((f) => f.flow_id === 'METEO_01');
        const projection = projectFlowStatus(registry, flow);
        assert.equal(incident.state, 'DETECTE');
        assert.equal(projection.status, 'degraded');
        assert.equal(projection.status_reason, 'incident_detecte');
    });

    it('refuse une résolution tant que l\'incident n\'est pas EN_VALIDATION', () => {
        const incident = registry.listIncidents({ state: 'DETECTE' })[0];
        const tooSoon = recordResolution(registry, incident, {
            actor: 'operator',
            comment: 'trop tôt'
        });
        assert.equal(tooSoon.status, 409);
        assert.equal(tooSoon.error, 'not_en_validation');
        assert.equal(registry.getIncident(incident.incident_id).state, 'DETECTE');
    });

    it('refuse RESOLU hors résolution, même en EN_VALIDATION', () => {
        const incident = registry.listIncidents({ state: 'DETECTE' })[0];
        toEnValidation(registry, incident.incident_id);
        const blocked = recordAction(registry, registry.getIncident(incident.incident_id), {
            actor: 'operator',
            to_state: 'RESOLU',
            comment: 'contourner'
        });
        assert.equal(blocked.status, 409);
        assert.equal(blocked.error, 'resolution_required');
        assert.equal(registry.getIncident(incident.incident_id).state, 'EN_VALIDATION');

        const noComment = recordResolution(registry, registry.getIncident(incident.incident_id), {
            actor: 'operator'
        });
        assert.equal(noComment.status, 400);
        assert.equal(noComment.error, 'comment_required');
    });

    it('enregistre la résolution, passe à RESOLU, et le flux redevient ok après succès', () => {
        const waiting = registry.listIncidents({ state: 'EN_VALIDATION' })[0];
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_OK, { event_id: crypto.randomUUID() }), { contracts });
        assert.equal(registry.getIncident(waiting.incident_id).state, 'EN_VALIDATION');

        const flow = contracts.flows.find((f) => f.flow_id === 'METEO_01');
        assert.equal(projectFlowStatus(registry, flow).status, 'down');

        const resolved = recordResolution(registry, registry.getIncident(waiting.incident_id), {
            actor: 'operator',
            comment: 'timeout OGD disparu, cycle Import Auto OK'
        });
        assert.equal(resolved.status, 201);
        assert.equal(resolved.incident.state, 'RESOLU');
        assert.equal(resolved.resolution.actor, 'operator');
        assert.equal(registry.listResolutions(waiting.incident_id).length, 1);
        assert.equal(projectFlowStatus(registry, flow).status, 'ok');
        assert.equal(projectFlowStatus(registry, flow).status_reason, 'nominal');
    });
});

describe('HTTP resolutions Lot 7', { concurrency: false }, () => {
    let registry;
    let server;
    let port;
    let dbPath;
    let incidentId;

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

    it('GET /v1/flows/:id unknown puis degraded après deux échecs', async () => {
        const unknown = await requestJson(port, 'GET', '/v1/flows/CSV_OASSIS_01');
        assert.equal(unknown.status, 200);
        assert.equal(unknown.json.flow.status, 'unknown');

        const missing = await requestJson(port, 'GET', '/v1/flows/UNKNOWN_FLOW');
        assert.equal(missing.status, 404);

        assert.equal((await requestJson(port, 'POST', '/v1/events', cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() }))).status, 201);
        assert.equal((await requestJson(port, 'POST', '/v1/events', cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() }))).status, 201);
        const listed = await requestJson(port, 'GET', '/v1/incidents?state=DETECTE');
        incidentId = listed.json.incidents[0].incident_id;

        const degraded = await requestJson(port, 'GET', '/v1/flows/METEO_01');
        assert.equal(degraded.status, 200);
        assert.equal(degraded.json.flow.status, 'degraded');
        assert.equal(degraded.json.flow.status_reason, 'incident_detecte');
    });

    it('PATCH vers RESOLU est refusé ; POST /resolutions passe à RESOLU', async () => {
        for (const state of ['OUVERT', 'EN_ANALYSE', 'EN_CORRECTION', 'EN_VALIDATION']) {
            const moved = await requestJson(port, 'PATCH', `/v1/incidents/${incidentId}`, {
                actor: 'operator',
                to_state: state,
                comment: state
            });
            assert.equal(moved.status, 200, moved.json && moved.json.error);
        }

        const skipped = await requestJson(port, 'PATCH', `/v1/incidents/${incidentId}`, {
            actor: 'operator',
            to_state: 'RESOLU',
            comment: 'contourner'
        });
        assert.equal(skipped.status, 409);
        assert.equal(skipped.json.error, 'resolution_required');

        const viaAction = await requestJson(port, 'POST', `/v1/incidents/${incidentId}/actions`, {
            actor: 'operator',
            to_state: 'RESOLU',
            comment: 'contourner action'
        });
        assert.equal(viaAction.status, 409);
        assert.equal(viaAction.json.error, 'resolution_required');

        assert.equal((await requestJson(port, 'POST', '/v1/events', cloneEvent(METEO_OK, { event_id: crypto.randomUUID() }))).status, 201);

        const down = await requestJson(port, 'GET', '/v1/flows/METEO_01');
        assert.equal(down.json.flow.status, 'down');

        const posted = await requestJson(port, 'POST', `/v1/incidents/${incidentId}/resolutions`, {
            actor: 'operator',
            comment: 'cycle Import Auto OK'
        });
        assert.equal(posted.status, 201);
        assert.equal(posted.json.incident.state, 'RESOLU');
        assert.equal(posted.json.resolution.comment, 'cycle Import Auto OK');

        const listed = await requestJson(port, 'GET', `/v1/incidents/${incidentId}/resolutions`);
        assert.equal(listed.status, 200);
        assert.equal(listed.json.resolutions.length, 1);

        const detail = await requestJson(port, 'GET', `/v1/incidents/${incidentId}`);
        assert.equal(detail.json.resolutions.length, 1);
        assert.equal(detail.json.incident.state, 'RESOLU');

        const ok = await requestJson(port, 'GET', '/v1/flows/METEO_01');
        assert.equal(ok.json.flow.status, 'ok');

        const health = await requestJson(port, 'GET', '/healthz');
        assert.ok(health.json.resolutions >= 1);
    });
});
