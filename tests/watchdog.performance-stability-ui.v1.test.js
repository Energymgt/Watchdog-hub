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

describe('Performance et stabilité UI', () => {
    it('évite les doubles chargements et refresh locaux', () => {
        const app = read('app.js');

        assert.match(app, /if \(global\.location\.hash !== nextHash\) \{[\s\S]*?return;[\s\S]*?\}/);
        assert.match(app, /function refresh\(\) \{\s*if \(store\.state\.refreshing\) return;/);
        assert.match(app, /function loadFlows\(refreshing\) \{\s*if \(flowsStore\.state\.loading \|\| flowsStore\.state\.refreshing\) return;/);
        assert.match(app, /function loadAnomalies\(refreshing\) \{\s*if \(anomaliesStore\.state\.loading \|\| anomaliesStore\.state\.refreshing\) return;/);
        assert.match(app, /function loadEvents\(refreshing\) \{\s*if \(eventsStore\.state\.loading \|\| eventsStore\.state\.refreshing\) return;/);
    });

    it('conserve le nettoyage des listeners et timers', () => {
        const app = read('app.js');
        const palette = read('components/ui/command-palette.js');
        const modal = read('components/ui/ui-modal.js');
        const drawer = read('components/ui/ui-drawer.js');

        assert.match(app, /addEventListener\('hashchange'/);
        assert.match(app, /removeEventListener\('hashchange'/);
        assert.match(app, /addEventListener\('keydown'/);
        assert.match(app, /removeEventListener\('keydown'/);
        assert.match(app, /clearInterval\(timerId\)/);
        assert.match(palette, /removeEventListener\('keydown', this\.handleKeydown\)/);
        assert.match(modal, /removeEventListener\('keydown', this\.handleKeydown\)/);
        assert.match(drawer, /removeEventListener\('keydown', this\.handleKeydown\)/);
    });

    it('ne sérialise le payload Event que dans le détail calculé', () => {
        const events = read('components/events/events-page.js');

        assert.match(events, /formattedPayload: function \(\)/);
        assert.match(events, /return this\.formatPayload\(this\.state\.selectedEvent && this\.state\.selectedEvent\.payload\)/);
        assert.match(events, /<pre><code>\{\{ formattedPayload \}\}<\/code><\/pre>/);
        assert.doesNotMatch(events, /event-row[\s\S]*formatPayload\(state\.selectedEvent\.payload\)/);
    });

    it('ne crée ni polling, ni WebSocket, ni accès runtime côté navigateur', () => {
        const sources = [
            read('app.js'),
            read('components/events/events-page.js'),
            read('components/ui/command-palette.js'),
            read('utils/activity-selector.js'),
            read('utils/command-palette-selector.js')
        ].join('\n');
        const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

        assert.doesNotMatch(sources, /fetch\s*\(|XMLHttpRequest|WebSocket\s*\(/);
        assert.doesNotMatch(sources, /setInterval\s*\([^)]*,\s*0/);
        assert.equal(packageJson.dependencies['react'], undefined);
        assert.equal(packageJson.dependencies['react-dom'], undefined);
    });

    it('garde les fichiers UI syntaxiquement valides', () => {
        for (const relative of [
            'app.js',
            'components/events/events-page.js',
            'components/ui/command-palette.js'
        ]) {
            assert.doesNotThrow(() => new vm.Script(read(relative), { filename: relative }));
        }
    });
});
