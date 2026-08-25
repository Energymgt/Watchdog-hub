(function (global) {
    'use strict';

    function createFleetStore(Vue) {
        var formatters = global.WatchdogHub.formatters;
        var state = Vue.reactive({
            snapshot: null,
            devices: [],
            summary: {},
            sourceStatus: {},
            recentTransitions: [],
            pendingConfirmations: [],
            lastError: null,
            notice: null,
            loading: true,
            refreshing: false,
            connected: null,
            receivedAt: null,
            query: '',
            statusFilter: 'all',
            sourceFilter: 'all',
            sortBy: 'severity',
            selectedDevice: null,
            view: 'fleet',
            admin: null,
            adminSaving: false
        });

        function countStates(devices) {
            return devices.reduce(function (counts, device) {
                counts.total += 1;
                counts[device.state] = (counts[device.state] || 0) + 1;
                if (device.state !== 'ok') counts.alerts += 1;
                return counts;
            }, { total: 0, alerts: 0 });
        }

        function acceptSnapshot(payload) {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                state.lastError = 'Le snapshot reçu est invalide.';
                state.loading = false;
                state.refreshing = false;
                return false;
            }

            var devices = Array.isArray(payload.devices)
                ? payload.devices.map(formatters.normalizeDevice)
                : [];
            var calculated = countStates(devices);
            state.snapshot = {
                generatedAt: payload.generatedAt || null,
                grace: payload.grace,
                sourceStatus: payload.sourceStatus,
                lastEvaluationAt: payload.lastEvaluationAt || null,
                nextPollAt: payload.nextPollAt || null,
                pollIntervalMs: payload.pollIntervalMs || null
            };
            var selectedUuid = state.selectedDevice && state.selectedDevice.uuid;
            state.devices = devices;
            if (selectedUuid) {
                state.selectedDevice = devices.find(function (device) {
                    return device.uuid === selectedUuid;
                }) || null;
            }
            state.summary = Object.assign({}, calculated, payload.summary || {});
            state.sourceStatus = payload.sourceStatus || {};
            state.recentTransitions = Array.isArray(payload.recentTransitions)
                ? payload.recentTransitions.slice(0, 50)
                : [];
            state.pendingConfirmations = Array.isArray(payload.pendingConfirmations)
                ? payload.pendingConfirmations.slice()
                : [];
            state.admin = payload.admin && typeof payload.admin === 'object'
                ? payload.admin
                : (state.admin || {
                    fleetName: 'Watchdog Hub',
                    mqtt: { host: 'iot.energymgt.io', port: 1883, topicPattern: 'bacnet/gateway/{uuid}/heartbeat', qos: 1, retain: true },
                    balena: { configured: false, appId: '', tokenSet: false },
                    teams: { configured: false },
                    settings: {
                        heartbeatTtlDays: 30,
                        offlineGraceMinutes: 5,
                        firstSeenGraceMinutes: 5,
                        confirmsRequired: 2,
                        pollIntervalMs: 120000
                    },
                    enrolled: []
                });
            state.lastError = payload.lastError
                ? (payload.lastError.message || String(payload.lastError))
                : null;
            state.notice = payload.notice || null;
            state.receivedAt = Date.now();
            state.loading = false;
            state.refreshing = false;
            state.adminSaving = false;
            return true;
        }

        function setConnected(connected) {
            state.connected = Boolean(connected);
        }

        function setClientError(error) {
            state.lastError = error && error.message ? error.message : String(error || 'Erreur de connexion inconnue');
            state.loading = false;
            state.refreshing = false;
            state.adminSaving = false;
        }

        function beginRefresh() {
            state.refreshing = true;
        }

        function beginAdminSave() {
            state.adminSaving = true;
        }

        function setView(view) {
            state.view = view === 'admin' ? 'admin' : 'fleet';
            if (state.view === 'admin') state.selectedDevice = null;
        }

        function selectDevice(device) {
            state.selectedDevice = device || null;
        }

        return {
            state: state,
            acceptSnapshot: acceptSnapshot,
            beginRefresh: beginRefresh,
            beginAdminSave: beginAdminSave,
            setView: setView,
            selectDevice: selectDevice,
            setClientError: setClientError,
            setConnected: setConnected
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createFleetStore = createFleetStore;
}(window));
