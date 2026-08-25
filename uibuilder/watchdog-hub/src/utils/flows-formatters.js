(function (global) {
    'use strict';

    var FLOW_STATUS_META = {
        ok: { label: 'Opérationnel', tone: 'ok', rank: 0 },
        unknown: { label: 'UNKNOWN', tone: 'unknown', rank: 1 },
        degraded: { label: 'Dégradé', tone: 'warning', rank: 2 },
        down: { label: 'Indisponible', tone: 'critical', rank: 3 }
    };
    var INCIDENT_STATE_META = {
        DETECTE: { label: 'Détecté', tone: 'warning', rank: 1 },
        OUVERT: { label: 'Ouvert', tone: 'high', rank: 2 },
        EN_ANALYSE: { label: 'En analyse', tone: 'high', rank: 3 },
        EN_CORRECTION: { label: 'En correction', tone: 'critical', rank: 4 },
        EN_VALIDATION: { label: 'En validation', tone: 'warning', rank: 5 },
        RESOLU: { label: 'Résolu', tone: 'ok', rank: 0 },
        CLOS: { label: 'Clos', tone: 'unknown', rank: 0 }
    };
    var REASON_LABELS = {
        no_contract: 'Contrat de santé absent',
        no_events: 'Aucun événement reçu',
        incident_confirmed: 'Incident confirmé',
        incident_detecte: 'Incident détecté',
        anomaly_open: 'Anomalie ouverte',
        nominal: 'Fonctionnement nominal'
    };

    function flowStatusMeta(value) {
        return FLOW_STATUS_META[String(value || '').toLowerCase()] || FLOW_STATUS_META.unknown;
    }

    function incidentStateMeta(value) {
        return INCIDENT_STATE_META[String(value || '').toUpperCase()]
            || { label: String(value || 'Inconnu'), tone: 'unknown', rank: 0 };
    }

    function normalizeFlow(source, index) {
        var flow = source && typeof source === 'object' ? source : {};
        var id = String(flow.flow_id || ('flow-' + index));
        return Object.assign({}, flow, {
            flow_id: id,
            name: String(flow.name || id),
            status: FLOW_STATUS_META[flow.status] ? flow.status : 'unknown',
            status_reason: String(flow.status_reason || 'no_events')
        });
    }

    function normalizeIncident(source, index) {
        var incident = source && typeof source === 'object' ? source : {};
        return Object.assign({}, incident, {
            incident_id: String(incident.incident_id || ('incident-' + index)),
            flow_id: String(incident.flow_id || 'Flux inconnu'),
            state: String(incident.state || 'DETECTE').toUpperCase()
        });
    }

    function reasonLabel(value) {
        return REASON_LABELS[value] || String(value || 'Raison inconnue');
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.flowsFormatters = {
        flowStatusMeta: flowStatusMeta,
        incidentStateMeta: incidentStateMeta,
        normalizeFlow: normalizeFlow,
        normalizeIncident: normalizeIncident,
        reasonLabel: reasonLabel
    };
}(window));
