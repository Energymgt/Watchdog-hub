'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');
const FLOW_PATH = path.join(ROOT, 'flows', '04_Watchdog_Hub.json');

describe('workspace UI Events', () => {
    it('expose le contrat réel Events via le bridge existant', () => {
        const flow = JSON.parse(fs.readFileSync(FLOW_PATH, 'utf8'));
        const ui = flow.find((node) => node.type === 'uibuilder' && node.url === 'watchdog-hub');
        const actions = flow.find((node) => node.name === 'Events UI Actions');
        const response = flow.find((node) => node.name === 'Build Events UI Response');
        const client = fs.readFileSync(path.join(UI_ROOT, 'services/events-uibuilder-client.js'), 'utf8');
        const uibuilder = fs.readFileSync(path.join(UI_ROOT, 'services/uibuilder-client.js'), 'utf8');

        assert.ok(ui);
        assert.ok(actions);
        assert.ok(response);
        assert.ok(ui.wires[0].includes(actions.id));
        assert.doesNotThrow(() => new vm.Script(`(function (msg, node, flow, env) {${actions.func}\n})`));
        assert.doesNotThrow(() => new vm.Script(`(function (msg, node, flow, env) {${response.func}\n})`));
        assert.match(actions.func, /events_snapshot_get/);
        assert.match(actions.func, /events_get/);
        assert.match(actions.func, /\/v1\/events/);
        assert.match(response.func, /events_snapshot/);
        assert.match(response.func, /events_detail/);
        assert.match(response.func, /events_error/);
        assert.match(client, /events_snapshot_get/);
        assert.match(client, /events_get/);
        assert.match(uibuilder, /events_snapshot/);
        assert.match(uibuilder, /events_detail/);
        assert.match(uibuilder, /events_error/);
        assert.doesNotMatch(actions.func + response.func, /event_created|event_updated|events_updated/);

        const env = { get: () => '' };
        const runActions = new Function('msg', 'node', 'flow', 'env', actions.func);
        const runResponse = new Function('msg', 'node', 'flow', 'env', response.func);
        const snapshot = runActions({ payload: { action: 'events_snapshot_get' }, _socketId: 'browser-1' }, {}, {}, env);
        assert.equal(snapshot[0].url, 'http://127.0.0.1:8091/v1/events?limit=100');
        assert.equal(snapshot[0]._eventsStep, 'snapshot');
        const detail = runActions({ payload: { action: 'events_get', data: { event_id: 'EVT-1' } }, _socketId: 'browser-1' }, {}, {}, env);
        assert.equal(detail[0].url, 'http://127.0.0.1:8091/v1/events/EVT-1');
        assert.equal(detail[0]._eventsStep, 'detail');
        assert.equal(runResponse({ statusCode: 200, payload: { ok: true, events: [] }, _eventsStep: 'snapshot', _uibOrigin: 'browser-1' }, {}, {}, env)[1].topic, 'events_snapshot');
        assert.equal(runResponse({ statusCode: 200, payload: { ok: true, event: { event_id: 'EVT-1' } }, _eventsStep: 'detail', _uibOrigin: 'browser-1' }, {}, {}, env)[1].topic, 'events_detail');
        assert.equal(runResponse({ statusCode: 503, payload: { ok: false, error: 'registry_unavailable' }, _eventsStep: 'snapshot', _uibOrigin: 'browser-1' }, {}, {}, env)[1].topic, 'events_error');
    });

    it('déclare la route et le workspace sans inventer de type ni de relation', () => {
        const router = fs.readFileSync(path.join(UI_ROOT, 'utils/hash-router.js'), 'utf8');
        const store = fs.readFileSync(path.join(UI_ROOT, 'store/events-store.js'), 'utf8');
        const page = fs.readFileSync(path.join(UI_ROOT, 'components/events/events-page.js'), 'utf8');
        const html = fs.readFileSync(path.join(UI_ROOT, 'index.html'), 'utf8');
        const app = fs.readFileSync(path.join(UI_ROOT, 'app.js'), 'utf8');
        const nav = fs.readFileSync(path.join(UI_ROOT, 'components/fleet/app-nav.js'), 'utf8');

        assert.doesNotThrow(() => new vm.Script(router));
        assert.doesNotThrow(() => new vm.Script(store));
        assert.doesNotThrow(() => new vm.Script(page));
        assert.match(router, /events: true/);
        assert.match(store, /selectedEvent/);
        assert.match(store, /timestamp/);
        assert.match(store, /resetFilters/);
        assert.match(page, /Events Workspace/);
        assert.match(page, /Chargement des événements/);
        assert.match(page, /Aucun événement disponible/);
        assert.match(page, /events-search/);
        assert.match(page, /event_type/);
        assert.match(page, /formatPayload/);
        assert.match(page, /select-flow/);
        assert.match(page, /event-detail--empty/);
        assert.match(page, /Fermer le détail Event/);
        assert.match(page, /payload/);
        assert.match(app, /createEventsStore/);
        assert.match(app, /createEventsUibuilderClient/);
        assert.match(app, /state.view === 'events'/);
        assert.match(app, /eventsStore\.state\.selectedEvent/);
        assert.match(app, /event\.key === 'Escape'/);
        assert.match(nav, /update:view.*events|events.*update:view/);
        assert.ok(html.indexOf('./components/events/events-page.js') < html.indexOf('./app.js'));
        assert.doesNotMatch(page, /severity|latence|débit|SLA|anomalies liées|incidents liés/);
        assert.doesNotMatch(page, /FLOW_RECOVERED|CRITICAL|HIGH|MEDIUM|LOW/);
        assert.doesNotMatch(page, /#anomalies|#incidents/);
    });
});
