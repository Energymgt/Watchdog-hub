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

describe('Accessibilité et responsive UI', () => {
    it('conserve les routes et la navigation sémantique au clavier', () => {
        const router = read('utils/hash-router.js');
        const nav = read('components/fleet/app-nav.js');
        const palette = read('components/ui/command-palette.js');

        for (const route of ['overview', 'incidents', 'flows', 'anomalies', 'events', 'fleet', 'admin']) {
            assert.match(router, new RegExp(route + ': true'));
        }
        assert.match(nav, /<nav class="app-nav" aria-label="Navigation principale">/);
        assert.match(nav, /<button[^>]+type="button"/);
        assert.match(palette, /ArrowUp/);
        assert.match(palette, /ArrowDown/);
        assert.match(palette, /event\.key === 'Tab'/);
        assert.match(palette, /aria-activedescendant/);
    });

    it('conserve les contrats de focus des dialogues et drawers', () => {
        const modal = read('components/ui/ui-modal.js');
        const drawer = read('components/ui/ui-drawer.js');

        for (const source of [modal, drawer]) {
            assert.match(source, /role="dialog"/);
            assert.match(source, /aria-modal="true"/);
            assert.match(source, /event\.key === 'Escape'/);
            assert.match(source, /focus\(\)/);
        }
        assert.match(modal, /previousOverflow/);
        assert.match(drawer, /data-drawer-initial-focus/);
    });

    it('contient le scroll horizontal dans les composants techniques', () => {
        const css = read('index.css');
        assert.match(css, /html, body \{\s*overflow-x: hidden/s);
        assert.match(css, /\.table-wrap \{\s*overflow-x: auto/s);
        assert.match(css, /\.connect-snippet \{\s*overflow-x: auto/s);
        assert.match(css, /\.app-nav \{[\s\S]*?overflow: visible/);
        assert.match(css, /\.command-palette \{[\s\S]*?max-height: calc\(100dvh - 1rem\)/);
    });

    it('conserve les états loading, empty et error des workspaces', () => {
        const files = [
            'components/overview-page.js',
            'components/flows/flows-page.js',
            'components/anomalies/anomalies-page.js',
            'components/events/events-page.js',
            'components/admin/admin-page.js'
        ];
        for (const relative of files) {
            assert.doesNotThrow(() => new vm.Script(read(relative), { filename: relative }));
        }
        assert.match(read('components/events/events-page.js'), /state\.loading/);
        assert.match(read('components/anomalies/anomalies-page.js'), /state\.lastError/);
        assert.match(read('components/admin/admin-page.js'), /validationErrors/);
    });
});
