'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');
const FLOW_PATH = path.join(ROOT, 'flows', '04_Watchdog_Hub.json');
const UI_FILES = [
    'utils/flows-formatters.js',
    'store/flows-store.js',
    'services/flows-uibuilder-client.js',
    'components/flows/flows-kpis.js',
    'components/flows/flows-filter-bar.js',
    'components/flows/flow-list.js',
    'components/flows/incident-list.js',
    'components/flows/flows-page.js',
    'components/flows/incident-detail.js',
    'store/anomalies-store.js',
    'services/anomalies-uibuilder-client.js',
    'components/anomalies/anomalies-page.js'
];

describe('contrat UI Flux et incidents', () => {
    it('le flow expose le pont UIbuilder vers l API ingest', () => {
        const flow = JSON.parse(fs.readFileSync(FLOW_PATH, 'utf8'));
        const ui = flow.find((node) => node.type === 'uibuilder' && node.url === 'watchdog-hub');
        const actions = flow.find((node) => node.name === 'Flows UI Actions');
        const request = flow.find((node) => node.name === 'Watchdog ingest API');
        const response = flow.find((node) => node.name === 'Build Flows UI Response');
        const restoreAuth = flow.find((node) => node.name === 'Restore Watchdog Auth');
        const anomalyActions = flow.find((node) => node.name === 'Anomalies UI Actions');
        const anomalyResponse = flow.find((node) => node.name === 'Build Anomalies UI Response');

        assert.ok(ui);
        assert.ok(actions);
        assert.ok(request);
        assert.ok(response);
        assert.ok(restoreAuth);
        assert.ok(anomalyActions);
        assert.ok(anomalyResponse);
        assert.ok(ui.wires[0].includes(actions.id));
        assert.ok(response.wires[0].includes(restoreAuth.id));
        assert.ok(restoreAuth.wires[0].includes(request.id));
        assert.doesNotThrow(() => new vm.Script(`(function (msg, node, flow, env) {${actions.func}\n})`));
        assert.doesNotThrow(() => new vm.Script(`(function (msg, node, flow, env) {${response.func}\n})`));
        assert.doesNotThrow(() => new vm.Script(`(function (msg, node, flow, env) {${restoreAuth.func}\n})`));
        assert.match(actions.func, /WATCHDOG_INGEST_TOKEN/);
        assert.match(restoreAuth.func, /WATCHDOG_INGEST_TOKEN/);
        assert.match(restoreAuth.func, /X-Watchdog-Token/);
        assert.match(actions.func, /flows_incident_resolve/);
        assert.doesNotMatch(actions.func, /return \[null, msg\]/);
        assert.match(response.func, /flows_snapshot/);
        assert.match(response.func, /flows_incident/);
        assert.match(response.func, /flows_error/);
        assert.doesNotMatch(response.func, /return \[null, msg\]/);
        assert.match(anomalyActions.func, /anomalies_snapshot_get/);
        assert.match(anomalyActions.func, /anomalies_get/);
        assert.match(anomalyActions.func, /WATCHDOG_INGEST_TOKEN/);
        assert.match(anomalyResponse.func, /anomalies_snapshot/);
        assert.match(anomalyResponse.func, /anomalies_detail/);
        assert.match(anomalyResponse.func, /anomalies_error/);
        assert.doesNotMatch(anomalyResponse.func, /severity|critical|high/i);

        const runAnomalyActions = new Function('msg', 'node', 'flow', 'env', anomalyActions.func);
        const snapshotRequest = runAnomalyActions({
            payload: { action: 'anomalies_snapshot_get' },
            _socketId: 'browser-1'
        }, {}, {}, { get: () => '' });
        assert.equal(snapshotRequest[0].method, 'GET');
        assert.match(snapshotRequest[0].url, /\/v1\/anomalies\?limit=100$/);
        assert.equal(snapshotRequest[0]._anomaliesStep, 'snapshot');

        const runAnomalyResponse = new Function('msg', 'node', 'flow', 'env', anomalyResponse.func);
        const snapshotResponse = runAnomalyResponse({
            statusCode: 200,
            payload: { ok: true, anomalies: [{ anomaly_id: 'ANOM-1' }] },
            _anomaliesAction: 'anomalies_snapshot_get',
            _anomaliesStep: 'snapshot',
            _uibOrigin: 'browser-1'
        }, {}, {}, { get: () => '' });
        assert.equal(snapshotResponse[1].topic, 'anomalies_snapshot');

        const detailRequest = runAnomalyActions({
            payload: { action: 'anomalies_get', data: { anomaly_id: 'ANOM-1' } },
            _socketId: 'browser-1'
        }, {}, {}, { get: () => '' });
        assert.match(detailRequest[0].url, /\/v1\/anomalies\/ANOM-1$/);
        assert.equal(detailRequest[0]._anomaliesStep, 'detail');

        const detailResponse = runAnomalyResponse({
            statusCode: 200,
            payload: { ok: true, anomaly: { anomaly_id: 'ANOM-1' } },
            _anomaliesAction: 'anomalies_get',
            _anomaliesStep: 'detail',
            _uibOrigin: 'browser-1'
        }, {}, {}, { get: () => '' });
        assert.equal(detailResponse[1].topic, 'anomalies_detail');
    });

    it('le pont ne renvoie jamais le token ingest au navigateur', () => {
        const flow = JSON.parse(fs.readFileSync(FLOW_PATH, 'utf8'));
        const actions = flow.find((node) => node.name === 'Flows UI Actions');
        const response = flow.find((node) => node.name === 'Build Flows UI Response');
        const anomalyActions = flow.find((node) => node.name === 'Anomalies UI Actions');
        const anomalyResponse = flow.find((node) => node.name === 'Build Anomalies UI Response');
        const runActions = new Function('msg', 'node', 'flow', 'env', actions.func);
        const runResponse = new Function('msg', 'node', 'flow', 'env', response.func);
        const env = {
            get: (key) => key === 'WATCHDOG_INGEST_TOKEN' ? 'secret-never-exposed' : ''
        };

        const invalid = runActions({
            payload: { action: 'flows_incident_get', data: { incident_id: '../bad' } },
            _socketId: 'browser-1'
        }, {}, {}, env);
        assert.equal(invalid[1].topic, 'flows_error');
        assert.doesNotMatch(JSON.stringify(invalid[1]), /secret-never-exposed/);

        const apiError = runResponse({
            statusCode: 401,
            payload: { ok: false, error: 'unauthorized' },
            headers: { 'X-Watchdog-Token': 'secret-never-exposed' },
            _flowsAction: 'flows_snapshot_get',
            _uibOrigin: 'browser-1'
        }, {}, {}, env);
        assert.equal(apiError[1].topic, 'flows_error');
        assert.doesNotMatch(JSON.stringify(apiError[1]), /secret-never-exposed/);

        const anomalyInvalid = new Function('msg', 'node', 'flow', 'env', anomalyActions.func)({
            payload: { action: 'anomalies_get', data: { anomaly_id: '../bad' } },
            _socketId: 'browser-1'
        }, {}, {}, env);
        assert.equal(anomalyInvalid[1].topic, 'anomalies_error');
        assert.doesNotMatch(JSON.stringify(anomalyInvalid[1]), /secret-never-exposed/);

        const anomalyApiError = new Function('msg', 'node', 'flow', 'env', anomalyResponse.func)({
            statusCode: 401,
            payload: { ok: false, error: 'unauthorized' },
            _anomaliesAction: 'anomalies_snapshot_get',
            _anomaliesStep: 'snapshot',
            _uibOrigin: 'browser-1'
        }, {}, {}, env);
        assert.equal(anomalyApiError[1].topic, 'anomalies_error');
        assert.doesNotMatch(JSON.stringify(anomalyApiError[1]), /secret-never-exposed/);
    });

    it('les scripts de la vue Flux sont syntaxiquement valides et sans secret', () => {
        for (const relative of UI_FILES) {
            const source = fs.readFileSync(path.join(UI_ROOT, relative), 'utf8');
            assert.doesNotThrow(() => new vm.Script(source, { filename: relative }));
            assert.doesNotMatch(source, /WATCHDOG_INGEST_TOKEN|X-Watchdog-Token/);
            assert.doesNotMatch(source, /[\u2013\u2014]/);
        }
    });

    it('index charge les dépendances Flux avant l application', () => {
        const html = fs.readFileSync(path.join(UI_ROOT, 'index.html'), 'utf8');
        const appIndex = html.indexOf('./app.js');
        for (const relative of UI_FILES) {
            const source = './' + relative.replaceAll('\\', '/');
            assert.ok(html.indexOf(source) >= 0, `${source} absent de index.html`);
            assert.ok(html.indexOf(source) < appIndex, `${source} doit précéder app.js`);
        }
    });

    it('déclare le workspace Flux et son diagnostic sans métriques inventées', () => {
        const page = fs.readFileSync(path.join(UI_ROOT, 'components/flows/flows-page.js'), 'utf8');
        const list = fs.readFileSync(path.join(UI_ROOT, 'components/flows/flow-list.js'), 'utf8');
        const detail = fs.readFileSync(path.join(UI_ROOT, 'components/flows/flow-detail.js'), 'utf8');

        assert.match(page, /flow-workspace/);
        assert.match(page, /flow-detail/);
        assert.match(list, /Source → Destination/);
        assert.match(list, /status_reason/);
        assert.doesNotMatch(list, /<th scope="col">Connecteur/);
        assert.match(detail, /Pourquoi \?/);
        assert.match(detail, /Chaîne supervisée/);
        assert.match(detail, /source_id/);
        assert.match(detail, /connector_id/);
        assert.match(detail, /destination_id/);
        assert.match(detail, /last_event_id/);
        assert.match(detail, /Aucun événement disponible/);
        assert.match(detail, /relatedIncidents/);
        assert.match(detail, /relatedAnomalies/);
        assert.match(detail, /relatedEvents/);
        assert.doesNotMatch(detail, /latence|exécution/i);
    });
});
