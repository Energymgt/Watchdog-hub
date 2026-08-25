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
            if (!client || typeof client.onChange !== 'function') {
                handlers.onError(new Error('Le client UIbuilder Flux n’a pas pu être chargé.'));
                return;
            }
            client.onChange('msg', function (msg) {
                if (!msg) return;
                if (msg.topic === 'flows_snapshot') handlers.onSnapshot(msg.payload);
                if (msg.topic === 'flows_incident') handlers.onIncident(msg.payload);
                if (msg.topic === 'flows_error') handlers.onError(msg.payload);
            });
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

    global.WatchdogFleet = global.WatchdogFleet || {};
    global.WatchdogFleet.createFlowsUibuilderClient = createFlowsUibuilderClient;
}(window));
