(function (global) {
    'use strict';

    function createFlowsStore(Vue) {
        var formatters = global.WatchdogHub.flowsFormatters;
        var state = Vue.reactive({
            snapshot: null,
            flows: [],
            incidents: [],
            rules: [],
            summary: {},
            loading: false,
            refreshing: false,
            mutating: false,
            lastError: null,
            notice: null,
            query: '',
            statusFilter: 'all',
            incidentStateFilter: 'active',
            selectedIncident: null
        });

        function countSummary(flows, incidents) {
            var summary = {
                total: flows.length,
                ok: 0,
                degraded: 0,
                down: 0,
                unknown: 0,
                incidentsActive: 0
            };
            flows.forEach(function (flow) {
                summary[flow.status] = (summary[flow.status] || 0) + 1;
            });
            incidents.forEach(function (incident) {
                if (incident.state !== 'RESOLU' && incident.state !== 'CLOS') {
                    summary.incidentsActive += 1;
                }
            });
            return summary;
        }

        function acceptSnapshot(payload) {
            if (!payload || payload.ok === false || !Array.isArray(payload.flows) || !Array.isArray(payload.incidents)) {
                state.lastError = 'Le snapshot Flux reçu est invalide.';
                state.loading = false;
                state.refreshing = false;
                state.mutating = false;
                return false;
            }
            state.flows = payload.flows.map(formatters.normalizeFlow);
            state.incidents = payload.incidents.map(formatters.normalizeIncident);
            state.rules = Array.isArray(payload.rules) ? payload.rules.slice() : [];
            state.summary = countSummary(state.flows, state.incidents);
            state.snapshot = { generatedAt: payload.generatedAt || Date.now() };
            state.notice = payload.notice || null;
            state.lastError = null;
            state.loading = false;
            state.refreshing = false;
            state.mutating = false;
            return true;
        }

        function acceptIncident(payload) {
            if (!payload || payload.ok === false || !payload.incident) {
                setError({ message: 'Le détail de l’incident reçu est invalide.' });
                return false;
            }
            state.selectedIncident = {
                incident: formatters.normalizeIncident(payload.incident, 0),
                allowedTransitions: Array.isArray(payload.allowed_transitions)
                    ? payload.allowed_transitions.slice()
                    : [],
                links: Array.isArray(payload.links) ? payload.links.slice() : [],
                history: Array.isArray(payload.history) ? payload.history.slice() : [],
                actions: Array.isArray(payload.actions) ? payload.actions.slice() : [],
                resolutions: Array.isArray(payload.resolutions) ? payload.resolutions.slice() : []
            };
            state.mutating = false;
            state.lastError = null;
            return true;
        }

        function setError(error) {
            state.lastError = error && error.message
                ? error.message
                : String(error || 'Erreur Watchdog inconnue');
            state.loading = false;
            state.refreshing = false;
            state.mutating = false;
        }

        function beginLoad() {
            state.loading = !state.snapshot;
            state.refreshing = Boolean(state.snapshot);
            state.lastError = null;
            state.notice = null;
        }

        function beginMutation() {
            state.mutating = true;
            state.lastError = null;
            state.notice = null;
        }

        function selectIncident(detail) {
            state.selectedIncident = detail || null;
        }

        return {
            state: state,
            acceptSnapshot: acceptSnapshot,
            acceptIncident: acceptIncident,
            beginLoad: beginLoad,
            beginMutation: beginMutation,
            selectIncident: selectIncident,
            setError: setError
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createFlowsStore = createFlowsStore;
}(window));
