'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');
const read = (file) => fs.readFileSync(path.join(UI_ROOT, file), 'utf8');

describe('drill-down cross-domain', () => {
    it('conserve les routes et les relations explicites', () => {
        const router = read('utils/hash-router.js');
        const app = read('app.js');
        const flow = read('components/flows/flow-detail.js');
        const activity = read('utils/activity-selector.js');

        for (const route of ['incidents', 'flows', 'anomalies', 'events', 'fleet', 'admin']) {
            assert.match(router, new RegExp(route + ': true'));
        }
        assert.match(router, /incidentId/);
        assert.match(app, /openAnomalyFromFlow/);
        assert.match(app, /openEventFromFlow/);
        assert.match(flow, /relatedAnomalies/);
        assert.match(flow, /relatedEvents/);
        assert.match(activity, /navigation: event\.flow_id/);
        assert.match(activity, /navigation: \{ view: 'anomalies'/);
        assert.match(activity, /navigation: \{ view: 'incidents'/);
    });

    it('gère les liens conditionnels Event et Anomaly vers Flow', () => {
        const event = read('components/events/events-page.js');
        const anomaly = read('components/anomalies/anomalies-page.js');
        const incident = read('components/flows/incident-detail.js');

        assert.match(event, /v-if="state\.selectedEvent\.flow_id"/);
        assert.match(event, /select-flow/);
        assert.match(anomaly, /v-if="state\.selectedAnomaly\.flow_id"/);
        assert.match(anomaly, /select-flow/);
        assert.match(anomaly, /selectedEvent/);
        assert.match(incident, /incident\.flow_id/);
        assert.match(incident, /open-flow/);
    });

    it('refuse les relations implicites et conserve les comportements accessibles', () => {
        const app = read('app.js');
        const flow = read('components/flows/flow-detail.js');
        const anomaly = read('components/anomalies/anomalies-page.js');

        assert.doesNotMatch(app, /correlation_key.*(?:incident|anomal)|(?:incident|anomal).*correlation_key/i);
        assert.doesNotMatch(flow, /device_id|deviceId/);
        assert.match(app, /event\.key === 'Escape'/);
        assert.match(anomaly, /type="button"/);
    });
});
