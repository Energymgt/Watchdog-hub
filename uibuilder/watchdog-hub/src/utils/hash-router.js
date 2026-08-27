(function (global) {
    'use strict';

    var VIEWS = {
        overview: true,
        incidents: true,
        flows: true,
        anomalies: true,
        events: true,
        fleet: true,
        admin: true
    };

    function parseHash(hash) {
        var value = String(hash || '').replace(/^#/, '');
        var parts = value.split('/').filter(Boolean);
        var view = VIEWS[parts[0]] ? parts[0] : 'overview';
        return {
            view: view,
            incidentId: view === 'incidents' && parts[1] ? decodeURIComponent(parts[1]) : null
        };
    }

    function formatHash(view, incidentId) {
        var target = VIEWS[view] ? view : 'overview';
        if (target === 'overview') return '';
        if (target === 'incidents' && incidentId) return '#incidents/' + encodeURIComponent(incidentId);
        return '#' + target;
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.hashRouter = {
        parse: parseHash,
        format: formatHash
    };
}(window));
