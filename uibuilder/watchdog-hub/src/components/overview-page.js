(function (global) {
    'use strict';

    var flowFormatters = global.WatchdogHub.flowsFormatters;
    var formatters = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.OverviewPage = {
        name: 'OverviewPage',
        emits: ['open-incident', 'open-view'],
        props: {
            fleetSummary: { type: Object, default: function () { return {}; } },
            flowSummary: { type: Object, default: function () { return {}; } },
            incidents: { type: Array, default: function () { return []; } },
            flows: { type: Array, default: function () { return []; } },
            loading: { type: Boolean, default: false },
            now: { type: Number, default: Date.now }
        },
        computed: {
            activeIncidents: function () {
                return this.incidents.filter(function (incident) {
                    return incident.state !== 'RESOLU' && incident.state !== 'CLOS';
                }).slice().sort(function (a, b) {
                    var rank = flowFormatters.incidentStateMeta(b.state).rank
                        - flowFormatters.incidentStateMeta(a.state).rank;
                    return rank || (new Date(a.opened_at).getTime() || 0)
                        - (new Date(b.opened_at).getTime() || 0);
                }).slice(0, 5);
            },
            degradedFlows: function () {
                return this.flows.filter(function (flow) {
                    return flow.status === 'down' || flow.status === 'degraded';
                }).slice(0, 5);
            }
        },
        methods: {
            incidentMeta: flowFormatters.incidentStateMeta,
            flowMeta: flowFormatters.flowStatusMeta,
            formatRelative: function (value) {
                return formatters.formatRelative(value, this.now);
            },
            badgeState: function (tone) {
                if (tone === 'critical') return 'dead';
                if (tone === 'high') return 'heartbeat_missing';
                if (tone === 'warning') return 'cloud_down';
                if (tone === 'ok') return 'ok';
                return 'unknown';
            },
            openIncident: function (incident) {
                this.$emit('open-incident', incident);
            }
        },
        template:
            '<section class="overview-page" aria-labelledby="overview-title">' +
                '<div class="overview-hero">' +
                    '<div><p class="eyebrow">Opérations</p><h2 id="overview-title">Vue d’ensemble</h2><p>Priorités de supervision et état consolidé des systèmes.</p></div>' +
                    '<ui-button variant="secondary" @click="$emit(\'open-view\', \'incidents\')">Voir tous les incidents</ui-button>' +
                '</div>' +
                '<section class="overview-kpis" aria-label="Résumé opérationnel" :aria-busy="loading ? \'true\' : \'false\'">' +
                    '<kpi-card label="Incidents actifs" :value="flowSummary.incidentsActive || 0" tone="critical"></kpi-card>' +
                    '<kpi-card label="Flux dégradés" :value="(flowSummary.degraded || 0) + (flowSummary.down || 0)" tone="warning"></kpi-card>' +
                    '<kpi-card label="Alertes flotte" :value="fleetSummary.alerts || 0" tone="high"></kpi-card>' +
                    '<kpi-card label="Appareils suivis" :value="fleetSummary.total || fleetSummary.devices || 0" tone="ok"></kpi-card>' +
                '</section>' +
                '<div class="overview-grid">' +
                    '<section class="overview-panel" aria-labelledby="priority-incidents-title">' +
                        '<div class="section-heading"><div><p class="eyebrow">À traiter maintenant</p><h3 id="priority-incidents-title">Incidents prioritaires</h3></div><span class="activity-count">{{ flowSummary.incidentsActive || 0 }} actifs</span></div>' +
                        '<ol v-if="activeIncidents.length" class="priority-list">' +
                            '<li v-for="incident in activeIncidents" :key="incident.incident_id">' +
                                '<button type="button" class="priority-list__item" @click="openIncident(incident)">' +
                                    '<span><strong>{{ incident.flow_id }}</strong><small>{{ incident.error_signature || \'Incident sans signature\' }}</small></span>' +
                                    '<span><status-badge :state="badgeState(incidentMeta(incident.state).tone)" :label="incidentMeta(incident.state).label"></status-badge><small>Ouvert {{ formatRelative(incident.opened_at) }}</small></span>' +
                                '</button>' +
                            '</li>' +
                        '</ol>' +
                        '<p v-else class="empty-inline">Aucun incident actif.</p>' +
                    '</section>' +
                    '<section class="overview-panel" aria-labelledby="priority-flows-title">' +
                        '<div class="section-heading"><div><p class="eyebrow">Diagnostic</p><h3 id="priority-flows-title">Flux à surveiller</h3></div><ui-button variant="ghost" @click="$emit(\'open-view\', \'flows\')">Ouvrir les flux</ui-button></div>' +
                        '<ul v-if="degradedFlows.length" class="watch-list">' +
                            '<li v-for="flow in degradedFlows" :key="flow.flow_id"><span><strong>{{ flow.name }}</strong><small>{{ flow.status_reason }}</small></span><status-badge :state="badgeState(flowMeta(flow.status).tone)" :label="flowMeta(flow.status).label"></status-badge></li>' +
                        '</ul>' +
                        '<p v-else class="empty-inline">Tous les flux sont opérationnels.</p>' +
                    '</section>' +
                '</div>' +
            '</section>'
    };
}(window));
