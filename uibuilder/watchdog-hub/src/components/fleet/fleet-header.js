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
            this.applyTheme(this.readTheme(), false);
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
            readTheme: function () {
                var saved = '';
                try {
                    saved = global.localStorage ? global.localStorage.getItem('watchdog-theme') : '';
                } catch (error) {
                    saved = '';
                }
                if (saved === 'dark' || saved === 'light') return saved;
                var current = document.documentElement.getAttribute('data-theme');
                return current === 'light' ? 'light' : 'dark';
            },
            applyTheme: function (theme, persist) {
                var next = theme === 'dark' ? 'dark' : 'light';
                this.lightTheme = next === 'light';
                document.documentElement.setAttribute('data-theme', next);
                document.documentElement.style.colorScheme = next;
                if (persist && global.localStorage) global.localStorage.setItem('watchdog-theme', next);
            },
            toggleTheme: function () {
                this.applyTheme(this.lightTheme ? 'dark' : 'light', true);
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
                '<div class="header-content header-bar">' +
                    '<div class="header-identity">' +
                        '<span class="brand-mark" aria-hidden="true">WH</span>' +
                        '<div class="header-titles"><p class="eyebrow header-eyebrow">Siège de supervision</p><h1>{{ fleetName }}</h1></div>' +
                    '</div>' +
                    '<div class="header-telemetry-inline" aria-label="Télémétrie temps réel">' +
                        '<span class="header-live"><status-badge :state="connected ? \'ok\' : \'dead\'" :label="connected ? \'Canal temps réel connecté\' : \'Canal hors ligne\'"></status-badge><span class="sr-only">{{ connected ? \'WebSocket connected\' : \'WebSocket disconnected\' }}</span></span>' +
                        '<status-badge v-if="stale" state="heartbeat_missing" label="Données anciennes"></status-badge>' +
                        '<span class="telemetry-divider" aria-hidden="true"></span>' +
                        '<status-badge :state="balenaState" label="Balena" announce-state></status-badge>' +
                        '<status-badge :state="mqttState" label="MQTT" announce-state></status-badge>' +
                        '<status-badge :state="teamsState" label="Teams" announce-state></status-badge>' +
                        '<span class="telemetry-divider" aria-hidden="true"></span>' +
                        '<span class="system-summary header-timestamp" :title="formatDateTime(generatedAt)">Dernier relevé {{ formatRelative(generatedAt) }}</span>' +
                    '</div>' +
                    '<div class="header-meta header-meta--primary header-actions">' +
                        '<button class="header-command command-trigger" type="button" @click="$emit(\'open-command\')"><span>Rechercher ou aller à...</span> <kbd>Ctrl K</kbd></button>' +
                        '<button class="header-theme-toggle theme-toggle" type="button" :aria-pressed="lightTheme ? \'true\' : \'false\'" :aria-label="lightTheme ? \'Thème clair actif. Activer le thème sombre.\' : \'Thème sombre actif. Activer le thème clair.\'" @click="toggleTheme">{{ lightTheme ? \'Thème clair, passer au sombre\' : \'Thème sombre, passer au clair\' }}</button>' +
                    '</div>' +
                '</div>' +
                '<details class="header-secondary header-telemetry-drawer">' +
                    '<summary>Sources, fraîcheur et cadencement des relevés</summary>' +
                    '<div class="header-sources" aria-label="État des sources">' +
                        '<status-badge :state="balenaState" label="Balena" announce-state></status-badge>' +
                        '<status-badge :state="mqttState" label="MQTT" announce-state></status-badge>' +
                        '<status-badge :state="teamsState" label="Teams" announce-state></status-badge>' +
                        '<status-badge v-if="stale" state="heartbeat_missing" label="Données anciennes"></status-badge>' +
                    '</div>' +
                    '<dl class="source-details telemetry-grid">' +
                        '<div class="telemetry-cell"><dt>Relevé</dt><dd :title="formatDateTime(generatedAt)">{{ formatRelative(generatedAt) }}</dd></div>' +
                        '<div class="telemetry-cell"><dt>Évaluation</dt><dd :title="formatDateTime(lastEvaluationAt)">{{ formatRelative(lastEvaluationAt) }}</dd></div>' +
                        '<div class="telemetry-cell"><dt>Dernier poll Balena</dt><dd :title="formatDateTime(sourceStatus.balena && sourceStatus.balena.lastSuccessAt)">{{ formatRelative(sourceStatus.balena && sourceStatus.balena.lastSuccessAt) }}</dd></div>' +
                        '<div class="telemetry-cell"><dt>Dernier heartbeat</dt><dd :title="formatDateTime(sourceStatus.mqtt && sourceStatus.mqtt.lastMessageAt)">{{ formatRelative(sourceStatus.mqtt && sourceStatus.mqtt.lastMessageAt) }}</dd></div>' +
                        '<div class="telemetry-cell"><dt>Prochain poll estimé</dt><dd :title="formatDateTime(nextPollAt)">{{ formatRelative(nextPollAt) }}</dd></div>' +
                    '</dl>' +
                    '<p v-if="errorText(sourceStatus.balena)" class="source-error" role="status"><strong>Balena :</strong> {{ errorText(sourceStatus.balena) }}</p>' +
                    '<p v-if="errorText(sourceStatus.teams)" class="source-error" role="status"><strong>Teams :</strong> {{ errorText(sourceStatus.teams) }}</p>' +
                '</details>' +
            '</header>'
    };
}(window));
