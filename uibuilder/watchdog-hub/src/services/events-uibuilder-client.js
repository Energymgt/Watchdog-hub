(function (global) {
    'use strict';

    function createEventsUibuilderClient(handlers) {
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
                handlers.onError(new Error('Le client UIbuilder Events n’a pas pu être chargé.'));
            }
        }

        return {
            start: start,
            requestSnapshot: function () { return send('events_snapshot_get'); },
            requestDetail: function (eventId) {
                return send('events_get', { event_id: eventId });
            }
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createEventsUibuilderClient = createEventsUibuilderClient;
}(window));
