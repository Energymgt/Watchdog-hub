(function (global) {
    'use strict';

    function createAlertsStore(Vue) {
        var state = Vue.reactive({
            alerts: [],
            summary: { open: 0, acknowledged: 0, closed: 0 },
            selected: null,
            snapshot: null,
            loading: false,
            refreshing: false,
            mutating: false,
            lastError: null,
            statusFilter: 'active'
        });

        function setError(error) {
            state.lastError = error && error.message ? error.message : 'La file d’alertes est indisponible.';
            state.loading = false;
            state.refreshing = false;
            state.mutating = false;
        }

        function acceptSnapshot(payload) {
            if (!payload || payload.ok === false || !Array.isArray(payload.alerts)) {
                setError({ message: 'Le snapshot Alertes reçu est invalide.' });
                return false;
            }
            state.alerts = payload.alerts.slice();
            state.summary = payload.summary || { open: 0, acknowledged: 0, closed: 0 };
            state.snapshot = { generatedAt: payload.generatedAt || Date.now() };
            state.loading = false;
            state.refreshing = false;
            state.mutating = false;
            state.lastError = null;
            return true;
        }

        function acceptDetail(payload) {
            if (!payload || payload.ok === false || !payload.alert) {
                setError({ message: 'Le détail de l’alerte reçu est invalide.' });
                return false;
            }
            state.selected = {
                alert: payload.alert,
                history: Array.isArray(payload.history) ? payload.history.slice() : [],
                deliveries: Array.isArray(payload.deliveries) ? payload.deliveries.slice() : []
            };
            state.loading = false;
            state.refreshing = false;
            state.mutating = false;
            state.lastError = null;
            return true;
        }

        function beginLoad(refreshing) {
            if (refreshing) state.refreshing = true;
            else state.loading = true;
            state.lastError = null;
        }

        function beginMutation() {
            state.mutating = true;
        }

        function selectAlert(alert) {
            state.selected = alert ? { alert: alert, history: [], deliveries: [] } : null;
        }

        return {
            state: state,
            acceptSnapshot: acceptSnapshot,
            acceptDetail: acceptDetail,
            beginLoad: beginLoad,
            beginMutation: beginMutation,
            selectAlert: selectAlert,
            setError: setError
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createAlertsStore = createAlertsStore;
}(window));
