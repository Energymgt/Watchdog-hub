'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');

describe('workspace UI Anomalies', () => {
    it('déclare la route, le bridge et les composants réels', () => {
        const router = fs.readFileSync(path.join(UI_ROOT, 'utils/hash-router.js'), 'utf8');
        const client = fs.readFileSync(path.join(UI_ROOT, 'services/uibuilder-client.js'), 'utf8');
        const anomalyClient = fs.readFileSync(path.join(UI_ROOT, 'services/anomalies-uibuilder-client.js'), 'utf8');
        const store = fs.readFileSync(path.join(UI_ROOT, 'store/anomalies-store.js'), 'utf8');
        const page = fs.readFileSync(path.join(UI_ROOT, 'components/anomalies/anomalies-page.js'), 'utf8');
        const html = fs.readFileSync(path.join(UI_ROOT, 'index.html'), 'utf8');

        assert.doesNotThrow(() => new vm.Script(router));
        assert.doesNotThrow(() => new vm.Script(client));
        assert.doesNotThrow(() => new vm.Script(anomalyClient));
        assert.doesNotThrow(() => new vm.Script(store));
        assert.doesNotThrow(() => new vm.Script(page));
        assert.match(router, /anomalies: true/);
        assert.match(anomalyClient, /anomalies_snapshot_get/);
        assert.match(anomalyClient, /anomalies_get/);
        assert.match(client, /anomalies_snapshot/);
        assert.match(client, /anomalies_detail/);
        assert.match(client, /anomalies_error/);
        assert.match(store, /selectedAnomaly/);
        assert.match(page, /Anomalies Workspace/);
        assert.match(page, /error_signature/);
        assert.match(page, /occurrence_count/);
        assert.match(page, /select-flow/);
        assert.match(page, /select-anomaly/);
        assert.doesNotMatch(page, /severity|latence|débit|SLA|Events|Événements/);
        assert.doesNotMatch(page, /CRITICAL|HIGH|MEDIUM|LOW/);
        assert.doesNotMatch(page, /:8091|WATCHDOG_INGEST_TOKEN|X-Watchdog-Token/);
        assert.ok(html.indexOf('./components/anomalies/anomalies-page.js') < html.indexOf('./app.js'));
    });

    it('prévoit loading, empty, error, sélection, filtres et conservation des données', () => {
        const store = fs.readFileSync(path.join(UI_ROOT, 'store/anomalies-store.js'), 'utf8');
        const page = fs.readFileSync(path.join(UI_ROOT, 'components/anomalies/anomalies-page.js'), 'utf8');

        assert.match(store, /state\.loading = !state\.snapshot/);
        assert.match(store, /state\.anomalies = payload\.anomalies/);
        assert.match(store, /state\.selectedAnomaly = detail \|\| null/);
        assert.match(store, /resetFilters/);
        assert.match(page, /Anomalies indisponibles/);
        assert.match(page, /Aucune anomalie détectée/);
        assert.match(page, /anomalies-search/);
        assert.match(page, /statusFilter/);
        assert.match(page, /flowFilter/);
        assert.match(page, /clauseFilter/);
        assert.match(page, /anomaly-detail--empty/);
        assert.match(page, /Fermer le diagnostic/);
        assert.match(page, /last_event_id/);
    });
});
