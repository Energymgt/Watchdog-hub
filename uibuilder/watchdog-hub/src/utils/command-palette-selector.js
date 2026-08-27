(function (global) {
    'use strict';

    function text(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    function item(type, id, title, subtitle, status, navigation, primary, secondary) {
        return {
            type: type,
            id: text(id),
            title: text(title || id),
            subtitle: text(subtitle),
            status: text(status),
            navigation: navigation,
            primary: text(primary || title || id).toLocaleLowerCase('fr-FR'),
            secondary: text(secondary).toLocaleLowerCase('fr-FR')
        };
    }

    function buildSearchItems(sources) {
        var items = [];
        (sources.incidents || []).forEach(function (incident) {
            items.push(item(
                'INCIDENT',
                incident.incident_id,
                incident.incident_id,
                [incident.flow_id, incident.error_signature, incident.state].filter(Boolean).join(' · '),
                incident.state,
                { view: 'incidents', incidentId: incident.incident_id },
                incident.incident_id,
                [incident.flow_id, incident.clause_id, incident.error_signature, incident.state].join(' ')
            ));
        });
        (sources.flows || []).forEach(function (flow) {
            items.push(item(
                'FLOW',
                flow.flow_id,
                flow.name || flow.flow_id,
                [flow.flow_id, flow.status, flow.status_reason].filter(Boolean).join(' · '),
                flow.status,
                { view: 'flows', flowId: flow.flow_id },
                flow.name || flow.flow_id,
                [flow.flow_id, flow.source_id, flow.connector_id, flow.destination_id, flow.status, flow.status_reason].join(' ')
            ));
        });
        (sources.anomalies || []).forEach(function (anomaly) {
            items.push(item(
                'ANOMALY',
                anomaly.anomaly_id,
                anomaly.anomaly_id,
                [anomaly.error_signature, anomaly.flow_id, anomaly.clause_id].filter(Boolean).join(' · '),
                anomaly.status,
                { view: 'anomalies', anomalyId: anomaly.anomaly_id },
                anomaly.anomaly_id,
                [anomaly.flow_id, anomaly.clause_id, anomaly.error_signature, anomaly.status].join(' ')
            ));
        });
        (sources.events || []).forEach(function (event) {
            items.push(item(
                'EVENT',
                event.event_id,
                event.event_id,
                [event.event_type, event.source_id, event.flow_id].filter(Boolean).join(' · '),
                event.status,
                { view: 'events', eventId: event.event_id },
                event.event_id,
                [event.event_type, event.flow_id, event.source_id, event.status, event.error_signature, event.producer].join(' ')
            ));
        });
        (sources.devices || []).forEach(function (device) {
            items.push(item(
                'DEVICE',
                device.uuid,
                device.name || device.uuid,
                [device.uuid, device.state].filter(Boolean).join(' · '),
                device.state,
                { view: 'fleet', deviceId: device.uuid },
                device.name || device.uuid,
                [device.uuid, device.detail, device.state].join(' ')
            ));
        });
        return items;
    }

    function searchItems(items, query, limit) {
        var normalized = text(query).trim().toLocaleLowerCase('fr-FR');
        if (!normalized) return [];
        return items.map(function (entry) {
            var id = entry.id.toLocaleLowerCase('fr-FR');
            var title = entry.title.toLocaleLowerCase('fr-FR');
            var rank = id === normalized ? 0
                : title === normalized ? 1
                    : (id.indexOf(normalized) === 0 || title.indexOf(normalized) === 0 ? 2
                        : (entry.primary.indexOf(normalized) !== -1 ? 3 : (entry.secondary.indexOf(normalized) !== -1 ? 4 : -1)));
            return { entry: entry, rank: rank };
        }).filter(function (match) {
            return match.rank >= 0;
        }).sort(function (a, b) {
            return a.rank - b.rank
                || a.entry.type.localeCompare(b.entry.type, 'fr')
                || a.entry.id.localeCompare(b.entry.id, 'fr');
        }).slice(0, limit || 15).map(function (match) {
            return match.entry;
        });
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.commandPaletteSelector = {
        buildSearchItems: buildSearchItems,
        searchItems: searchItems
    };
}(window));
