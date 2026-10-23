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
            fleetName: { type: String, default: 'Watchdog Hub' },
            flowSummary: { type: Object, default: function () { return {}; } },
            fleetSummary: { type: Object, default: function () { return {}; } },
            devices: { type: Array, default: function () { return []; } }
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
            },
            flowsKnown: function () {
                return Object.prototype.hasOwnProperty.call(this.flowSummary, 'total');
            },
            systemState: function () {
                var devices = this.devices || [];
                var hasRows = devices.length > 0;
                var dead = devices.some(function (device) { return device.state === 'dead'; });
                var actionable = hasRows
                    ? devices.some(function (device) {
                        return device.state && device.state !== 'ok' && device.state !== 'unknown';
                    })
                    : (this.fleetSummary.alerts || 0) > 0;
                var unknownDevices = devices.some(function (device) { return device.state === 'unknown'; });
                var unavailable = (this.flowsKnown && (this.flowSummary.down || 0) > 0) || dead;
                var attention = (this.flowSummary.incidentsActive || 0) > 0 || (this.flowSummary.degraded || 0) > 0 || actionable;
                var unverified = (this.flowSummary.unknown || 0) > 0 || unknownDevices;
                if (!this.connected) {
                    if (!this.generatedAt && !this.flowsKnown) return { label: 'État inconnu', state: 'unknown' };
                    if (unavailable) return { label: 'Dernier relevé : des éléments sont indisponibles', state: 'dead' };
                    if (attention) return { label: 'Dernier relevé : des éléments nécessitent votre attention', state: 'cloud_down' };
                    if (unverified || this.stale) return { label: 'Dernier relevé : des éléments sont à vérifier', state: 'unknown' };
                    return { label: 'Dernier relevé : aucun défaut signalé', state: 'unknown' };
                }
                if (unavailable) return { label: 'Des éléments sont indisponibles', state: 'dead' };
                if (!this.generatedAt || !this.flowsKnown) return { label: 'État inconnu', state: 'unknown' };
                if (attention) return { label: 'Des éléments nécessitent votre attention', state: 'cloud_down' };
                if (unverified) return { label: 'Des éléments sont à vérifier', state: 'unknown' };
                if (this.stale) return { label: 'État non confirmé', state: 'heartbeat_missing' };
                return { label: 'Tout fonctionne', state: 'ok' };
            },
            affectedFlows: function () {
                return (this.flowSummary.degraded || 0) + (this.flowSummary.down || 0);
            },
            incidentsLabel: function () {
                if (!this.flowsKnown) return 'incidents non confirmés';
                return (this.flowSummary.incidentsActive || 0) + ' incidents';
            },
            flowsLabel: function () {
                if (!this.flowsKnown) return 'flux non confirmés';
                var unknown = this.flowSummary.unknown || 0;
                if (unknown > 0 && this.affectedFlows === 0) return unknown + ' flux non confirmés';
                if (unknown > 0) return this.affectedFlows + ' flux, ' + unknown + ' non confirmés';
                return this.affectedFlows + ' flux';
            },
            alertsLabel: function () {
                if (!this.generatedAt) return 'alertes flotte non confirmées';
                return (this.fleetSummary.alerts || 0) + ' alertes flotte';
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
                        '<status-badge :state="systemState.state" :label="systemState.label"></status-badge>' +
                    '</div>' +
                    '<div class="header-meta header-meta--primary">' +
                        '<span v-if="connected === false && (generatedAt || flowsKnown)" class="system-summary">Les compteurs qui suivent décrivent le dernier relevé reçu.</span>' +
                        '<span class="system-summary">{{ incidentsLabel }}</span>' +
                        '<span class="system-summary">{{ flowsLabel }}</span>' +
                        '<span class="system-summary">{{ alertsLabel }}</span>' +
                        '<span class="system-summary" :title="formatDateTime(generatedAt)">{{ connected ? \'Actualisé\' : \'Reçu\' }} {{ formatRelative(generatedAt) }}</span>' +
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
