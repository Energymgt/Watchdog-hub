(function (global) {
    'use strict';

    var VIEWS = {
        overview: true,
        incidents: true,
        flows: true,
        anomalies: true,
        events: true,
        fleet: true,
        alerts: true,
        admin: true
    };

    // Mappage canonique vue <-> type d'objet inspecté (adresses profondes)
    var VIEW_TO_KIND = {
        flows: 'flow',
        fleet: 'device',
        alerts: 'alert',
        incidents: 'incident',
        anomalies: 'anomaly',
        events: 'event'
    };

    var KIND_TO_VIEW = {
        flow: 'flows',
        device: 'fleet',
        alert: 'alerts',
        incident: 'incidents',
        anomaly: 'anomalies',
        event: 'events'
    };

    function safeDecode(value) {
        try {
            return decodeURIComponent(value);
        } catch (error) {
            return value;
        }
    }

    function parseHash(hash) {
        var value = String(hash || '').replace(/^#/, '');
        var parts = value.split('/').filter(Boolean);
        var view = VIEWS[parts[0]] ? parts[0] : 'overview';
        return {
            view: view,
            incidentId: view === 'incidents' && parts[1] ? safeDecode(parts[1]) : null
        };
    }

    function formatHash(view, incidentId) {
        var target = VIEWS[view] ? view : 'overview';
        if (target === 'overview') return '';
        if (target === 'incidents' && incidentId) return '#incidents/' + encodeURIComponent(incidentId);
        return '#' + target;
    }

    /**
     * Format canonique : #vue/{identifiant-encode} pour toute vue supportant un détail.
     * Les segments en trop après la vue sont regroupés dans l'identifiant (décodage tolérant).
     */
    function parseCanonical(hash) {
        var raw = String(hash || '');
        var value = raw.replace(/^#+/, '');
        var parts = value.split('/').filter(Boolean);
        var rawView = parts[0] || '';
        var isKnownView = value === '' || Boolean(VIEWS[rawView]);
        var view = isKnownView ? (VIEWS[rawView] ? rawView : 'overview') : 'overview';
        var objectId = null;
        if (VIEW_TO_KIND[view] && parts.length > 1) {
            objectId = safeDecode(parts.slice(1).join('/'));
        }
        var canonicalHash = formatCanonical(view, objectId);
        return {
            view: view,
            objectId: objectId,
            objectKind: VIEW_TO_KIND[view] || null,
            incidentId: view === 'incidents' ? objectId : null,
            canonicalHash: canonicalHash,
            isKnownView: isKnownView,
            rawRequestedView: rawView
        };
    }

    function formatCanonical(view, objectId) {
        var target = VIEWS[view] ? view : 'overview';
        if (target === 'overview') return '';
        if (VIEW_TO_KIND[target] && objectId) {
            return '#' + target + '/' + encodeURIComponent(objectId);
        }
        return '#' + target;
    }

    function formatObject(kind, objectId) {
        var view = KIND_TO_VIEW[kind];
        if (!view || !objectId) return '';
        return formatCanonical(view, objectId);
    }

    /**
     * Résout la cible d'une route canonique contre les données chargées.
     * Retourne { state: 'none'|'found'|'not_found'|'unavailable', id, kind, record }.
     */
    function resolveTarget(route, context) {
        context = context || {};
        if (!route || !route.objectId || !route.objectKind) return { state: 'none' };
        if (context.availability && context.availability[route.objectKind] === false) {
            return { state: 'unavailable', id: route.objectId, kind: route.objectKind, record: null };
        }
        var found = null;
        if (context.find) found = context.find(route.objectKind, route.objectId) || null;
        return {
            state: found ? 'found' : 'not_found',
            id: route.objectId,
            kind: route.objectKind,
            record: found
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.hashRouter = {
        parse: parseHash,
        format: formatHash,
        parseCanonical: parseCanonical,
        formatCanonical: formatCanonical,
        formatObject: formatObject,
        resolveTarget: resolveTarget,
        VIEW_TO_KIND: VIEW_TO_KIND,
        KIND_TO_VIEW: KIND_TO_VIEW
    };
}(window));
