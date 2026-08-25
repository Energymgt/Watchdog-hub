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
});
