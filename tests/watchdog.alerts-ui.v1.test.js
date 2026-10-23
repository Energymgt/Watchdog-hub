'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');

function read(relative) {
    return fs.readFileSync(path.join(UI, relative), 'utf8');
}

describe('siège des alertes', () => {
    it('charge la file avant l’application et sépare Alertes des Incidents', () => {
        const html = read('index.html');
        const appAt = html.indexOf('./app.js');
        for (const relative of [
            './store/alerts-store.js',
            './services/alerts-uibuilder-client.js',
            './components/alerts/alerts-page.js'
        ]) {
            assert.ok(html.indexOf(relative) >= 0, relative);
            assert.ok(html.indexOf(relative) < appAt, relative);
        }
        const nav = read('components/fleet/app-nav.js');
        assert.match(nav, /Alertes/);
        assert.match(nav, /alertCount/);
        assert.match(nav, /Incidents/);
        assert.doesNotMatch(nav, /Alertes[\s\S]{0,80}Incidents[\s\S]{0,40}aria-labelledby="app-nav-problems"/);
        const context = { window: {} };
        context.window.window = context.window;
        vm.runInNewContext(read('utils/hash-router.js'), context, { filename: 'hash-router.js' });
        const router = context.window.WatchdogHub.hashRouter;
        assert.equal(router.parse('#alerts').view, 'alerts');
        assert.equal(router.format('alerts'), '#alerts');
        assert.equal(router.parse('#incidents/INC-1').view, 'incidents');
    });

    it('accuse réception sans transition d’incident et sans secret', () => {
        const page = read('components/alerts/alerts-page.js');
        const client = read('services/alerts-uibuilder-client.js');
        const app = read('app.js');
        assert.match(page, /Accuser réception/);
        assert.match(page, /Livraison Teams/);
        assert.match(page, /Dernier résultat/);
        assert.match(page, /Historique/);
        assert.match(page, /Tentatives Teams/);
        assert.doesNotMatch(page, /transitionIncident|to_state|WATCHDOG_INGEST_TOKEN|teamsWebhookUrl/);
        assert.match(client, /alerts_ack/);
        assert.doesNotMatch(client, /transitionIncident|flows_incident_patch/);
        assert.match(app, /acknowledgeAlert/);
        assert.match(app, /openAlertIncident/);
        assert.match(app, /openAlertDevice/);
        assert.doesNotMatch(app, /device.*incident|device.*anomal/i);
        assert.match(app, /openCount === 1 \? ' alerte ouverte\.' : ' alertes ouvertes\.'/);
    });

    it('remonte l’indisponibilité de l’ingest sans URL ni secret', () => {
        const flow = JSON.parse(fs.readFileSync(path.join(ROOT, 'flows', '04_Watchdog_Hub.json'), 'utf8'));
        const http = flow.find((node) => node.name === 'Watchdog alerts API');
        const response = flow.find((node) => node.name === 'Build Alerts UI Response');
        assert.equal(http.senderr, false);
        assert.deepEqual(http.wires, [[response.id]]);
        const run = new Function('msg', 'node', 'flow', 'env', response.func);
        const secret = 'qual-ingest-token';
        const refused = run({
            statusCode: 'ECONNREFUSED',
            payload: 'Error: connect ECONNREFUSED 127.0.0.1:18097 : http://127.0.0.1:18097/v1/alerts?limit=100',
            headers: { 'X-Watchdog-Token': secret },
            _alertsAction: 'alerts_snapshot_get',
            _uibOrigin: 'sock'
        }, {}, {}, {});
        assert.equal(refused[0], null);
        assert.equal(refused[1].topic, 'alerts_error');
        assert.equal(refused[1].payload.message, 'Le registre Watchdog est indisponible.');
        assert.equal(JSON.stringify(refused).includes(secret), false);
        assert.equal(JSON.stringify(refused).includes('18097'), false);
        assert.equal(JSON.stringify(refused).includes('http://'), false);
        const denied = run({
            statusCode: 401,
            payload: { ok: false, error: 'unauthorized' },
            _alertsAction: 'alerts_snapshot_get'
        }, {}, {}, {});
        assert.equal(denied[1].payload.message, 'Accès à l’API Watchdog refusé.');
        const ok = run({
            statusCode: 200,
            payload: { ok: true, alerts: [], summary: { open: 0, acknowledged: 0, closed: 0 } },
            _alertsStep: 'snapshot'
        }, {}, {}, {});
        assert.equal(ok[1].topic, 'alerts_snapshot');
    });
});
