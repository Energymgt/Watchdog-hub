(function (global) {
    'use strict';

    function createAnomaliesUibuilderClient(handlers) {
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
                handlers.onError(new Error('Le client UIbuilder Anomalies n’a pas pu être chargé.'));
            }
        }

        return {
            start: start,
            requestSnapshot: function () { return send('anomalies_snapshot_get'); },
            requestDetail: function (anomalyId) {
                return send('anomalies_get', { anomaly_id: anomalyId });
            }
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createAnomaliesUibuilderClient = createAnomaliesUibuilderClient;
}(window));
