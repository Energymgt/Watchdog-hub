'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { describe, it, before, after } = require('node:test');

const { openRegistry } = require('../runtime/registry');
const { ingestEvent } = require('../runtime/ingest');
const { createIngestServer } = require('../runtime/server');
const { loadHealthContracts } = require('../runtime/health-contracts');
const { recordAction } = require('../runtime/actions');
const { buildTeamsCard } = require('../runtime/channels/teams');
const { runDispatch, reconcileAbandoned, MAX_RETRIES, RETRY_DELAY_MS } = require('../runtime/alert-delivery');
const {
    applyDeviceTransitions,
    acknowledgeAlert,
    openFlowAlert
} = require('../runtime/alerts');

const ROOT = path.join(__dirname, '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'watchdog.event.v1.schema.json'), 'utf8'));
const METEO_TIMEOUT = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-timeout.json'), 'utf8'));
const METEO_OK = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-data-received.json'), 'utf8'));
const FLOW_PATH = path.join(ROOT, 'flows', '04_Watchdog_Hub.json');
const SECRET = 'https://teams.example/do-not-store-this-secret';

function tmpDb() {
    return path.join(os.tmpdir(), `watchdog-alerts-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
}

function removeDb(dbPath) {
    for (const extra of ['', '-wal', '-shm']) {
        try { fs.unlinkSync(dbPath + extra); } catch { /* absent */ }
    }
}

function cloneEvent(base, overrides) {
    return Object.assign({}, base, overrides, { event_id: (overrides && overrides.event_id) || crypto.randomUUID() });
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
                Accept: 'application/json'
            }, headers || {}, payload ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            } : {})
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
                resolve({ status: res.statusCode, raw, json });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function activeAlerts(registry) {
    return registry.listAlerts({ status: 'active', limit: 100 });
}

function writeChild(source) {
    const file = path.join(os.tmpdir(), `watchdog-alert-child-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.js`);
    fs.writeFileSync(file, source);
    return file;
}

function runNode(script, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script].concat(args || []), { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('error', reject);
        child.on('exit', (code) => resolve({ code, stderr }));
    });
}

describe('alertes de flux', { concurrency: false }, () => {
    let registry;
    let dbPath;
    const contracts = loadHealthContracts();

    before(() => {
        dbPath = tmpDb();
        registry = openRegistry(dbPath);
    });

    after(() => {
        registry.close();
        removeDb(dbPath);
    });

    it('n’ouvre pas d’alerte au premier fait', () => {
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        assert.equal(registry.listIncidents().length, 0);
        assert.equal(activeAlerts(registry).length, 0);
    });

    it('ouvre une seule alerte à la naissance de l’incident DETECTE', () => {
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        const alerts = activeAlerts(registry);
        const incident = registry.listIncidents({ state: 'DETECTE' })[0];
        assert.equal(alerts.length, 1);
        assert.equal(alerts[0].incident_id, incident.incident_id);
        assert.equal(alerts[0].correlation_key, incident.correlation_key);
        assert.equal(alerts[0].status, 'open');
        assert.equal(alerts[0].severity, 'high');
        assert.equal(registry.listAlertDeliveries(alerts[0].alert_id).length, 1);
        assert.equal(registry.listAlertDeliveries(alerts[0].alert_id)[0].status, 'pending');
    });

    it('rattache un fait supplémentaire au même incident sans seconde alerte', () => {
        const before = activeAlerts(registry)[0].alert_id;
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        assert.equal(registry.listIncidents().length, 1);
        assert.equal(activeAlerts(registry).length, 1);
        assert.equal(activeAlerts(registry)[0].alert_id, before);
    });

    it('ferme l’alerte sur récupération tant que l’incident est encore DETECTE', () => {
        const alertId = activeAlerts(registry)[0].alert_id;
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_OK), { contracts });
        const incident = registry.listIncidents()[0];
        const alert = registry.getAlert(alertId);
        assert.equal(incident.state, 'CLOS');
        assert.equal(alert.status, 'closed');
        assert.equal(alert.close_reason, 'flow_recovered');
        const history = registry.listAlertHistory(alertId);
        assert.equal(history.some((row) => row.event_type === 'recovery'), true);
        assert.equal(history.some((row) => row.event_type === 'recovery' && row.to_severity === 'recovery'), false);
    });

    it('ouvre une nouvelle alerte après clôture de la précédente', () => {
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        const alerts = registry.listAlerts({ limit: 100 });
        assert.equal(alerts.length, 2);
        assert.equal(alerts.filter((row) => row.status !== 'closed').length, 1);
        assert.notEqual(alerts[0].alert_id, alerts[1].alert_id);
    });

    it('ferme l’alerte après prise en charge sans clôturer l’incident', () => {
        const incident = registry.listIncidents().find((row) => row.state === 'DETECTE');
        const beforeHistory = registry.listIncidentHistory(incident.incident_id).length;
        recordAction(registry, incident, { actor: 'ada', to_state: 'OUVERT', comment: 'prise en charge' });
        const alertId = activeAlerts(registry)[0].alert_id;
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_OK), { contracts });
        const after = registry.getIncident(incident.incident_id);
        assert.equal(after.state, 'OUVERT');
        assert.equal(registry.getAlert(alertId).status, 'closed');
        assert.equal(registry.getAlert(alertId).close_reason, 'flow_recovered');
        assert.ok(registry.listIncidentHistory(incident.incident_id).length >= beforeHistory);
        assert.equal(registry.listIncidentHistory(incident.incident_id).some((row) => row.to_state === 'CLOS'), false);
    });
});

describe('accusé et concurrence', { concurrency: false }, () => {
    let dbPath;
    const contracts = loadHealthContracts();

    before(() => {
        dbPath = tmpDb();
    });

    after(() => removeDb(dbPath));

    it('n’appelle pas transitionIncident et reste idempotent', () => {
        const source = fs.readFileSync(path.join(ROOT, 'runtime', 'alerts.js'), 'utf8');
        assert.equal(source.includes('transitionIncident'), false);
        const registry = openRegistry(dbPath);
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        const incident = registry.listIncidents()[0];
        const historyBefore = registry.listIncidentHistory(incident.incident_id).length;
        const alert = activeAlerts(registry)[0];
        const first = acknowledgeAlert(registry, alert.alert_id, 'ada');
        const second = acknowledgeAlert(registry, alert.alert_id, 'ada');
        assert.equal(first.ok, true);
        assert.equal(second.duplicate, true);
        assert.equal(registry.getIncident(incident.incident_id).state, 'DETECTE');
        assert.equal(registry.listIncidentHistory(incident.incident_id).length, historyBefore);
        assert.equal(registry.listAlertHistory(alert.alert_id).filter((row) => row.event_type === 'acknowledge').length, 1);
        registry.close();
    });

    it('sérialise deux accusés concurrents dans deux processus', async () => {
        const fresh = tmpDb();
        const registry = openRegistry(fresh);
        const contracts = loadHealthContracts();
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        const alert = activeAlerts(registry)[0];
        const incidentId = alert.incident_id;
        const stateBefore = registry.getIncident(incidentId).state;
        registry.close();
        const script = writeChild(`
            const { openRegistry } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'registry.js'))});
            const { acknowledgeAlert } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'alerts.js'))});
            const registry = openRegistry(process.argv[2]);
            const result = acknowledgeAlert(registry, process.argv[3], 'bea');
            registry.close();
            if (!result.ok) process.exit(2);
        `);
        try {
            const codes = await Promise.all([
                runNode(script, [fresh, alert.alert_id]),
                runNode(script, [fresh, alert.alert_id])
            ]);
            assert.deepEqual(codes.map((item) => item.code), [0, 0], codes.map((item) => item.stderr).join('\n'));
        } finally {
            fs.unlinkSync(script);
        }
        const reopened = openRegistry(fresh);
        assert.equal(reopened.listAlertHistory(alert.alert_id).filter((row) => row.event_type === 'acknowledge').length, 1);
        assert.equal(reopened.getIncident(incidentId).state, stateBefore);
        reopened.close();
        removeDb(fresh);
    });

    it('crée une seule alerte quand deux processus traitent le même incident', async () => {
        const fresh = tmpDb();
        const registry = openRegistry(fresh);
        const incident = {
            incident_id: 'inc-concurrent',
            flow_id: 'flow.meteo.export',
            clause_id: 'meteo.timeout',
            error_signature: 'timeout',
            correlation_key: 'flow.meteo.export|meteo.timeout|timeout',
            state: 'DETECTE',
            opened_at: '2026-10-23T10:00:00Z',
            last_event_id: null
        };
        registry.insertIncident(incident);
        registry.close();
        const script = writeChild(`
            const { openRegistry } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'registry.js'))});
            const { openFlowAlert } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'alerts.js'))});
            const registry = openRegistry(process.argv[2]);
            const incident = registry.getIncident(process.argv[3]);
            openFlowAlert(registry, incident);
            registry.close();
        `);
        try {
            const codes = await Promise.all([
                runNode(script, [fresh, incident.incident_id]),
                runNode(script, [fresh, incident.incident_id])
            ]);
            assert.deepEqual(codes.map((item) => item.code), [0, 0]);
        } finally {
            fs.unlinkSync(script);
        }
        const reopened = openRegistry(fresh);
        assert.equal(reopened.listAlerts({ limit: 100 }).length, 1);
        reopened.close();
        removeDb(fresh);
    });
});

describe('alertes d’appareil', { concurrency: false }, () => {
    let registry;
    let dbPath;

    before(() => {
        dbPath = tmpDb();
        registry = openRegistry(dbPath);
    });

    after(() => {
        registry.close();
        removeDb(dbPath);
    });

    it('ignore une transition non confirmée et un état non notifiable', () => {
        const rejected = applyDeviceTransitions(registry, [
            { uuid: 'dev-1', to: 'dead', severity: 'critical', confirmed: false },
            { uuid: 'dev-2', to: 'unknown', severity: 'unknown', confirmed: true }
        ]);
        assert.equal(rejected[0].outcome, 'rejected');
        assert.equal(rejected[1].outcome, 'rejected');
        assert.equal(activeAlerts(registry).length, 0);
    });

    it('conserve la même alerte de heartbeat_missing vers dead et notifie l’aggravation', () => {
        const uuid = '11111111-1111-4111-8111-111111111111';
        const opened = applyDeviceTransitions(registry, [{
            uuid, name: 'Passerelle', from: 'ok', to: 'heartbeat_missing', severity: 'high', confirmed: true
        }])[0];
        acknowledgeAlert(registry, opened.alert.alert_id, 'ada');
        const aggravated = applyDeviceTransitions(registry, [{
            uuid, name: 'Passerelle', from: 'heartbeat_missing', to: 'dead', severity: 'critical', confirmed: true
        }])[0];
        assert.equal(aggravated.outcome, 'aggravated');
        assert.equal(aggravated.alert.alert_id, opened.alert.alert_id);
        assert.equal(aggravated.alert.severity, 'critical');
        assert.equal(aggravated.alert.status, 'acknowledged');
        assert.equal(aggravated.alert.acknowledged_by, 'ada');
        const history = registry.listAlertHistory(opened.alert.alert_id);
        assert.equal(history.filter((row) => row.event_type === 'acknowledge').length, 1);
        assert.equal(history.some((row) => row.event_type === 'aggravation'), true);
        const deliveries = registry.listAlertDeliveries(opened.alert.alert_id);
        assert.equal(deliveries.filter((row) => row.event_type === 'aggravation').length, 1);
    });

    it('ferme l’alerte au retour confirmé sans en créer une autre', () => {
        const uuid = '11111111-1111-4111-8111-111111111111';
        const closed = applyDeviceTransitions(registry, [{
            uuid, name: 'Passerelle', from: 'dead', to: 'ok', direction: 'up', severity: 'ok', confirmed: true
        }])[0];
        assert.equal(closed.outcome, 'closed');
        assert.equal(closed.alert.status, 'closed');
        assert.equal(closed.alert.close_reason, 'device_recovered');
        assert.equal(activeAlerts(registry).length, 0);
        const again = applyDeviceTransitions(registry, [{
            uuid, to: 'ok', direction: 'up', confirmed: true
        }])[0];
        assert.equal(again.outcome, 'ignored');
    });

    it('rejoue le même signal sans seconde livraison et conserve l’accusé lors de l’aggravation', () => {
        const uuid = '22222222-2222-4222-8222-222222222222';
        const openedId = 'fleet:' + uuid + ':ok:heartbeat_missing:down:1000';
        const deadId = 'fleet:' + uuid + ':heartbeat_missing:dead:down:2000';
        const opened = applyDeviceTransitions(registry, [{
            uuid, name: 'Banc', from: 'ok', to: 'heartbeat_missing', severity: 'high', confirmed: true, signal_id: openedId
        }])[0];
        acknowledgeAlert(registry, opened.alert.alert_id, 'bea');
        const replay = applyDeviceTransitions(registry, [{
            uuid, name: 'Banc', from: 'ok', to: 'heartbeat_missing', severity: 'high', confirmed: true, signal_id: openedId
        }])[0];
        assert.equal(replay.duplicate, true);
        assert.equal(replay.outcome, 'opened');
        assert.equal(replay.alert.alert_id, opened.alert.alert_id);
        assert.equal(replay.alert.status, 'acknowledged');
        assert.equal(replay.alert.acknowledged_by, 'bea');
        assert.equal(registry.listAlertDeliveries(opened.alert.alert_id).filter((row) => row.event_type === 'trigger').length, 1);
        const aggravated = applyDeviceTransitions(registry, [{
            uuid, from: 'heartbeat_missing', to: 'dead', severity: 'critical', confirmed: true, signal_id: deadId
        }])[0];
        assert.equal(aggravated.outcome, 'aggravated');
        assert.equal(aggravated.alert.alert_id, opened.alert.alert_id);
        assert.equal(aggravated.alert.acknowledged_by, 'bea');
        const again = applyDeviceTransitions(registry, [{
            uuid, to: 'dead', severity: 'critical', confirmed: true, signal_id: deadId
        }])[0];
        assert.equal(again.duplicate, true);
        const deliveries = registry.listAlertDeliveries(opened.alert.alert_id);
        assert.equal(deliveries.filter((row) => row.event_type === 'trigger').length, 1);
        assert.equal(deliveries.filter((row) => row.event_type === 'aggravation').length, 1);
        assert.equal(registry.listAlertHistory(opened.alert.alert_id).filter((row) => row.event_type === 'acknowledge').length, 1);
    });
});

describe('livraison Teams', { concurrency: false }, () => {
    let registry;
    let dbPath;

    before(() => {
        dbPath = tmpDb();
        registry = openRegistry(dbPath);
    });

    after(() => {
        registry.close();
        removeDb(dbPath);
    });

    function openOne() {
        return applyDeviceTransitions(registry, [{
            uuid: crypto.randomUUID(),
            name: 'Capteur',
            to: 'dead',
            severity: 'critical',
            detail: 'hors service',
            confirmed: true
        }])[0].alert;
    }

    async function dispatch(now, transport) {
        const logs = [];
        const original = console.warn;
        console.warn = (...args) => logs.push(args.join(' '));
        try {
            return {
                summary: await runDispatch(registry, { now, transport, webhookUrl: SECRET }),
                logs
            };
        } finally {
            console.warn = original;
        }
    }

    it('reprend 429 et 5xx après deux secondes, puis s’arrête au plafond', async () => {
        const alert = openOne();
        const codes = [429, 503, 500, 200];
        let index = 0;
        const transport = async () => {
            const statusCode = codes[Math.min(index, codes.length - 1)];
            index += 1;
            return { ok: statusCode >= 200 && statusCode < 300, statusCode, errorKind: 'http_status' };
        };
        const started = Date.parse('2026-10-23T10:00:00Z');
        await dispatch(started, transport);
        let rows = registry.listAlertDeliveries(alert.alert_id);
        assert.equal(rows[0].status, 'failed');
        assert.equal(rows[0].http_status, 429);
        assert.equal(index, 1);
        await dispatch(started + RETRY_DELAY_MS - 1000, transport);
        assert.equal(index, 1);
        await dispatch(started + RETRY_DELAY_MS, transport);
        await dispatch(started + (RETRY_DELAY_MS * 2), transport);
        rows = registry.listAlertDeliveries(alert.alert_id);
        assert.equal(rows.length, 1 + MAX_RETRIES);
        assert.equal(rows[rows.length - 1].status, 'failed');
        assert.equal(rows[rows.length - 1].http_status, 500);
        assert.equal(index, 3);
    });

    it('trace un timeout comme résultat incertain et une reprise possiblement dupliquée', async () => {
        const alert = openOne();
        let calls = 0;
        const transport = async () => {
            calls += 1;
            if (calls === 1) return { ok: false, statusCode: 0, errorKind: 'timeout' };
            return { ok: true, statusCode: 202 };
        };
        const started = Date.parse('2026-10-23T11:00:00Z');
        await dispatch(started, transport);
        const first = registry.listAlertDeliveries(alert.alert_id)[0];
        assert.equal(first.status, 'unknown');
        assert.equal(first.possible_duplicate, 1);
        await dispatch(started + RETRY_DELAY_MS, transport);
        const rows = registry.listAlertDeliveries(alert.alert_id);
        assert.equal(rows[1].status, 'sent');
        assert.equal(rows[1].possible_duplicate, 1);
        assert.equal(rows[1].http_status, 202);
    });

    it('ne stocke pas le secret dans la base, la réponse HTTP ou les journaux', async () => {
        const alert = openOne();
        const logs = [];
        const original = console.warn;
        console.warn = (...args) => logs.push(args.join(' '));
        const transport = async (request) => {
            assert.equal(request.url, SECRET);
            return { ok: true, statusCode: 200 };
        };
        const server = createIngestServer(registry, {
            token: 'ingest-token',
            delivery: { transport }
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        try {
            const denied = await requestJson(port, 'POST', `/v1/alerts/${alert.alert_id}/ack`, { actor: 'ada' });
            assert.equal(denied.status, 401);
            const posted = await requestJson(port, 'POST', '/v1/alerts/device-transitions', {
                transitions: [{ uuid: '22222222-2222-4222-8222-222222222222', to: 'cloud_down', severity: 'warning', confirmed: true, webhook_url: SECRET }],
                webhook_url: SECRET
            }, { 'X-Watchdog-Token': 'ingest-token', 'X-Watchdog-Channel-Secret': SECRET });
            assert.equal(posted.status, 202);
            assert.equal(posted.raw.includes(SECRET), false);
            assert.equal(JSON.stringify(posted.json).includes('webhook'), false);
        } finally {
            console.warn = original;
            await new Promise((resolve) => server.close(resolve));
        }
        const rawDb = fs.readFileSync(dbPath);
        assert.equal(rawDb.includes(Buffer.from(SECRET)), false);
        assert.equal(logs.join('\n').includes(SECRET), false);
        const listed = registry.listAlerts({ limit: 100 });
        assert.equal(JSON.stringify(listed).includes(SECRET), false);
    });
});

describe('reprise après arrêt de processus', () => {
    it('conserve une livraison pending créée par un processus qui s’arrête avant l’envoi', async () => {
        const dbPath = tmpDb();
        const script = writeChild(`
            const { openRegistry } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'registry.js'))});
            const { applyDeviceTransitions } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'alerts.js'))});
            const registry = openRegistry(process.argv[2]);
            applyDeviceTransitions(registry, [{
                uuid: '33333333-3333-4333-8333-333333333333',
                to: 'dead',
                severity: 'critical',
                confirmed: true
            }]);
            const pending = registry.listDueDeliveries('2999-01-01T00:00:00Z', 10);
            registry.close();
            if (pending.length !== 1 || pending[0].status !== 'pending') process.exit(2);
        `);
        try {
            const created = await runNode(script, [dbPath]);
            assert.equal(created.code, 0, created.stderr);
        } finally {
            fs.unlinkSync(script);
        }
        const registry = openRegistry(dbPath);
        const pending = registry.listDueDeliveries('2999-01-01T00:00:00Z', 10);
        assert.equal(pending.length, 1);
        assert.equal(pending[0].status, 'pending');
        const summary = await runDispatch(registry, {
            webhookUrl: 'https://teams.example/local-only',
            transport: async () => ({ ok: true, statusCode: 204 })
        });
        assert.equal(summary.sent, 1);
        registry.close();
        removeDb(dbPath);
    });

    it('marque unknown une livraison restée sending après un arrêt pendant l’envoi', async () => {
        const dbPath = tmpDb();
        const registry = openRegistry(dbPath);
        applyDeviceTransitions(registry, [{
            uuid: '44444444-4444-4444-8444-444444444444',
            to: 'heartbeat_missing',
            severity: 'high',
            confirmed: true
        }]);
        registry.close();
        const script = writeChild(`
            const { openRegistry } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'registry.js'))});
            const { runDispatch } = require(${JSON.stringify(path.join(ROOT, 'runtime', 'alert-delivery.js'))});
            const registry = openRegistry(process.argv[2]);
            runDispatch(registry, {
                webhookUrl: ${JSON.stringify(SECRET)},
                transport() { process.exit(0); }
            }).then(() => process.exit(0));
        `);
        try {
            const stopped = await runNode(script, [dbPath]);
            assert.equal(stopped.code, 0, stopped.stderr);
        } finally {
            fs.unlinkSync(script);
        }
        const reopened = openRegistry(dbPath);
        assert.equal(reopened.listSendingDeliveries().length, 1);
        const reconciled = reconcileAbandoned(reopened, { forceAll: true });
        assert.equal(reconciled, 1);
        const rows = reopened.listAlertDeliveries(reopened.listAlerts({ limit: 10 })[0].alert_id);
        assert.equal(rows[0].status, 'unknown');
        assert.equal(rows[0].error_kind, 'uncertain');
        assert.equal(rows[1].status, 'pending');
        assert.equal(rows[1].possible_duplicate, 1);
        const rawDb = fs.readFileSync(dbPath);
        assert.equal(rawDb.includes(Buffer.from(SECRET)), false);
        reopened.close();
        removeDb(dbPath);
    });
});

describe('moteur de flotte et cartes Teams', () => {
    const flow = JSON.parse(fs.readFileSync(FLOW_PATH, 'utf8'));
    const evaluate = flow.find((node) => node.name === 'Evaluate fleet watchdog');

    function execute(msg, stored, environment) {
        const flowApi = {
            get(key) { return stored[key]; },
            set(key, value) { stored[key] = value; }
        };
        const env = { get(key) { return environment[key] || ''; } };
        const node = { status() {}, warn() {} };
        return new Function('msg', 'node', 'flow', 'env', evaluate.func)(msg, node, flowApi, env);
    }

    it('ne notifie pas un état encore sous le seuil d’anti-flap', () => {
        const uuid = '55555555-5555-4555-8555-555555555555';
        const stored = {
            fleetStartedAt: Date.now() - (10 * 60 * 1000),
            fleetFirstSeenAt: { [uuid]: Date.now() - (10 * 60 * 1000) },
            fleetAdminConfig: { confirmsRequired: 2, offlineGraceMinutes: 5, firstSeenGraceMinutes: 5 }
        };
        const msg = {
            payload: { d: [{ uuid, device_name: 'Banc', is_online: false }] }
        };
        const first = execute(msg, stored, { TEAMS_WEBHOOK_URL: SECRET });
        assert.equal(first[2], null);
        const second = execute(msg, stored, { TEAMS_WEBHOOK_URL: SECRET });
        assert.equal(second[2].payload.transitions.length, 1);
        assert.equal(second[2].payload.transitions[0].confirmed, true);
        assert.equal(second[2].payload.transitions[0].to, 'dead');
        assert.equal(JSON.stringify(second[2].payload).includes(SECRET), false);
        assert.equal(second[2].headers['X-Watchdog-Channel-Secret'], SECRET);
    });

    it('ne notifie pas la grâce de première vue ni la grâce de démarrage', () => {
        const uuid = '66666666-6666-4666-8666-666666666666';
        const fresh = {
            fleetStartedAt: Date.now() - (10 * 60 * 1000),
            fleetAdminConfig: { confirmsRequired: 1, offlineGraceMinutes: 5, firstSeenGraceMinutes: 5 }
        };
        const msg = { payload: { d: [{ uuid, device_name: 'Neuf', is_online: false }] } };
        assert.equal(execute(msg, fresh, {})[2], null);
        const booting = {
            fleetStartedAt: Date.now(),
            fleetFirstSeenAt: { [uuid]: Date.now() - (10 * 60 * 1000) },
            fleetAdminConfig: { confirmsRequired: 1, offlineGraceMinutes: 5, firstSeenGraceMinutes: 1 }
        };
        assert.equal(execute(msg, booting, {})[2], null);
    });

    it('conserve le gabarit de carte, le test Teams et les deux reprises', () => {
        const card = buildTeamsCard({
            eventType: 'trigger',
            severity: 'critical',
            subject: 'Passerelle',
            value: 'uuid — dead — hors service',
            at: '2026-10-23T10:00:00Z'
        });
        assert.equal(card.attachments[0].content.type, 'AdaptiveCard');
        assert.equal(card.attachments[0].content.version, '1.4');
        assert.match(card.attachments[0].content.body[0].text, /^\[CRITIQUE\] /);
        const recovery = buildTeamsCard({ eventType: 'recovery', severity: 'high', subject: 'Passerelle', value: 'ok', at: '2026-10-23T10:00:00Z' });
        assert.match(recovery.attachments[0].content.body[0].text, /^\[RECOVERY\] /);
        assert.equal(flow.some((node) => node.name === 'Build Teams gallery'), true);
        assert.equal(flow.some((node) => node.name === 'Build Teams test card'), true);
        assert.equal(flow.some((node) => node.name === 'Teams retry 2s'), true);
        const retry = flow.find((node) => node.name === 'Record Teams success');
        assert.match(retry.func, /const maxRetries = 2;/);
        assert.match(evaluate.func, /\/v1\/alerts\/device-transitions/);
        assert.doesNotMatch(evaluate.func, /msg\.url = webhook/);
    });
});

describe('API d’alerte', () => {
    it('protège l’accusé et expose l’historique', async () => {
        const dbPath = tmpDb();
        const registry = openRegistry(dbPath);
        const contracts = loadHealthContracts();
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        ingestEvent(registry, SCHEMA, cloneEvent(METEO_TIMEOUT), { contracts });
        const alert = activeAlerts(registry)[0];
        const incidentState = registry.getIncident(alert.incident_id).state;
        const server = createIngestServer(registry, { token: 'ingest-token' });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        try {
            const listed = await requestJson(port, 'GET', '/v1/alerts?limit=10', undefined, { 'X-Watchdog-Token': 'ingest-token' });
            assert.equal(listed.status, 200);
            assert.equal(listed.json.summary.open, 1);
            const acked = await requestJson(port, 'POST', `/v1/alerts/${alert.alert_id}/ack`, { actor: 'ada' }, { 'X-Watchdog-Token': 'ingest-token' });
            assert.equal(acked.status, 200);
            assert.equal(acked.json.alert.status, 'acknowledged');
            assert.equal(acked.json.alert.acknowledged_by, 'ada');
            assert.equal(acked.json.history.some((row) => row.event_type === 'acknowledge'), true);
            assert.equal(registry.getIncident(alert.incident_id).state, incidentState);
            const duplicate = await requestJson(port, 'POST', `/v1/alerts/${alert.alert_id}/ack`, { actor: 'ada' }, { 'X-Watchdog-Token': 'ingest-token' });
            assert.equal(duplicate.status, 200);
            assert.equal(duplicate.json.duplicate, true);
        } finally {
            await new Promise((resolve) => server.close(resolve));
            registry.close();
            removeDb(dbPath);
        }
    });
});
