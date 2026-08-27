(function (global) {
    'use strict';

    function createEventsStore(Vue) {
        var state = Vue.reactive({
            events: [],
            selectedEvent: null,
            snapshot: null,
            loading: false,
            refreshing: false,
            lastError: null,
            query: '',
            typeFilter: 'all',
            sourceFilter: 'all',
            flowFilter: 'all'
        });

        function acceptSnapshot(payload) {
            if (!payload || payload.ok === false || !Array.isArray(payload.events)) {
                setError({ message: 'Le snapshot Events reçu est invalide.' });
                return false;
            }
            state.events = payload.events.slice().sort(function (a, b) {
                var timestamp = (new Date(b.timestamp).getTime() || 0) - (new Date(a.timestamp).getTime() || 0);
                return timestamp || String(b.event_id || '').localeCompare(String(a.event_id || ''), 'fr', { sensitivity: 'base' });
            });
            state.snapshot = { generatedAt: payload.generatedAt || Date.now() };
            state.loading = false;
            state.refreshing = false;
            state.lastError = null;
            return true;
        }

        function acceptDetail(payload) {
            if (!payload || payload.ok === false || !payload.event) {
                setError({ message: 'Le détail Event reçu est invalide.' });
                return false;
            }
            state.selectedEvent = payload.event;
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

        function selectEvent(event) {
            state.selectedEvent = event || null;
        }

        function resetFilters() {
            state.query = '';
            state.typeFilter = 'all';
            state.sourceFilter = 'all';
            state.flowFilter = 'all';
        }

        return {
            state: state,
            acceptSnapshot: acceptSnapshot,
            acceptDetail: acceptDetail,
            beginLoad: beginLoad,
            selectEvent: selectEvent,
            resetFilters: resetFilters,
            setError: setError
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createEventsStore = createEventsStore;
}(window));
