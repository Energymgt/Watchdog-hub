(function (global) {
    'use strict';

    function createUibuilderClient(handlers) {
        var client = global.uibuilder;
        var started = false;

        function send(action, data) {
            if (!client || typeof client.send !== 'function') {
                handlers.onError(new Error('UIbuilder est indisponible.'));
                return false;
            }
            client.send({ payload: { action: action, data: data && typeof data === 'object' ? data : {} } });
            return true;
        }

        function requestSnapshot() {
            return send('fleet_snapshot_get');
        }

        function requestRefresh() {
            return send('fleet_refresh_request');
        }

        function saveAdmin(data) {
            return send('fleet_admin_save', data);
        }

        function enrollDevice(data) {
            return send('fleet_device_enroll', data);
        }

        function unenrollDevice(uuid) {
            return send('fleet_device_unenroll', { uuid: uuid });
        }

        function testTeams() {
            return send('fleet_teams_test');
        }

        function start() {
            if (started) return;
            started = true;
            if (!client || typeof client.start !== 'function' || typeof client.onChange !== 'function') {
                handlers.onError(new Error('Le client UIbuilder local n’a pas pu être chargé.'));
                return;
            }

            client.onChange('msg', function (msg) {
                if (msg && msg.topic === 'fleet_snapshot') {
                    handlers.onSnapshot(msg.payload);
                }
                if (msg && msg.topic === 'flows_snapshot' && typeof handlers.onFlowsSnapshot === 'function') {
                    handlers.onFlowsSnapshot(msg.payload);
                }
                if (msg && msg.topic === 'flows_incident' && typeof handlers.onFlowsIncident === 'function') {
                    handlers.onFlowsIncident(msg.payload);
                }
                if (msg && msg.topic === 'flows_error' && typeof handlers.onFlowsError === 'function') {
                    handlers.onFlowsError(msg.payload);
                }
            });
            client.onChange('ioConnected', function (connected) {
                handlers.onConnection(Boolean(connected));
                if (connected) requestSnapshot();
            });

            try {
                client.start();
                if (typeof client.ioConnected === 'boolean') {
                    handlers.onConnection(client.ioConnected);
                }
                requestSnapshot();
            } catch (error) {
                handlers.onError(error);
            }
        }

        return {
            requestRefresh: requestRefresh,
            requestSnapshot: requestSnapshot,
            saveAdmin: saveAdmin,
            enrollDevice: enrollDevice,
            unenrollDevice: unenrollDevice,
            testTeams: testTeams,
            start: start
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.createUibuilderClient = createUibuilderClient;
}(window));
