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
    'components/flows/incident-detail.js'
];

describe('contrat UI Flux et incidents', () => {
    it('le flow expose le pont UIbuilder vers l API ingest', () => {
        const flow = JSON.parse(fs.readFileSync(FLOW_PATH, 'utf8'));
        const ui = flow.find((node) => node.type === 'uibuilder' && node.url === 'watchdog-hub');
        const actions = flow.find((node) => node.name === 'Flows UI Actions');
        const request = flow.find((node) => node.name === 'Watchdog ingest API');
        const response = flow.find((node) => node.name === 'Build Flows UI Response');

        assert.ok(ui);
        assert.ok(actions);
        assert.ok(request);
        assert.ok(response);
        assert.ok(ui.wires[0].includes(actions.id));
        assert.doesNotThrow(() => new vm.Script(`(function (msg, node, flow, env) {${actions.func}\n})`));
        assert.doesNotThrow(() => new vm.Script(`(function (msg, node, flow, env) {${response.func}\n})`));
        assert.match(actions.func, /WATCHDOG_INGEST_TOKEN/);
        assert.match(actions.func, /flows_incident_resolve/);
        assert.doesNotMatch(actions.func, /return \[null, msg\]/);
        assert.match(response.func, /flows_snapshot/);
        assert.match(response.func, /flows_incident/);
        assert.match(response.func, /flows_error/);
        assert.doesNotMatch(response.func, /return \[null, msg\]/);
    });

    it('le pont ne renvoie jamais le token ingest au navigateur', () => {
        const flow = JSON.parse(fs.readFileSync(FLOW_PATH, 'utf8'));
        const actions = flow.find((node) => node.name === 'Flows UI Actions');
        const response = flow.find((node) => node.name === 'Build Flows UI Response');
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
});
