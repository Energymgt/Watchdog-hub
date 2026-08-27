'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');

function selector() {
    const source = fs.readFileSync(path.join(UI_ROOT, 'utils/command-palette-selector.js'), 'utf8');
    const context = { window: {} };
    vm.runInNewContext(source, context);
    return context.window.WatchdogHub.commandPaletteSelector;
}

describe('Command Center Navigation', () => {
    it('construit une recherche locale sur les cinq domaines', () => {
        const api = selector();
        const items = api.buildSearchItems({
            incidents: [{ incident_id: 'INC-042', flow_id: 'FLOW-1', state: 'OUVERT' }],
            flows: [{ flow_id: 'FLOW-1', name: 'CSV OASIS', status: 'unknown' }],
            anomalies: [{ anomaly_id: 'ANOM-003', error_signature: 'SQL timeout', status: 'open' }],
            events: [{ event_id: 'EVT-123', event_type: 'FLOW_EXECUTION', flow_id: 'FLOW-1' }],
            devices: [{ uuid: 'GW-02', name: 'Gateway 02', state: 'dead' }]
        });
        assert.equal(items.length, 5);
        assert.deepEqual(new Set(items.map((entry) => entry.type)), new Set(['INCIDENT', 'FLOW', 'ANOMALY', 'EVENT', 'DEVICE']));
        assert.equal(items.find((entry) => entry.type === 'EVENT').navigation.view, 'events');
    });

    it('applique la priorité ID exact puis le tri déterministe et la limite', () => {
        const api = selector();
        const items = api.buildSearchItems({
            incidents: [
                { incident_id: 'INC-100', flow_id: 'CSV' },
                { incident_id: 'INC-101', flow_id: 'CSV' }
            ],
            flows: [{ flow_id: 'CSV-1', name: 'CSV pipeline', status: 'ok' }]
        });
        const exact = api.searchItems(items, 'INC-101', 10);
        assert.equal(exact[0].id, 'INC-101');
        const limited = api.searchItems(items, 'CSV', 2);
        assert.equal(limited.length, 2);
        assert.equal(JSON.stringify(limited.map((entry) => entry.id).sort()), JSON.stringify(['CSV-1', 'INC-100']));
    });

    it('expose les interactions clavier et aucune recherche réseau', () => {
        const palette = fs.readFileSync(path.join(UI_ROOT, 'components/ui/command-palette.js'), 'utf8');
        const app = fs.readFileSync(path.join(UI_ROOT, 'app.js'), 'utf8');
        assert.match(palette, /ArrowDown/);
        assert.match(palette, /ArrowUp/);
        assert.match(palette, /Enter/);
        assert.match(palette, /Escape/);
        assert.match(palette, /ref="search"/);
        assert.match(palette, /role="dialog"/);
        assert.match(app, /commandPaletteSelector\.buildSearchItems/);
        assert.doesNotMatch(palette, /fetch|XMLHttpRequest|requestSnapshot|requestDetail/);
    });

    it('n’invente aucun deep link pour les objets sans route dédiée', () => {
        const api = selector();
        const items = api.buildSearchItems({
            flows: [{ flow_id: 'FLOW-1', name: 'CSV OASIS' }],
            anomalies: [{ anomaly_id: 'ANOM-1' }],
            events: [{ event_id: 'EVT-1' }]
        });
        assert.equal(items.find((entry) => entry.type === 'FLOW').navigation.view, 'flows');
        assert.equal(items.find((entry) => entry.type === 'ANOMALY').navigation.view, 'anomalies');
        assert.equal(items.find((entry) => entry.type === 'EVENT').navigation.view, 'events');
        assert.doesNotMatch(JSON.stringify(items), /#(?:flows|anomalies|events)\//);
    });
});
