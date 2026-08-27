'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');
const read = (file) => fs.readFileSync(path.join(UI_ROOT, file), 'utf8');

describe('Fleet Command Center', () => {
    it('conserve les données, les transitions et les contrôles Fleet existants', () => {
        const app = read('app.js');
        const store = read('store/fleet-store.js');
        const activity = read('components/fleet/fleet-activity.js');
        const detail = read('components/fleet/device-detail.js');

        assert.match(app, /Fleet Command Center/);
        assert.match(app, /fleet_snapshot_get|requestSnapshot/);
        assert.match(app, /fleet-activity/);
        assert.match(app, /recentTransitions/);
        assert.match(store, /state\.recentTransitions/);
        assert.match(activity, /transition\.at/);
        assert.match(activity, /transition\.from/);
        assert.match(activity, /transition\.to/);
        assert.match(detail, /device\.lastHeartbeat/);
        assert.match(detail, /device\.indicators\.bacnet/);
        assert.match(detail, /device\.indicators\.mqtt/);
        assert.match(detail, /device\.indicators\.buffer/);
    });

    it('rend les KPI de statut filtrables et ferme le détail par Escape', () => {
        const kpis = read('components/fleet/fleet-kpis.js');
        const app = read('app.js');

        assert.match(kpis, /filter-status/);
        assert.match(kpis, /heartbeat_missing/);
        assert.match(kpis, /selectStatus.*dead/);
        assert.match(app, /setFleetStatus/);
        assert.match(app, /event\.key === 'Escape' && store\.state\.selectedDevice/);
        assert.match(app, /store\.selectDevice\(null\)/);
    });

    it('ne fabrique aucune relation Gateway vers Flow, Incident ou Anomaly', () => {
        const app = read('app.js');
        const detail = read('components/fleet/device-detail.js');
        assert.doesNotMatch(app, /gateway.*flow|device.*incident|device.*anomal/i);
        assert.doesNotMatch(detail, /flows liés|incidents liés|anomalies liées/i);
    });
});
