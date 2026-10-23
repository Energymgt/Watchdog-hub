(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FleetHeader = {
        name: 'FleetHeader',
        emits: ['open-command'],
        props: {
            generatedAt: { type: [String, Number], default: null },
            stale: { type: Boolean, default: false },
            connected: { type: Boolean, default: false },
            sourceStatus: { type: Object, default: function () { return {}; } },
            lastEvaluationAt: { type: [String, Number], default: null },
            nextPollAt: { type: [String, Number], default: null },
            now: { type: Number, default: Date.now },
            fleetName: { type: String, default: 'Watchdog Hub' }
        },
        data: function () {
            return { lightTheme: false };
        },
        mounted: function () {
            var savedTheme = global.localStorage && global.localStorage.getItem('watchdog-theme');
            if (savedTheme === 'light') {
                this.lightTheme = true;
                document.documentElement.setAttribute('data-theme', 'light');
            }
        },
        computed: {
            balenaState: function () {
                var balena = this.sourceStatus.balena;
                if (!balena || typeof balena.ok !== 'boolean') return 'unknown';
                return balena.ok ? 'ok' : 'dead';
            },
            mqttState: function () {
                var mqtt = this.sourceStatus.mqtt;
                if (!mqtt || typeof mqtt.ok !== 'boolean') return 'unknown';
                return mqtt.ok ? 'ok' : 'heartbeat_missing';
            },
            teamsState: function () {
                var teams = this.sourceStatus.teams || {};
                if (!teams.configured) return 'unknown';
                if (teams.lastError) return 'heartbeat_missing';
                return teams.lastSuccessAt ? 'ok' : 'unknown';
            }
        },
        methods: {
            formatDateTime: formatters.formatDateTime,
            toggleTheme: function () {
                this.lightTheme = !this.lightTheme;
                var theme = this.lightTheme ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', theme);
                if (global.localStorage) global.localStorage.setItem('watchdog-theme', theme);
            },
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
                    '<div class="header-identity">' +
                        '<div><p class="eyebrow">Supervision</p><h1>{{ fleetName }}</h1></div>' +
                    '</div>' +
                    '<div class="header-meta header-meta--primary">' +
                        '<span class="system-summary" :title="formatDateTime(generatedAt)">Dernier relevé {{ formatRelative(generatedAt) }}</span>' +
                        '<span class="header-live"><status-badge :state="connected ? \'ok\' : \'dead\'" :label="connected ? \'Connecté\' : \'Hors ligne\'"></status-badge><span class="sr-only">{{ connected ? \'WebSocket connected\' : \'WebSocket disconnected\' }}</span></span>' +
                        '<button class="header-theme-toggle" type="button" :aria-pressed="lightTheme ? \'true\' : \'false\'" :aria-label="lightTheme ? \'Activer le thème sombre\' : \'Activer le thème clair\'" @click="toggleTheme">{{ lightTheme ? \'Thème clair\' : \'Thème sombre\' }}</button>' +
                        '<button class="header-command" type="button" @click="$emit(\'open-command\')">Rechercher <kbd>Ctrl K</kbd></button>' +
                    '</div>' +
                '</div>' +
                '<details class="header-secondary">' +
                    '<summary>Sources et télémétrie</summary>' +
                    '<div class="header-sources" aria-label="État des sources">' +
                        '<status-badge :state="balenaState" label="Balena" announce-state></status-badge>' +
                        '<status-badge :state="mqttState" label="MQTT" announce-state></status-badge>' +
                        '<status-badge :state="teamsState" label="Teams" announce-state></status-badge>' +
                        '<status-badge v-if="stale" state="heartbeat_missing" label="Données anciennes"></status-badge>' +
                    '</div>' +
                    '<dl class="source-details">' +
                        '<div><dt>Relevé</dt><dd :title="formatDateTime(generatedAt)">{{ formatRelative(generatedAt) }}</dd></div>' +
                        '<div><dt>Évaluation</dt><dd :title="formatDateTime(lastEvaluationAt)">{{ formatRelative(lastEvaluationAt) }}</dd></div>' +
                        '<div><dt>Dernier poll Balena</dt><dd :title="formatDateTime(sourceStatus.balena && sourceStatus.balena.lastSuccessAt)">{{ formatRelative(sourceStatus.balena && sourceStatus.balena.lastSuccessAt) }}</dd></div>' +
                        '<div><dt>Dernier heartbeat</dt><dd :title="formatDateTime(sourceStatus.mqtt && sourceStatus.mqtt.lastMessageAt)">{{ formatRelative(sourceStatus.mqtt && sourceStatus.mqtt.lastMessageAt) }}</dd></div>' +
                        '<div><dt>Prochain poll estimé</dt><dd :title="formatDateTime(nextPollAt)">{{ formatRelative(nextPollAt) }}</dd></div>' +
                    '</dl>' +
                    '<p v-if="errorText(sourceStatus.balena)" class="source-error" role="status"><strong>Balena :</strong> {{ errorText(sourceStatus.balena) }}</p>' +
                    '<p v-if="errorText(sourceStatus.teams)" class="source-error" role="status"><strong>Teams :</strong> {{ errorText(sourceStatus.teams) }}</p>' +
                '</details>' +
            '</header>'
    };
}(window));
