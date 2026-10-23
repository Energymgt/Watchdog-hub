(function (global) {
    'use strict';

    function createAlertsUibuilderClient(handlers) {
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
                handlers.onError(new Error('Le client UIbuilder Alertes n’a pas pu être chargé.'));
            }
        }

        return {
            start: start,
            requestSnapshot: function () { return send('alerts_snapshot_get'); },
            requestDetail: function (alertId) { return send('alerts_get', { alert_id: alertId }); },
            acknowledge: function (alertId, actor) {
                return send('alerts_ack', { alert_id: alertId, actor: actor });
            }
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createAlertsUibuilderClient = createAlertsUibuilderClient;
}(window));
