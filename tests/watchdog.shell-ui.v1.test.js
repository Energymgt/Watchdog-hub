'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');
const UI_FILES = [
    'utils/hash-router.js',
    'store/fleet-store.js',
    'components/fleet/app-nav.js',
    'components/overview-page.js',
    'components/ui/command-palette.js',
    'components/ui/ui-drawer.js',
    'components/flows/flow-detail.js',
    'components/flows/incident-list.js',
    'app.js'
];

describe('contrat du shell UI Watchdog Hub', () => {
    it('charge le routeur et la vue opérateur avant l application', () => {
        const html = fs.readFileSync(path.join(UI_ROOT, 'index.html'), 'utf8');
        const appIndex = html.indexOf('./app.js');

        for (const relative of UI_FILES.slice(0, -1)) {
            const source = './' + relative;
            assert.ok(html.indexOf(source) >= 0, `${source} absent de index.html`);
            assert.ok(html.indexOf(source) < appIndex, `${source} doit précéder app.js`);
        }
    });

    it('garde les scripts du shell valides et sans secret ingest', () => {
        for (const relative of UI_FILES) {
            const source = fs.readFileSync(path.join(UI_ROOT, relative), 'utf8');
            assert.doesNotThrow(() => new vm.Script(source, { filename: relative }));
            assert.doesNotMatch(source, /WATCHDOG_INGEST_TOKEN|X-Watchdog-Token/);
        }
    });

    it('conserve les liens historiques et permet un lien direct incident', () => {
        const context = { window: {} };
        context.window.window = context.window;
        vm.runInNewContext(
            fs.readFileSync(path.join(UI_ROOT, 'utils/hash-router.js'), 'utf8'),
            context,
            { filename: 'utils/hash-router.js' }
        );
        const router = context.window.WatchdogHub.hashRouter;

        assert.equal(router.parse('#flows').view, 'flows');
        assert.equal(router.parse('#admin').view, 'admin');
        assert.equal(router.parse('#anomalies').view, 'anomalies');
        assert.equal(router.parse('#events').view, 'events');
        assert.equal(router.parse('#fleet').view, 'fleet');
        assert.equal(router.parse('#overview').view, 'overview');
        assert.equal(router.parse('').view, 'overview');
        assert.deepEqual(
            JSON.parse(JSON.stringify(router.parse('#incidents/INC-01'))),
            { view: 'incidents', incidentId: 'INC-01' }
        );
        assert.equal(router.format('incidents', 'INC 01'), '#incidents/INC%2001');
    });

    it('charge les composants V2 avant l application', () => {
        const html = fs.readFileSync(path.join(UI_ROOT, 'index.html'), 'utf8');
        const appIndex = html.indexOf('./app.js');
        for (const relative of [
            'components/ui/command-palette.js',
            'components/ui/ui-drawer.js',
            'components/flows/flow-detail.js'
        ]) {
            assert.ok(html.indexOf('./' + relative) >= 0, `${relative} absent de index.html`);
            assert.ok(html.indexOf('./' + relative) < appIndex, `${relative} doit précéder app.js`);
        }
    });

    it('garde les actions incident derrière le drawer et la palette locale', () => {
        const detail = fs.readFileSync(path.join(UI_ROOT, 'components/flows/incident-detail.js'), 'utf8');
        const palette = fs.readFileSync(path.join(UI_ROOT, 'components/ui/command-palette.js'), 'utf8');
        const app = fs.readFileSync(path.join(UI_ROOT, 'app.js'), 'utf8');
        assert.match(detail, /ui-drawer/);
        assert.match(detail, /allowedTransitions/);
        assert.match(app, /ctrlKey/);
        assert.doesNotMatch(palette, /WATCHDOG_INGEST_TOKEN|X-Watchdog-Token/);
    });

    it('structure le shell en header compact et sidebar persistante', () => {
        const nav = fs.readFileSync(path.join(UI_ROOT, 'components/fleet/app-nav.js'), 'utf8');
        const header = fs.readFileSync(path.join(UI_ROOT, 'components/fleet/fleet-header.js'), 'utf8');
        const app = fs.readFileSync(path.join(UI_ROOT, 'app.js'), 'utf8');
        const css = fs.readFileSync(path.join(UI_ROOT, 'index.css'), 'utf8');

        assert.match(nav, /Vue d’ensemble/);
        assert.match(nav, /Flux métier/);
        assert.match(nav, /Appareils/);
        assert.match(nav, /Problèmes/);
        assert.match(nav, /Incidents/);
        assert.match(nav, /Configuration/);
        assert.match(nav, /Anomalies/);
        assert.match(nav, /Événements/);
        assert.match(nav, /app-nav__sub/);
        assert.doesNotMatch(nav, /Journal/);
        assert.match(nav, /anomalies.*update:view|update:view.*anomalies/);
        assert.doesNotMatch(nav, /<details/);
        assert.match(nav, /update:view.*events|events.*update:view/);
        assert.doesNotMatch(nav, /open-command/);

        assert.match(header, /header-secondary/);
        assert.match(header, /Dernier relevé/);
        assert.doesNotMatch(header, /Tout fonctionne/);
        assert.match(header, /WebSocket connected/);
        assert.match(header, /open-command/);
        assert.match(app, /@open-command="openCommandPalette"/);

        assert.match(css, /grid-template-columns: 210px minmax\(0, 1fr\)/);
        assert.doesNotMatch(nav, /[\u2013\u2014]/);
        assert.doesNotMatch(header, /[\u2013\u2014]/);
    });

    it('place la vue d’ensemble comme lecture d’état, pas comme console marketing', () => {
        const overview = fs.readFileSync(path.join(UI_ROOT, 'components/overview-page.js'), 'utf8');
        assert.match(overview, /Vue d’ensemble/);
        assert.match(overview, /Flux métier/);
        assert.match(overview, /À traiter/);
        assert.match(overview, /Activité récente/);
        assert.match(overview, /Snapshot absent/);
        assert.doesNotMatch(overview, /Éléments surveillés/);
        assert.doesNotMatch(overview, /Tout fonctionne/);
        assert.match(overview, /recentTransitions/);
        assert.match(overview, /openView/);
        assert.match(overview, /activity-timeline/);
        assert.match(overview, /activity/);
        assert.match(overview, /Dégradé/);
        assert.match(overview, /Inconnu/);
        assert.match(overview, /Non confirmé/);
        assert.doesNotMatch(overview, /À vérifier/);
        assert.match(overview, /Non daté/);
        assert.match(overview, /Incident ouvert depuis/);
        assert.match(overview, /Dernier heartbeat/);
        assert.doesNotMatch(overview, /Incident critique/);
        assert.match(overview, /incident_id/);
        assert.match(overview, /error_signature/);
        assert.doesNotMatch(overview, /CRITICAL ·/);
        assert.doesNotMatch(overview, /Production/);
        assert.doesNotMatch(overview, /[\u2013\u2014]/);
        assert.doesNotMatch(overview, /latence|exécution|severity|impact/i);
    });

    it('câble les KPI et la sélection de flux vers les espaces existants', () => {
        const overview = fs.readFileSync(path.join(UI_ROOT, 'components/overview-page.js'), 'utf8');
        const app = fs.readFileSync(path.join(UI_ROOT, 'app.js'), 'utf8');

        assert.match(overview, /openView.*incidents/);
        assert.match(overview, /openView.*flows/);
        assert.match(overview, /openView.*fleet/);
        assert.match(overview, /openView.*flow/);
        assert.match(app, /selectFlow\(item\)/);
        assert.match(app, /@open-view="openView"/);
    });

    it('conserve le workflow réel et les liens liés sans inventer d’état', () => {
        const list = fs.readFileSync(path.join(UI_ROOT, 'components/flows/incident-list.js'), 'utf8');
        const detail = fs.readFileSync(path.join(UI_ROOT, 'components/flows/incident-detail.js'), 'utf8');
        const app = fs.readFileSync(path.join(UI_ROOT, 'app.js'), 'utf8');

        for (const state of ['DETECTE', 'OUVERT', 'EN_ANALYSE', 'EN_CORRECTION', 'EN_VALIDATION', 'RESOLU', 'CLOS']) {
            assert.match(list, new RegExp(state));
        }
        assert.match(detail, /allowedTransitions/);
        assert.match(detail, /open-related/);
        assert.match(detail, /target_kind === 'flow'/);
        assert.match(app, /target_kind !== 'flow'/);
        assert.doesNotMatch(detail, /ACKNOWLEDGED|INVESTIGATING/);
    });

    it('ne présente pas un snapshot absent ou un flux inconnu comme un état sain', () => {
        const context = {
            window: {
                WatchdogHub: {
                    flowsFormatters: {
                        incidentStateMeta: function () { return { rank: 0 }; },
                        reasonLabel: function (value) { return value; }
                    },
                    formatters: {
                        formatDateTime: function () { return ''; },
                        formatRelative: function () { return ''; },
                        stateMeta: function () { return { label: '', tone: 'unknown' }; }
                    }
                }
            }
        };
        vm.createContext(context);
        vm.runInContext(fs.readFileSync(path.join(UI_ROOT, 'components/overview-page.js'), 'utf8'), context);
        vm.runInContext(fs.readFileSync(path.join(UI_ROOT, 'components/fleet/fleet-header.js'), 'utf8'), context);
        const build = context.window.WatchdogHub.overviewModel.build;
        const header = context.window.WatchdogHub.components.FleetHeader;
        const flowsOk = { total: 2, ok: 2, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 };

        const partial = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: false,
            flowSummary: flowsOk,
            fleetSummary: {}
        });
        assert.equal(partial.flows.label, 'Opérationnel');
        assert.equal(partial.flows.tone, 'ok');
        assert.equal(partial.devices.status, 'missing');
        assert.notEqual(partial.devices.tone, 'ok');
        assert.match(partial.devices.detail, /n’a pas été reçu/);

        const nominal = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            flowSummary: flowsOk,
            fleetSummary: { alerts: 0, total: 1 },
            devices: [{ state: 'ok', name: 'Passerelle', uuid: 'gw-1' }]
        });
        assert.equal(nominal.flows.label, 'Opérationnel');
        assert.equal(nominal.devices.label, 'Opérationnel');
        assert.equal(nominal.flows.tone, 'ok');
        assert.equal(nominal.devices.tone, 'ok');

        const disconnected = build({
            loading: false,
            connected: false,
            stale: false,
            fleetKnown: true,
            flowSummary: flowsOk,
            fleetSummary: { alerts: 0, total: 1 },
            devices: [{ state: 'ok' }]
        });
        assert.equal(disconnected.flows.label, 'Non confirmé');
        assert.equal(disconnected.devices.label, 'Non confirmé');
        assert.match(disconnected.reliability, /Connexion interrompue/);
        assert.notEqual(disconnected.flows.tone, 'ok');
        assert.doesNotMatch(disconnected.flows.label, /Dernier relevé/);

        const stale = build({
            loading: false,
            connected: true,
            stale: true,
            fleetKnown: true,
            flowSummary: flowsOk,
            fleetSummary: { alerts: 0, total: 1 },
            devices: [{ state: 'ok' }]
        });
        assert.equal(stale.flows.label, 'Opérationnel');
        assert.equal(stale.devices.label, 'Non confirmé');
        assert.match(stale.reliability, /périmé/);
        assert.notEqual(stale.devices.tone, 'ok');

        const unknownOverview = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            flowSummary: { total: 1, ok: 0, degraded: 0, down: 0, unknown: 1, incidentsActive: 0 },
            fleetSummary: { alerts: 0, total: 1 },
            devices: [{ state: 'ok' }]
        });
        assert.equal(unknownOverview.flows.label, 'Inconnu');
        assert.equal(unknownOverview.flows.tone, 'unknown');
        assert.equal(unknownOverview.devices.label, 'Opérationnel');

        assert.match(header.template, /Dernier relevé/);
        assert.doesNotMatch(header.template, /Tout fonctionne/);
        const missingSource = header.computed.balenaState.call({ sourceStatus: {} });
        assert.equal(missingSource, 'unknown');
    });

    it('sépare les compteurs, les inconnus, les doublons et les relevés non confirmés', () => {
        const context = { window: {} };
        context.window.window = context.window;
        vm.createContext(context);
        for (const relative of [
            'utils/formatters.js',
            'utils/flows-formatters.js',
            'utils/hash-router.js',
            'components/overview-page.js',
            'components/fleet/fleet-header.js'
        ]) {
            vm.runInContext(
                fs.readFileSync(path.join(UI_ROOT, relative), 'utf8'),
                context,
                { filename: relative }
            );
        }
        const hub = context.window.WatchdogHub;
        const build = hub.overviewModel.build;
        const page = hub.components.OverviewPage;
        const header = hub.components.FleetHeader;

        function flow(id, name, status, reason) {
            return {
                flow_id: id,
                name: name,
                status: status,
                status_reason: reason || '',
                last_event_at: '2026-10-22T11:00:00Z'
            };
        }
        function device(uuid, name, state) {
            return {
                uuid: uuid,
                name: name,
                state: state,
                lastHeartbeat: '2026-10-19T08:00:00Z',
                lastConnectivity: '2026-10-18T08:00:00Z'
            };
        }
        function summary(flows) {
            return flows.reduce(function (acc, item) {
                acc.total += 1;
                acc[item.status] += 1;
                return acc;
            }, { total: 0, ok: 0, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 });
        }
        const unknownOnly = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            flowSummary: summary([
                flow('meteo', 'METEO_01', 'unknown', 'no_events'),
                flow('csv', 'CSV_OASSIS_01', 'unknown', 'no_contract'),
                flow('stat', 'METEO_STAT_DAILY', 'unknown', 'no_events')
            ]),
            flows: [
                flow('meteo', 'METEO_01', 'unknown', 'no_events'),
                flow('csv', 'CSV_OASSIS_01', 'unknown', 'no_contract'),
                flow('stat', 'METEO_STAT_DAILY', 'unknown', 'no_events')
            ],
            fleetSummary: { total: 1, alerts: 0 },
            devices: [device('gw', 'GW-01', 'ok')]
        });
        assert.equal(unknownOnly.flows.counts.unknown, 3);
        assert.equal(unknownOnly.flows.counts.down, 0);
        assert.equal(unknownOnly.flows.counts.degraded, 0);
        assert.equal(unknownOnly.flows.label, 'Inconnu');
        assert.equal(unknownOnly.devices.label, 'Opérationnel');
        assert.equal(unknownOnly.attention.length, 0);
        assert.equal(unknownOnly.review.length, 3);
        assert.equal(unknownOnly.review[0].since, 'Non daté');

        const mixedFlows = [
            flow('sain', 'Flux sain', 'ok', 'nominal'),
            flow('inconnu', 'Flux inconnu', 'unknown', 'no_events'),
            flow('indispo', 'Flux indisponible', 'down', 'incident_confirmed')
        ];
        const mixed = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            flowSummary: summary(mixedFlows),
            flows: mixedFlows,
            fleetSummary: { total: 3, alerts: 2 },
            devices: [
                device('ok', 'Appareil sain', 'ok'),
                device('mystere', 'Appareil inconnu', 'unknown'),
                device('mort', 'Appareil hors service', 'dead')
            ]
        });
        assert.equal(mixed.flows.counts.down, 1);
        assert.equal(mixed.flows.counts.unknown, 1);
        assert.equal(mixed.flows.counts.ok, 1);
        assert.equal(mixed.devices.counts.dead, 1);
        assert.equal(mixed.devices.counts.unknown, 1);
        assert.equal(mixed.devices.counts.ok, 1);
        assert.equal(mixed.flows.label, 'Indisponible');
        assert.match(mixed.flows.detail, /inconnu/);
        assert.equal(
            mixed.attention.map(function (item) { return item.key; }).sort().join('|'),
            'device:mort|flow:indispo'
        );
        assert.equal(
            mixed.review.map(function (item) { return item.key; }).sort().join('|'),
            'device:mystere|flow:inconnu'
        );
        assert.equal(mixed.attention.some(function (row) { return row.bucket === 'unknown'; }), false);
        assert.equal(mixed.review.every(function (row) { return row.bucket === 'unknown'; }), true);
        const longName = 'Passerelle-de-toit-nord-'.repeat(12) + 'Fin';
        const longModel = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            flowSummary: { total: 1, ok: 1, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 },
            flows: [flow('long', longName, 'ok', 'nominal')],
            fleetSummary: { total: 0, alerts: 0 },
            devices: []
        });
        assert.equal(longModel.elements[0].name, longName);

        const emptyFleet = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            flowSummary: { total: 1, ok: 1, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 },
            flows: [flow('sain', 'Flux sain', 'ok', 'nominal')],
            fleetSummary: { total: 0, alerts: 0 },
            devices: []
        });
        assert.equal(emptyFleet.flows.label, 'Opérationnel');
        assert.equal(emptyFleet.devices.label, 'Aucun appareil');
        assert.notEqual(emptyFleet.devices.tone, 'ok');
        assert.equal(emptyFleet.flows.counts.unknown, 0);

        const fleetMissing = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: false,
            flowSummary: { total: 1, ok: 1, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 },
            flows: [flow('sain', 'Flux sain', 'ok', 'nominal')],
            fleetSummary: {},
            devices: []
        });
        assert.equal(fleetMissing.flows.label, 'Opérationnel');
        assert.equal(fleetMissing.devices.status, 'missing');
        assert.match(fleetMissing.devices.detail, /n’a pas été reçu/);
        assert.notEqual(fleetMissing.devices.tone, 'ok');

        const fleetFailed = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: false,
            fleetError: 'Le snapshot reçu est invalide.',
            flowSummary: { total: 1, ok: 1, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 },
            flows: [flow('sain', 'Flux sain', 'ok', 'nominal')],
            fleetSummary: {},
            devices: []
        });
        assert.equal(fleetFailed.flows.label, 'Opérationnel');
        assert.match(fleetFailed.devices.detail, /n’a pas pu être chargé/);
        assert.doesNotMatch(fleetFailed.devices.detail, /n’a pas été reçu/);
        assert.notEqual(fleetFailed.devices.tone, 'ok');

        const nothing = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: false,
            flowSummary: {},
            flows: [],
            devices: null
        });
        assert.equal(nothing.flows.counts, null);
        assert.equal(nothing.devices.counts, null);
        assert.equal(nothing.flows.label, 'Snapshot absent');
        assert.equal(nothing.devices.label, 'Snapshot absent');
        const nothingOffline = build({
            loading: false,
            connected: false,
            stale: false,
            fleetKnown: false,
            flowSummary: {},
            flows: [],
            devices: null
        });
        assert.equal(nothingOffline.flows.label, 'Snapshot absent');
        assert.match(nothingOffline.reliability, /Connexion interrompue/);
        assert.doesNotMatch(nothingOffline.flows.label, /Dernier relevé/);
        assert.doesNotMatch(nothingOffline.devices.label, /Dernier relevé/);

        const loading = build({
            loading: true,
            connected: false,
            stale: false,
            fleetKnown: false,
            flowSummary: {},
            flows: [],
            devices: []
        });
        assert.equal(loading.flows.label, 'Lecture en cours');
        assert.equal(loading.devices.label, 'Lecture en cours');
        assert.equal(loading.reliability, '');
        assert.equal(loading.flows.counts, null);

        const opened = '2026-10-20T10:00:00Z';
        const duplicated = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            now: Date.parse('2026-10-23T08:00:00Z'),
            flowSummary: { total: 2, ok: 0, degraded: 0, down: 2, unknown: 0, incidentsActive: 2 },
            flows: [
                flow('meteo', 'METEO_01', 'down', 'incident_confirmed'),
                flow('csv', 'CSV_OASSIS_01', 'down', 'incident_confirmed')
            ],
            incidents: [
                { incident_id: 'INC-1', flow_id: 'meteo', state: 'OUVERT', opened_at: opened, error_signature: 'timeout' },
                { incident_id: 'INC-2', flow_id: 'meteo', state: 'EN_ANALYSE', opened_at: '2026-10-21T10:00:00Z', error_signature: 'checksum' },
                { incident_id: 'INC-3', flow_id: 'meteo', state: 'RESOLU', opened_at: '2026-10-01T00:00:00Z', error_signature: 'ancien' }
            ],
            fleetSummary: { total: 1, alerts: 0 },
            devices: [device('gw', 'GW-01', 'ok')]
        });
        assert.equal(
            duplicated.attention.map(function (item) { return item.key; }).sort().join('|'),
            'flow:csv|incident:INC-1|incident:INC-2'
        );
        const incidentRow = duplicated.attention.filter(function (item) { return item.key === 'incident:INC-1'; })[0];
        const otherFlow = duplicated.attention.filter(function (item) { return item.key === 'flow:csv'; })[0];
        assert.equal(incidentRow.target, 'incident');
        assert.equal(incidentRow.name, 'METEO_01');
        assert.equal(incidentRow.stateLabel, 'Indisponible');
        assert.equal(incidentRow.flow.flow_id, 'meteo');
        assert.match(incidentRow.since, /^Incident ouvert depuis /);
        assert.equal(otherFlow.since, 'Non daté');
        assert.doesNotMatch(otherFlow.since, /Incident ouvert/);
        const meteo = duplicated.elements.filter(function (item) { return item.key === 'flow:meteo'; })[0];
        assert.equal(meteo.since, 'Non daté');
        assert.doesNotMatch(meteo.sinceTitle, /2026-10-22|2026-10-20/);

        const agedDevice = build({
            loading: false,
            connected: true,
            stale: false,
            fleetKnown: true,
            now: Date.parse('2026-10-23T08:00:00Z'),
            flowSummary: { total: 0, ok: 0, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 },
            flows: [],
            fleetSummary: { total: 1, alerts: 1 },
            devices: [device('mort', 'Appareil hors service', 'dead')]
        });
        assert.equal(agedDevice.attention[0].since, 'Non daté');
        assert.match(agedDevice.attention[0].sign, /^Dernier heartbeat : /);
        assert.doesNotMatch(agedDevice.attention[0].since, /heartbeat|2026-10-18/);

        const lostFault = build({
            loading: false,
            connected: false,
            stale: true,
            fleetKnown: true,
            flowSummary: { total: 1, ok: 0, degraded: 0, down: 1, unknown: 0, incidentsActive: 0 },
            flows: [flow('indispo', 'Flux indisponible', 'down', 'incident_confirmed')],
            fleetSummary: { total: 1, alerts: 1 },
            devices: [device('mort', 'Appareil hors service', 'dead')]
        });
        assert.equal(lostFault.flows.label, 'Indisponible');
        assert.equal(lostFault.devices.label, 'Hors service');
        assert.match(lostFault.reliability, /Connexion interrompue/);
        assert.match(lostFault.reliability, /pas un état actuel confirmé/);
        assert.match(lostFault.reliability, /périmé/);
        assert.equal(lostFault.flows.counts.down, 1);
        assert.equal(lostFault.devices.counts.dead, 1);

        const staleFault = build({
            loading: false,
            connected: true,
            stale: true,
            fleetKnown: true,
            flowSummary: { total: 1, ok: 0, degraded: 0, down: 1, unknown: 0, incidentsActive: 1 },
            flows: [flow('indispo', 'Flux indisponible', 'down', 'incident_confirmed')],
            incidents: [
                { incident_id: 'INC-4', flow_id: 'indispo', state: 'OUVERT', opened_at: opened, error_signature: 'timeout' }
            ],
            fleetSummary: { total: 1, alerts: 0 },
            devices: [device('gw', 'GW-01', 'ok')]
        });
        assert.equal(staleFault.flows.label, 'Indisponible');
        assert.equal(staleFault.devices.label, 'Non confirmé');
        assert.match(staleFault.reliability, /périmé/);
        assert.equal(staleFault.attention.length, 1);
        assert.equal(staleFault.attention[0].key, 'incident:INC-4');
        assert.doesNotMatch(header.template, /Tout fonctionne/);

        const router = hub.hashRouter;
        for (const view of ['flows', 'admin', 'anomalies', 'events', 'fleet', 'incidents']) {
            assert.equal(router.parse(router.format(view)).view, view);
        }
        assert.equal(router.parse('#incidents/INC-01').incidentId, 'INC-01');

        const overviewSource = fs.readFileSync(path.join(UI_ROOT, 'components/overview-page.js'), 'utf8');
        const appSource = fs.readFileSync(path.join(UI_ROOT, 'app.js'), 'utf8');
        const adminSource = fs.readFileSync(path.join(UI_ROOT, 'components/admin/admin-page.js'), 'utf8');
        assert.doesNotMatch(overviewSource, /scope: 'all'/);
        assert.doesNotMatch(overviewSource, /watch\s*:/);
        assert.match(overviewSource, /Flux métier/);
        assert.match(overviewSource, /Activité récente/);
        const overviewTag = appSource.slice(appSource.indexOf('<overview-page'), appSource.indexOf('</overview-page>'));
        assert.equal(overviewTag.includes(':key='), false);
        assert.match(adminSource, /Connecter un appareil/);
        assert.match(adminSource, /Tester l’intégration/);
        assert.match(adminSource, /Configuration/);
        assert.match(adminSource, /type="password"/);
    });
});
