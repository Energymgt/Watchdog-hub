(function (global) {
    'use strict';

    function createAnomaliesStore(Vue) {
        var state = Vue.reactive({
            anomalies: [],
            selectedAnomaly: null,
            snapshot: null,
            loading: false,
            refreshing: false,
            lastError: null,
            query: '',
            statusFilter: 'all',
            flowFilter: 'all',
            clauseFilter: 'all'
        });

        function acceptSnapshot(payload) {
            if (!payload || payload.ok === false || !Array.isArray(payload.anomalies)) {
                setError({ message: 'Le snapshot Anomalies reçu est invalide.' });
                return false;
            }
            state.anomalies = payload.anomalies.slice().sort(function (a, b) {
                var opened = (new Date(b.opened_at).getTime() || 0) - (new Date(a.opened_at).getTime() || 0);
                return opened || String(a.anomaly_id || '').localeCompare(String(b.anomaly_id || ''), 'fr', { sensitivity: 'base' });
            });
            state.snapshot = { generatedAt: payload.generatedAt || Date.now() };
            state.loading = false;
            state.refreshing = false;
            state.lastError = null;
            return true;
        }

        function acceptDetail(payload) {
            if (!payload || payload.ok === false || !payload.anomaly) {
                setError({ message: 'Le détail de l’anomalie reçu est invalide.' });
                return false;
            }
            state.selectedAnomaly = payload.anomaly;
            state.loading = false;
            state.refreshing = false;
            state.lastError = null;
            return true;
        }

        function setError(error) {
            state.lastError = error && error.message
                ? error.message
                : String(error || 'Erreur Watchdog inconnue');
            state.loading = false;
            state.refreshing = false;
        }

        function beginLoad() {
            state.loading = !state.snapshot;
            state.refreshing = Boolean(state.snapshot);
            state.lastError = null;
        }

        function selectAnomaly(detail) {
            state.selectedAnomaly = detail || null;
        }

        function resetFilters() {
            state.query = '';
            state.statusFilter = 'all';
            state.flowFilter = 'all';
            state.clauseFilter = 'all';
        }

        return {
            state: state,
            acceptSnapshot: acceptSnapshot,
            acceptDetail: acceptDetail,
            beginLoad: beginLoad,
            selectAnomaly: selectAnomaly,
            resetFilters: resetFilters,
            setError: setError
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createAnomaliesStore = createAnomaliesStore;
}(window));
