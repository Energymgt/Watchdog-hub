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

        assert.match(nav, /Overview/);
        assert.match(nav, /Opérations/);
        assert.match(nav, /Infrastructure/);
        assert.match(nav, /Administration/);
        assert.match(nav, /anomalies.*update:view|update:view.*anomalies/);
        assert.match(nav, /update:view.*events|events.*update:view/);
        assert.doesNotMatch(nav, /open-command/);

        assert.match(header, /header-secondary/);
        assert.match(header, /DEGRADED/);
        assert.match(header, /UNKNOWN/);
        assert.match(header, /LIVE/);
        assert.match(header, /WebSocket connected/);
        assert.match(header, /open-command/);
        assert.match(app, /@open-command="openCommandPalette"/);

        assert.match(css, /grid-template-columns: 210px minmax\(0, 1fr\)/);
        assert.doesNotMatch(nav, /[\u2013\u2014]/);
        assert.doesNotMatch(header, /[\u2013\u2014]/);
    });

    it('place Overview comme console opérationnelle, pas comme table', () => {
        const overview = fs.readFileSync(path.join(UI_ROOT, 'components/overview-page.js'), 'utf8');
        assert.match(overview, /Operational Overview/);
        assert.match(overview, /À traiter maintenant/);
        assert.match(overview, /Santé des flux/);
        assert.match(overview, /Activité récente/);
        assert.match(overview, /recentTransitions/);
        assert.match(overview, /openView/);
        assert.match(overview, /activity-timeline/);
        assert.match(overview, /activity/);
        assert.match(overview, /HEALTHY/);
        assert.match(overview, /DEGRADED/);
        assert.match(overview, /UNKNOWN/);
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
});
