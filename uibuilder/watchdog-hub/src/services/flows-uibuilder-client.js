(function (global) {
    'use strict';

    function createFlowsUibuilderClient(handlers) {
        var client = global.uibuilder;
        var started = false;

        function send(action, data) {
            if (!client || typeof client.send !== 'function') {
                handlers.onError(new Error('UIbuilder est indisponible.'));
                return false;
            }
            client.send({
                payload: {
                    action: action,
                    data: data && typeof data === 'object' ? data : {}
                }
            });
            return true;
        }

        function start() {
            if (started) return;
            started = true;
            if (!client || typeof client.send !== 'function') {
                handlers.onError(new Error('Le client UIbuilder Flux n’a pas pu être chargé.'));
            }
        }

        return {
            start: start,
            requestSnapshot: function () { return send('flows_snapshot_get'); },
            requestRefresh: function () { return send('flows_refresh_request'); },
            requestIncident: function (incidentId) {
                return send('flows_incident_get', { incident_id: incidentId });
            },
            addAction: function (data) { return send('flows_incident_action', data); },
            transitionIncident: function (data) { return send('flows_incident_patch', data); },
            resolveIncident: function (data) { return send('flows_incident_resolve', data); }
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createFlowsUibuilderClient = createFlowsUibuilderClient;
}(window));
