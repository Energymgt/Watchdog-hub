'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');

function read(relative) {
    return fs.readFileSync(path.join(UI_ROOT, relative), 'utf8');
}

function loadUi(files, extras) {
    const context = {
        window: Object.assign({
            WatchdogHub: {},
            document: {
                documentElement: {
                    style: {},
                    theme: 'light',
                    setAttribute: function (name, value) {
                        if (name === 'data-theme') this.theme = value;
                    },
                    getAttribute: function (name) {
                        return name === 'data-theme' ? this.theme : null;
                    }
                }
            },
            localStorage: {
                values: {},
                getItem: function (key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; },
                setItem: function (key, value) { this.values[key] = String(value); }
            }
        }, extras || {})
    };
    context.window.window = context.window;
    context.document = context.window.document;
    context.localStorage = context.window.localStorage;
    vm.createContext(context);
    files.forEach(function (relative) {
        vm.runInContext(read(relative), context, { filename: relative });
    });
    return context.window;
}

describe('Phase 1.5 — corrections UX confirmées', () => {
    it('applique un thème explicite, persisté, indépendant du thème système', () => {
        const css = read('index.css');
        const html = read('index.html');
        const headerSource = read('components/fleet/fleet-header.js');
        const windowRef = loadUi([
            'utils/formatters.js',
            'components/fleet/fleet-header.js'
        ]);
        const header = windowRef.WatchdogHub.components.FleetHeader;
        const host = {
            lightTheme: false,
            applyTheme: header.methods.applyTheme,
            readTheme: header.methods.readTheme
        };

        assert.match(html, /content="light dark"/);
        assert.match(html, /documentElement\.setAttribute\('data-theme', theme\)/);
        assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/s);
        assert.match(css, /:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/s);
        assert.match(css, /:root\[data-theme="dark"\] input/);
        assert.match(css, /:root\[data-theme="light"\] input/);
        assert.match(css, /:root\[data-theme="dark"\] \.app-nav/);
        assert.match(css, /:root\[data-theme="dark"\] \.status-badge--ok/);
        assert.doesNotMatch(headerSource, /Activer le thème sombre' : 'Activer le thème clair'/);
        assert.match(headerSource, /Thème clair actif\. Activer le thème sombre\./);
        assert.match(headerSource, /Thème sombre actif\. Activer le thème clair\./);
        assert.match(headerSource, /Thème clair, passer au sombre/);
        assert.match(headerSource, /Thème sombre, passer au clair/);

        windowRef.localStorage.values['watchdog-theme'] = 'dark';
        assert.equal(header.methods.readTheme.call(host), 'dark');
        header.methods.applyTheme.call(host, 'dark', false);
        assert.equal(host.lightTheme, false);
        assert.equal(windowRef.document.documentElement.theme, 'dark');
        assert.equal(windowRef.document.documentElement.style.colorScheme, 'dark');
        assert.equal(windowRef.localStorage.values['watchdog-theme'], 'dark');

        header.methods.toggleTheme.call(host);
        assert.equal(host.lightTheme, true);
        assert.equal(windowRef.document.documentElement.theme, 'light');
        assert.equal(windowRef.localStorage.values['watchdog-theme'], 'light');
        header.methods.toggleTheme.call(host);
        assert.equal(windowRef.document.documentElement.theme, 'dark');
        assert.equal(windowRef.localStorage.values['watchdog-theme'], 'dark');
    });

    it('isole les filtres Flux et Incidents, y compris au passage explicite vers les incidents d’un flux', () => {
        const app = read('app.js');
        const palette = read('components/ui/command-palette.js');
        const bar = read('components/flows/flows-filter-bar.js');
        const windowRef = loadUi([
            'utils/formatters.js',
            'utils/flows-formatters.js',
            'components/flows/flows-page.js'
        ]);
        const page = windowRef.WatchdogHub.components.FlowsPage;
        const state = {
            flowQuery: 'meteo',
            flowStatusFilter: 'down',
            incidentQuery: 'INC-CLOS',
            incidentStateFilter: 'CLOS',
            flows: [
                { flow_id: 'meteo', name: 'METEO_01', status: 'down', source_id: 'api', connector_id: 'c', destination_id: 'sql' },
                { flow_id: 'csv', name: 'CSV_OASSIS_01', status: 'unknown', source_id: 'file', connector_id: 'c', destination_id: 'sql' }
            ],
            incidents: [
                { incident_id: 'INC-1', flow_id: 'meteo', state: 'OUVERT', error_signature: 'timeout', correlation_key: 'k', opened_at: '2026-10-22T10:00:00Z' },
                { incident_id: 'INC-CLOS', flow_id: 'csv', state: 'CLOS', error_signature: 'clos', correlation_key: 'k2', opened_at: '2026-10-21T10:00:00Z' },
                { incident_id: 'INC-OK', flow_id: 'meteo', state: 'RESOLU', error_signature: 'resolu', correlation_key: 'k3', opened_at: '2026-10-20T10:00:00Z' }
            ]
        };

        assert.ok(bar.includes("section !== \\'incidents\\'"));
        assert.ok(bar.includes("section === \\'incidents\\'"));
        assert.match(bar, /incidents-search/);
        assert.match(bar, /flows-search/);
        assert.match(palette, /query: ''/);
        assert.doesNotMatch(app, /flowsStore\.state\.query/);
        assert.doesNotMatch(app, /incidentQuery = [^;\n]*flowQuery|flowQuery = [^;\n]*incidentQuery/);
        assert.match(app, /flowsStore\.state\.incidentQuery = flow\.flow_id/);
        assert.doesNotMatch(app, /flowsStore\.state\.flowQuery = flow\.flow_id/);
        assert.doesNotMatch(palette, /flowQuery|incidentQuery/);

        const flows = page.computed.filteredFlows.call({ state: state });
        const incidents = page.computed.filteredIncidents.call({ state: state });
        assert.deepEqual(flows.map(function (flow) { return flow.flow_id; }), ['meteo']);
        assert.deepEqual(incidents.map(function (incident) { return incident.incident_id; }), ['INC-CLOS']);

        page.methods.resetFilters.call({ section: 'flows', state: state });
        assert.equal(state.flowQuery, '');
        assert.equal(state.flowStatusFilter, 'all');
        assert.equal(state.incidentQuery, 'INC-CLOS');
        assert.equal(state.incidentStateFilter, 'CLOS');
        assert.equal(page.computed.filteredFlows.call({ state: state }).length, 2);
        assert.equal(page.computed.filteredIncidents.call({ state: state }).length, 1);

        page.methods.resetFilters.call({ section: 'incidents', state: state });
        assert.equal(state.incidentQuery, '');
        assert.equal(state.incidentStateFilter, 'active');
        assert.equal(state.flowStatusFilter, 'all');
        const active = page.computed.filteredIncidents.call({ state: state });
        assert.deepEqual(active.map(function (incident) { return incident.incident_id; }), ['INC-1']);

        page.methods.setQuery.call({ section: 'incidents', state: state }, 'csv');
        assert.equal(state.incidentQuery, 'csv');
        assert.equal(state.flowQuery, '');
        page.methods.setQuery.call({ section: 'flows', state: state }, 'oassis');
        assert.equal(state.flowQuery, 'oassis');
        assert.equal(state.incidentQuery, 'csv');
    });

    it('n’affiche qu’une présentation appareils sous 700 px et garde le tri dans la barre', () => {
        const css = read('index.css');
        const list = read('components/fleet/device-list.js');
        const filters = read('components/ui/filter-bar.js');
        const start = css.indexOf('@media (max-width: 700px)');
        const end = css.indexOf('@media (max-width: 430px)', start);
        const block = css.slice(start, end);

        assert.match(block, /\.table-wrap--devices \{\s*display:\s*none/);
        assert.match(block, /\.device-cards \{\s*display:\s*grid/);
        assert.match(css, /\.device-cards \{\s*display:\s*none/);
        assert.doesNotMatch(css, /\.table-wrap\s*\{\s*display:\s*none/);
        assert.match(list, /table-wrap table-wrap--devices/);
        assert.match(list, /class="device-cards"/);
        assert.match(list, /<dt>Heartbeat<\/dt>/);
        assert.match(list, /Voir le détail/);
        assert.match(list, /status-badge/);
        assert.match(filters, /Trier par/);
        assert.match(filters, /Source en défaut/);
    });

    it('distingue un état terminal d’un état inconnu sans changer la valeur métier', () => {
        const windowRef = loadUi([
            'utils/formatters.js',
            'utils/flows-formatters.js'
        ]);
        const flows = windowRef.WatchdogHub.flowsFormatters;
        const devices = windowRef.WatchdogHub.formatters;
        const css = read('index.css');
        const anomalies = read('components/anomalies/anomalies-page.js');
        const incidents = read('components/flows/incident-list.js');
        const flowList = read('components/flows/flow-list.js');

        assert.equal(flows.incidentStateMeta('CLOS').label, 'Clos');
        assert.equal(flows.incidentStateMeta('CLOS').tone, 'closed');
        assert.equal(flows.incidentStateMeta('RESOLU').label, 'Résolu');
        assert.equal(flows.incidentStateMeta('RESOLU').tone, 'ok');
        assert.notEqual(flows.incidentStateMeta('RESOLU').tone, 'unknown');
        assert.equal(flows.flowStatusMeta('unknown').label, 'Inconnu');
        assert.equal(flows.flowStatusMeta('unknown').tone, 'unknown');
        assert.equal(devices.stateMeta('unknown').label, 'Inconnu');
        assert.equal(devices.stateMeta('unknown').tone, 'unknown');
        assert.equal(flows.incidentStateMeta('OUVERT').label, 'Ouvert');
        assert.match(css, /\.status-badge--unknown \{\s*border-style:\s*dashed/);
        assert.match(css, /\.status-badge--unknown::before \{[^}]*background:\s*transparent/s);
        assert.match(css, /\.status-badge--closed \{[^}]*border-style:\s*solid/s);
        assert.match(css, /\.status-badge--closed::before \{\s*border-radius:\s*0\.08rem/);
        assert.match(anomalies, /status === 'closed'\) return 'Fermée'/);
        assert.match(anomalies, /status === 'closed'\) return 'closed'/);
        assert.match(anomalies, /statusTone\(anomaly\.status\)/);
        assert.match(anomalies, /statusTone\(state\.selectedAnomaly\.status\)/);
        assert.match(incidents, /status-badge--\\?' \+ meta\(incident\.state\)\.tone/);
        assert.match(incidents, /\{\{ meta\(incident\.state\)\.label \}\}/);
        assert.match(flowList, /status-badge--\\?' \+ meta\(flow\.status\)\.tone/);
        assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'runtime', 'incidents.js'), 'utf8'), /tone: 'closed'/);
    });

    it('fait de Problèmes un groupe et réserve aria-current aux destinations', () => {
        const nav = read('components/fleet/app-nav.js');
        const router = loadUi(['utils/hash-router.js']).WatchdogHub.hashRouter;

        assert.match(nav, /<p class="app-nav__label" id="app-nav-problems">Problèmes<\/p>/);
        assert.match(nav, /aria-labelledby="app-nav-problems"/);
        assert.doesNotMatch(nav, />Problèmes<\/button>/);
        assert.doesNotMatch(nav, /app-nav__item--active/);
        for (const view of ['incidents', 'anomalies', 'events']) {
            assert.ok(nav.includes(":aria-current=\"view === \\'" + view + "\\' ? \\'page\\' : undefined\""));
            assert.equal(router.parse(router.format(view)).view, view);
        }
        assert.equal(router.parse('#incidents/INC-01').incidentId, 'INC-01');
        assert.equal(router.format('incidents', 'INC-01'), '#incidents/INC-01');
        assert.equal(router.format('overview'), '');
    });
});
