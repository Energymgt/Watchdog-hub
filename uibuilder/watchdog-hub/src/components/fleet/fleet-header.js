(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FleetHeader = {
        name: 'FleetHeader',
        props: {
            generatedAt: { type: [String, Number], default: null },
            stale: { type: Boolean, default: false },
            connected: { type: Boolean, default: false },
            sourceStatus: { type: Object, default: function () { return {}; } },
            lastEvaluationAt: { type: [String, Number], default: null },
            nextPollAt: { type: [String, Number], default: null },
            now: { type: Number, default: Date.now },
            fleetName: { type: String, default: 'Watchdog Hub' },
            flowSummary: { type: Object, default: function () { return {}; } },
            fleetSummary: { type: Object, default: function () { return {}; } }
        },
        computed: {
            balenaState: function () {
                return this.sourceStatus.balena && this.sourceStatus.balena.ok ? 'ok' : 'dead';
            },
            mqttState: function () {
                return this.sourceStatus.mqtt && this.sourceStatus.mqtt.ok ? 'ok' : 'heartbeat_missing';
            },
            teamsState: function () {
                var teams = this.sourceStatus.teams || {};
                if (!teams.configured) return 'unknown';
                if (teams.lastError) return 'heartbeat_missing';
                return teams.lastSuccessAt ? 'ok' : 'unknown';
            },
            systemState: function () {
                if (!this.connected) return { label: 'Déconnecté', state: 'dead' };
                if ((this.flowSummary.down || 0) > 0) return { label: 'Critique', state: 'dead' };
                if ((this.flowSummary.incidentsActive || 0) > 0 || (this.flowSummary.degraded || 0) > 0 || (this.fleetSummary.alerts || 0) > 0) {
                    return { label: 'Dégradé', state: 'cloud_down' };
                }
                return { label: 'Opérationnel', state: 'ok' };
            }
        },
        methods: {
            formatDateTime: formatters.formatDateTime,
            formatRelative: function (value) {
                return formatters.formatRelative(value, this.now);
            },
            errorText: function (source) {
                var error = source && source.lastError;
                return error ? (error.message || String(error)) : '';
            }
        },
        template:
            '<header class="page-header">' +
                '<div class="header-content">' +
                    '<div><p class="eyebrow">Operational command center</p><h1>{{ fleetName }}</h1></div>' +
                    '<div class="header-meta header-meta--primary">' +
                        '<status-badge :state="systemState.state" :label="systemState.label"></status-badge>' +
                        '<span class="system-summary">{{ flowSummary.incidentsActive || 0 }} incidents · {{ (flowSummary.degraded || 0) + (flowSummary.down || 0) }} flux · {{ fleetSummary.alerts || 0 }} alertes flotte</span>' +
                        '<status-badge :state="connected ? \'ok\' : \'dead\'" :label="connected ? \'WebSocket connecté\' : \'WebSocket déconnecté\'"></status-badge>' +
                    '</div>' +
                '</div>' +
                '<div class="header-sources" aria-label="État des sources">' +
                    '<status-badge :state="balenaState" label="Balena" announce-state></status-badge>' +
                    '<status-badge :state="mqttState" label="MQTT" announce-state></status-badge>' +
                    '<status-badge :state="teamsState" label="Teams" announce-state></status-badge>' +
                    '<status-badge v-if="stale" state="heartbeat_missing" label="Données anciennes"></status-badge>' +
                '</div>' +
                '<dl class="source-details">' +
                    '<div><dt>Snapshot</dt><dd :title="formatDateTime(generatedAt)">{{ formatRelative(generatedAt) }}</dd></div>' +
                    '<div><dt>Évaluation</dt><dd :title="formatDateTime(lastEvaluationAt)">{{ formatRelative(lastEvaluationAt) }}</dd></div>' +
                    '<div><dt>Dernier poll Balena</dt><dd :title="formatDateTime(sourceStatus.balena && sourceStatus.balena.lastSuccessAt)">{{ formatRelative(sourceStatus.balena && sourceStatus.balena.lastSuccessAt) }}</dd></div>' +
                    '<div><dt>Dernier heartbeat</dt><dd :title="formatDateTime(sourceStatus.mqtt && sourceStatus.mqtt.lastMessageAt)">{{ formatRelative(sourceStatus.mqtt && sourceStatus.mqtt.lastMessageAt) }}</dd></div>' +
                    '<div><dt>Prochain poll estimé</dt><dd :title="formatDateTime(nextPollAt)">{{ formatRelative(nextPollAt) }}</dd></div>' +
                '</dl>' +
                '<p v-if="errorText(sourceStatus.balena)" class="source-error" role="status"><strong>Balena :</strong> {{ errorText(sourceStatus.balena) }}</p>' +
                '<p v-if="errorText(sourceStatus.teams)" class="source-error" role="status"><strong>Teams :</strong> {{ errorText(sourceStatus.teams) }}</p>' +
            '</header>'
    };
}(window));
