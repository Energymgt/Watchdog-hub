(function (global) {
    'use strict';

    function validTimestamp(value) {
        return value && !Number.isNaN(new Date(value).getTime());
    }

    function normalizeEvent(event) {
        if (!event || !event.event_id) return null;
        var timestamp = validTimestamp(event.timestamp) ? event.timestamp : event.ingested_at;
        if (!validTimestamp(timestamp)) return null;
        return {
            id: String(event.event_id),
            timestamp: timestamp,
            category: 'EVENT',
            title: String(event.event_type || 'EVENT'),
            description: String(event.error_signature || event.status || event.event_type || ''),
            entityType: event.flow_id ? 'FLOW' : null,
            entityId: event.flow_id || null,
            source: 'EVENT',
            navigation: event.flow_id ? { view: 'flows', flowId: event.flow_id } : null
        };
    }

    function normalizeIncident(incident, phase) {
        if (!incident || !incident.incident_id) return null;
        var timestamp = phase === 'closed' ? incident.closed_at : incident.opened_at;
        if (!validTimestamp(timestamp)) return null;
        return {
            id: String(incident.incident_id) + ':' + phase,
            timestamp: timestamp,
            category: 'INCIDENT',
            title: phase === 'closed' ? 'Incident fermé' : 'Incident ouvert',
            description: String(incident.incident_id),
            entityType: 'INCIDENT',
            entityId: String(incident.incident_id),
            source: 'INCIDENT',
            navigation: { view: 'incidents', incidentId: incident.incident_id }
        };
    }

    function normalizeAnomaly(anomaly, phase) {
        if (!anomaly || !anomaly.anomaly_id) return null;
        var timestamp = phase === 'closed' ? anomaly.closed_at : anomaly.opened_at;
        if (!validTimestamp(timestamp)) return null;
        return {
            id: String(anomaly.anomaly_id) + ':' + phase,
            timestamp: timestamp,
            category: 'ANOMALY',
            title: phase === 'closed' ? 'ANOMALY CLOSED' : 'ANOMALY OPENED',
            description: String(anomaly.error_signature || anomaly.clause_id || anomaly.anomaly_id),
            entityType: 'ANOMALY',
            entityId: String(anomaly.anomaly_id),
            source: 'ANOMALY',
            navigation: { view: 'anomalies', anomalyId: anomaly.anomaly_id }
        };
    }

    function normalizeFleetTransition(transition, index) {
        if (!transition || !validTimestamp(transition.at)) return null;
        var id = transition.uuid || transition.name || index;
        return {
            id: String(id) + ':' + String(transition.at),
            timestamp: transition.at,
            category: 'FLEET',
            title: 'Transition flotte',
            description: String(transition.detail || [transition.name || transition.uuid || 'Appareil', transition.from, transition.to].filter(Boolean).join(' vers ')),
            entityType: transition.uuid ? 'FLEET' : null,
            entityId: transition.uuid || null,
            source: 'FLEET',
            navigation: transition.uuid ? { view: 'fleet', fleetId: transition.uuid } : null
        };
    }

    function selectActivity(sources, options) {
        var config = options || {};
        var items = [];
        (sources.events || []).forEach(function (event) {
            var normalized = normalizeEvent(event);
            if (normalized) items.push(normalized);
        });
        (sources.incidents || []).forEach(function (incident) {
            ['opened', 'closed'].forEach(function (phase) {
                var normalized = normalizeIncident(incident, phase);
                if (normalized) items.push(normalized);
            });
        });
        (sources.anomalies || []).forEach(function (anomaly) {
            ['opened', 'closed'].forEach(function (phase) {
                var normalized = normalizeAnomaly(anomaly, phase);
                if (normalized) items.push(normalized);
            });
        });
        (sources.fleetTransitions || []).forEach(function (transition, index) {
            var normalized = normalizeFleetTransition(transition, index);
            if (normalized) items.push(normalized);
        });

        var seen = {};
        items = items.filter(function (item) {
            var key = item.source + ':' + item.id;
            if (seen[key]) return false;
            seen[key] = true;
            return !config.category || item.category === config.category;
        });
        items.sort(function (a, b) {
            return (new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                || String(b.id).localeCompare(String(a.id), 'fr', { sensitivity: 'base' });
        });
        return config.limit ? items.slice(0, config.limit) : items;
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.activitySelector = {
        normalizeEvent: normalizeEvent,
        normalizeIncident: normalizeIncident,
        normalizeAnomaly: normalizeAnomaly,
        normalizeFleetTransition: normalizeFleetTransition,
        selectActivity: selectActivity
    };
}(window));
