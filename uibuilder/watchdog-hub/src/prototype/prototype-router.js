(function (global) {
    'use strict';

    /**
     * Routeur Canonique Adressable — Watchdog Hub v2 (Passe 2)
     *
     * Grammaire canonique :
     *   #overview                (ou '' / '#' / '#/overview')
     *   #flows                   | #flows/{flowId}
     *   #fleet                   | #fleet/{uuid}
     *   #alerts                  | #alerts/{alertId}
     *   #incidents               | #incidents/{incidentId}
     *   #anomalies               | #anomalies/{anomalyId}
     *   #events                  | #events/{eventId}
     *   #admin
     *
     * Règles de résolution d'adresse :
     *   - Tolère les slashs initiaux ou finaux (#/flows/CSV_OASSIS_01/ -> #flows/CSV_OASSIS_01)
     *   - Décode uniquement après découpage du premier '/' pour préserver les identifiants encodés (%2F, %20, etc.)
     *   - Distingue 4 états de résolution d'objet :
     *       1. 'none'        : vue liste sans identifiant
     *       2. 'found'       : objet résolu dans le relevé (200)
     *       3. 'unavailable' : le relevé (snapshot) du domaine est absent ou en erreur (503 — jamais confondu avec un 404)
     *       4. 'not_found'   : le relevé est chargé mais l'identifiant demandé n'y existe pas (404)
     */
    var VIEW_TO_KIND = {
        overview: null,
        flows: 'flow',
        fleet: 'device',
        alerts: 'alert',
        incidents: 'incident',
        anomalies: 'anomaly',
        events: 'event',
        admin: null
    };

    var KIND_TO_VIEW = {
        flow: 'flows',
        device: 'fleet',
        alert: 'alerts',
        incident: 'incidents',
        anomaly: 'anomalies',
        event: 'events'
    };

    var KIND_LABELS = {
        flow: 'Flux métier',
        device: 'Appareil',
        alert: 'Alerte',
        incident: 'Incident',
        anomaly: 'Anomalie',
        event: 'Événement'
    };

    var VIEW_LABELS = {
        overview: 'Vue d’ensemble',
        flows: 'Flux métier',
        fleet: 'Appareils',
        alerts: 'Alertes',
        incidents: 'Incidents',
        anomalies: 'Anomalies',
        events: 'Événements',
        admin: 'Configuration'
    };

    function safeDecode(segment) {
        if (segment === null || segment === undefined) return null;
        var raw = String(segment);
        if (!raw) return null;
        try {
            return decodeURIComponent(raw);
        } catch (error) {
            return raw;
        }
    }

    function parse(rawHash) {
        var cleaned = String(rawHash || '')
            .replace(/^#+/, '')
            .replace(/^\/+/, '')
            .replace(/\/+$/, '')
            .trim();

        if (!cleaned) {
            return {
                view: 'overview',
                viewLabel: VIEW_LABELS.overview,
                objectKind: null,
                objectId: null,
                canonicalHash: '#overview',
                isKnownView: true,
                rawRequestedView: 'overview'
            };
        }

        var slashIndex = cleaned.indexOf('/');
        var rawView = slashIndex === -1 ? cleaned : cleaned.slice(0, slashIndex);
        var rawIdSegment = slashIndex === -1 ? '' : cleaned.slice(slashIndex + 1).replace(/\/+$/, '');
        var viewKey = rawView.toLowerCase();

        if (!Object.prototype.hasOwnProperty.call(VIEW_TO_KIND, viewKey)) {
            return {
                view: 'overview',
                viewLabel: VIEW_LABELS.overview,
                objectKind: null,
                objectId: null,
                canonicalHash: '#overview',
                isKnownView: false,
                rawRequestedView: rawView
            };
        }

        var objectKind = VIEW_TO_KIND[viewKey];
        var decodedId = objectKind && rawIdSegment ? safeDecode(rawIdSegment) : null;
        if (decodedId !== null && String(decodedId).trim() === '') {
            decodedId = null;
        }

        return {
            view: viewKey,
            viewLabel: VIEW_LABELS[viewKey],
            objectKind: decodedId ? objectKind : null,
            objectId: decodedId,
            canonicalHash: format(viewKey, decodedId),
            isKnownView: true,
            rawRequestedView: viewKey
        };
    }

    function format(view, objectId) {
        var target = Object.prototype.hasOwnProperty.call(VIEW_TO_KIND, view) ? view : 'overview';
        var kind = VIEW_TO_KIND[target];
        if (kind && objectId !== null && objectId !== undefined && String(objectId).trim() !== '') {
            return '#' + target + '/' + encodeURIComponent(String(objectId).trim());
        }
        return '#' + target;
    }

    function formatObject(kind, objectId) {
        var view = KIND_TO_VIEW[kind] || 'overview';
        return format(view, objectId);
    }

    /**
     * Résout l'objet pointé par une route canonique en distinguant :
     * - 'unavailable' (503) si le snapshot du domaine n'est pas disponible
     * - 'not_found' (404) si le snapshot est disponible mais que l'ID est introuvable
     * - 'found' (200) si l'enregistrement est trouvé
     */
    function resolveTarget(parsedRoute, context) {
        if (!parsedRoute || !parsedRoute.objectKind || !parsedRoute.objectId) {
            return null;
        }
        var kind = parsedRoute.objectKind;
        var id = parsedRoute.objectId;
        var dataset = (context && context.dataset) || {};
        var availability = (context && context.availability) || {};

        var domainAvailable = availability[kind] !== false;
        if (!domainAvailable) {
            return {
                state: 'unavailable',
                status: 503,
                kind: kind,
                kindLabel: KIND_LABELS[kind] || kind,
                id: id,
                record: null,
                canonicalUrl: parsedRoute.canonicalHash,
                parentView: parsedRoute.view,
                parentViewLabel: VIEW_LABELS[parsedRoute.view] || parsedRoute.view
            };
        }

        var record = null;
        if (kind === 'flow') {
            record = (dataset.flows || []).filter(function (f) { return f.flow_id === id; })[0] || null;
        } else if (kind === 'device') {
            record = (dataset.devices || []).filter(function (d) { return d.uuid === id; })[0] || null;
        } else if (kind === 'alert') {
            record = (dataset.alerts || []).filter(function (a) { return a.alert_id === id; })[0] || null;
        } else if (kind === 'incident') {
            record = (dataset.incidents || []).filter(function (i) { return i.incident_id === id; })[0] || null;
        } else if (kind === 'anomaly') {
            record = (dataset.anomalies || []).filter(function (a) { return a.anomaly_id === id; })[0] || null;
        } else if (kind === 'event') {
            record = (dataset.events || []).filter(function (e) { return e.event_id === id; })[0] || null;
        }

        return {
            state: record ? 'found' : 'not_found',
            status: record ? 200 : 404,
            kind: kind,
            kindLabel: KIND_LABELS[kind] || kind,
            id: id,
            record: record,
            canonicalUrl: parsedRoute.canonicalHash,
            parentView: parsedRoute.view,
            parentViewLabel: VIEW_LABELS[parsedRoute.view] || parsedRoute.view
        };
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.canonicalRouter = {
        parse: parse,
        format: format,
        formatObject: formatObject,
        resolveTarget: resolveTarget,
        VIEW_TO_KIND: VIEW_TO_KIND,
        KIND_TO_VIEW: KIND_TO_VIEW,
        KIND_LABELS: KIND_LABELS,
        VIEW_LABELS: VIEW_LABELS
    };
}(window));
