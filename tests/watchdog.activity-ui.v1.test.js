'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');

function selector() {
    const source = fs.readFileSync(path.join(UI_ROOT, 'utils/activity-selector.js'), 'utf8');
    const context = { window: {} };
    vm.runInNewContext(source, context);
    return context.window.WatchdogHub.activitySelector;
}

describe('selector activité récente', () => {
    it('normalise les quatre sources sans modifier les données', () => {
        const api = selector();
        const event = { event_id: 'EVT-1', event_type: 'FLOW_EXECUTION', flow_id: 'FLOW-1', timestamp: '2026-08-27T10:00:00Z', correlation_key: 'corr-1' };
        const incident = { incident_id: 'INC-1', opened_at: '2026-08-27T10:01:00Z', flow_id: 'FLOW-1' };
        const anomaly = { anomaly_id: 'ANOM-1', opened_at: '2026-08-27T10:02:00Z', flow_id: 'FLOW-1', error_signature: 'timeout' };
        const transition = { uuid: 'GW-1', at: '2026-08-27T10:03:00Z', from: 'ok', to: 'offline' };
        const before = JSON.stringify({ event, incident, anomaly, transition });
        const items = api.selectActivity({ events: [event], incidents: [incident], anomalies: [anomaly], fleetTransitions: [transition] });

        assert.equal(JSON.stringify(items.map((item) => item.category)), JSON.stringify(['FLEET', 'ANOMALY', 'INCIDENT', 'EVENT']));
        assert.equal(items[0].source, 'FLEET');
        assert.equal(items[1].entityId, 'ANOM-1');
        assert.equal(items[2].navigation.incidentId, 'INC-1');
        assert.equal(items[3].navigation.flowId, 'FLOW-1');
        assert.equal(JSON.stringify({ event, incident, anomaly, transition }), before);
    });

    it('applique un tri stable, une limite, un filtre et une déduplication par source', () => {
        const api = selector();
        const events = [
            { event_id: 'EVT-1', event_type: 'A', timestamp: '2026-08-27T10:00:00Z' },
            { event_id: 'EVT-2', event_type: 'B', timestamp: '2026-08-27T10:00:00Z' },
            { event_id: 'EVT-2', event_type: 'B', timestamp: '2026-08-27T10:00:00Z' }
        ];
        const result = api.selectActivity({ events }, { limit: 2 });
        assert.equal(JSON.stringify(result.map((item) => item.id)), JSON.stringify(['EVT-2', 'EVT-1']));
        assert.equal(api.selectActivity({ events }, { category: 'INCIDENT' }).length, 0);
    });

    it('ignore les dates invalides et ne crée aucune relation implicite', () => {
        const api = selector();
        const items = api.selectActivity({
            events: [{ event_id: 'EVT-1', event_type: 'FAIL', timestamp: 'invalid', ingested_at: '2026-08-27T10:00:00Z', flow_id: null, correlation_key: 'corr' }],
            incidents: [{ incident_id: 'INC-1', opened_at: '2026-08-27T10:00:00Z' }],
            anomalies: [{ anomaly_id: 'ANOM-1', opened_at: '2026-08-27T10:00:00Z' }],
            fleetTransitions: [{ detail: 'Sans date' }]
        });
        assert.equal(items.filter((item) => item.source === 'EVENT').length, 1);
        assert.equal(items.find((item) => item.source === 'EVENT').navigation, null);
        assert.equal(items.find((item) => item.source === 'ANOMALY').navigation.view, 'anomalies');
        assert.equal(items.find((item) => item.source === 'INCIDENT').navigation.view, 'incidents');
        assert.equal(items.filter((item) => item.source === 'FLEET').length, 0);
    });
});
