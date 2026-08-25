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
const { applyEventToAnomalies } = require('../runtime/anomalies');
const { STATES, canTransition, MIN_SIMILAR_FACTS, transitionIncident } = require('../runtime/incidents');

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

function tmpDb() {
    return path.join(
        os.tmpdir(),
        `watchdog-lot5-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
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

describe('cycle d\'états Lot 5', () => {
    it('déclare le cycle verrouillé sans saut', () => {
        assert.deepEqual(STATES, [
            'DETECTE', 'OUVERT', 'EN_ANALYSE', 'EN_CORRECTION',
            'EN_VALIDATION', 'RESOLU', 'CLOS'
        ]);
        assert.equal(canTransition('DETECTE', 'OUVERT'), true);
        assert.equal(canTransition('DETECTE', 'CLOS'), true);
        assert.equal(canTransition('DETECTE', 'EN_ANALYSE'), false);
        assert.equal(canTransition('OUVERT', 'CLOS'), false);
        assert.equal(canTransition('RESOLU', 'CLOS'), true);
        assert.equal(canTransition('CLOS', 'OUVERT'), false);
        assert.equal(MIN_SIMILAR_FACTS, 2);
    });
});

describe('corrélation incidents Lot 5', { concurrency: false }, () => {
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

    it('applique le schéma version 3', () => {
        assert.ok(SCHEMA_VERSION >= 3);
        assert.equal(registry.health().incidents, 0);
        assert.equal(registry.health().incidents_active, 0);
    });

    it('un seul échec ouvre une anomalie, pas d\'incident', () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(registry.listAnomalies({ status: 'open' }).length, 1);
        assert.equal(registry.listIncidents().length, 0);
    });

    it('un deuxième fait similaire ouvre un incident DETECTE avec liens et historique', () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        const incidents = registry.listIncidents({ state: 'DETECTE' });
        assert.equal(incidents.length, 1);
        assert.equal(incidents[0].flow_id, 'METEO_01');
        const links = registry.listIncidentLinks(incidents[0].incident_id);
        const events = links.filter((l) => l.target_kind === 'event');
        const anomalies = links.filter((l) => l.target_kind === 'anomaly');
        assert.ok(events.length >= 2);
        assert.equal(anomalies.length, 1);
        const history = registry.listIncidentHistory(incidents[0].incident_id);
        assert.equal(history.length, 1);
        assert.equal(history[0].from_state, null);
        assert.equal(history[0].to_state, 'DETECTE');
        assert.equal(history[0].actor, 'watchdog-internal');
        assert.equal(registry.health().incidents_active, 1);
    });

    it('un troisième fait s\'accroche au même incident', () => {
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        ingestEvent(registry, SCHEMA, event, { contracts });
        assert.equal(registry.listIncidents().length, 1);
        const incident = registry.listIncidents()[0];
        const events = registry.listIncidentLinks(incident.incident_id).filter((l) => l.target_kind === 'event');
        assert.ok(events.length >= 3);
        assert.equal(incident.last_event_id, event.event_id);
    });

    it('une signature différente ouvre un autre incident', () => {
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT, {
            event_id: crypto.randomUUID(),
            event_type: 'connector_error',
            error_signature: 'ogd_fetch:smn'
        }), { contracts });
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT, {
            event_id: crypto.randomUUID(),
            event_type: 'connector_error',
            error_signature: 'ogd_fetch:smn'
        }), { contracts });
        assert.equal(registry.listIncidents({ state: 'DETECTE' }).length, 2);
    });

    it('partial ne crée ni n\'accroche d\'incident', () => {
        const before = registry.listIncidents().length;
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_OK, {
            event_id: crypto.randomUUID(),
            status: 'partial',
            records: 120
        }), { contracts });
        assert.equal(registry.listIncidents().length, before);
    });

    it('un succès ferme les incidents DETECTE, pas les OUVERT', () => {
        const detecte = registry.listIncidents({ state: 'DETECTE' });
        const keep = detecte[0];
        transitionIncident(registry, keep, 'OUVERT', { actor: 'operator', reason: 'ack' });
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_OK, { event_id: crypto.randomUUID() }), { contracts });
        assert.equal(registry.getIncident(keep.incident_id).state, 'OUVERT');
        const stillDetecte = registry.listIncidents({ state: 'DETECTE' });
        assert.equal(stillDetecte.length, 0);
        const closed = registry.listIncidents({ state: 'CLOS' });
        assert.ok(closed.length >= 1);
        const hist = registry.listIncidentHistory(closed[0].incident_id);
        assert.ok(hist.some((h) => h.to_state === 'CLOS' && h.reason === 'flow_recovered'));
    });

    it('après CLOS, deux nouveaux échecs créent un nouvel incident', () => {
        ingestEvent(registry, SCHEMA, cloneEvent(CSV_FAIL, { event_id: crypto.randomUUID() }), { contracts });
        ingestEvent(registry, SCHEMA, cloneEvent(CSV_FAIL, { event_id: crypto.randomUUID() }), { contracts });
        const csv = registry.listIncidents({ state: 'DETECTE' }).filter((i) => i.flow_id === 'CSV_OASSIS_01');
        assert.equal(csv.length, 1);
    });

    it('le module anomalies ne crée pas d\'incident', () => {
        const stats = applyEventToAnomalies(
            registry,
            cloneEvent(METEO_OK, { event_id: crypto.randomUUID() }),
            contracts
        );
        assert.equal(Object.prototype.hasOwnProperty.call(stats, 'incidents'), false);
    });

    it('n\'échoue pas l\'ingest si le moteur d\'incidents throw', () => {
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() }), { contracts });
        const broken = Object.create(registry);
        broken.insertIncident = () => {
            throw new Error('incidents boom');
        };
        const event = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        const result = ingestEvent(broken, SCHEMA, event, { contracts });
        assert.equal(result.status, 201);
        assert.ok(registry.getEvent(event.event_id));
    });
});

describe('HTTP incidents Lot 5', { concurrency: false }, () => {
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

    it('POST deux timeouts puis GET /v1/incidents', async () => {
        const first = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        const second = cloneEvent(METEO_TIMEOUT, { event_id: crypto.randomUUID() });
        assert.equal((await requestJson(port, 'POST', '/v1/events', first)).status, 201);
        assert.equal((await requestJson(port, 'POST', '/v1/events', second)).status, 201);
        const listed = await requestJson(port, 'GET', '/v1/incidents?state=DETECTE');
        assert.equal(listed.status, 200);
        assert.equal(listed.json.incidents.length, 1);
        const id = listed.json.incidents[0].incident_id;
        const one = await requestJson(port, 'GET', `/v1/incidents/${id}`);
        assert.equal(one.status, 200);
        assert.deepEqual(one.json.allowed_transitions, ['OUVERT', 'CLOS']);
        assert.ok(one.json.history.length >= 1);
        assert.ok(one.json.links.some((l) => l.target_kind === 'anomaly'));
        const health = await requestJson(port, 'GET', '/healthz');
        assert.equal(health.json.incidents_active, 1);
    });

    it('refuse un saut d\'état et accepte DETECTE → OUVERT', async () => {
        const listed = await requestJson(port, 'GET', '/v1/incidents?state=DETECTE');
        const id = listed.json.incidents[0].incident_id;
        const skipped = await requestJson(port, 'PATCH', `/v1/incidents/${id}`, { to_state: 'EN_ANALYSE' });
        assert.equal(skipped.status, 409);
        const opened = await requestJson(port, 'PATCH', `/v1/incidents/${id}`, {
            to_state: 'OUVERT',
            actor: 'operator',
            reason: 'ack'
        });
        assert.equal(opened.status, 200);
        assert.equal(opened.json.incident.state, 'OUVERT');
        assert.ok(opened.json.history.some((h) => h.to_state === 'OUVERT' && h.actor === 'operator'));
    });

    it('refuse un state inconnu en query', async () => {
        const res = await requestJson(port, 'GET', '/v1/incidents?state=OFFLINE');
        assert.equal(res.status, 400);
        assert.equal(res.json.error, 'invalid_state');
    });
});
