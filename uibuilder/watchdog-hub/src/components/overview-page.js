(function (global) {
    'use strict';

    var flowFormatters = global.WatchdogHub.flowsFormatters;
    var formatters = global.WatchdogHub.formatters;

    var HEALTH_META = {
        ok: { token: 'HEALTHY', fill: 10, tone: 'ok' },
        degraded: { token: 'DEGRADED', fill: 8, tone: 'warning' },
        down: { token: 'DOWN', fill: 3, tone: 'critical' },
        unknown: { token: 'UNKNOWN', fill: 0, tone: 'unknown' }
    };

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
            affectedFlows: function () {
                return (this.flowSummary.degraded || 0) + (this.flowSummary.down || 0);
            },
            activeIncidents: function () {
                return this.incidents.filter(function (incident) {
                    return incident.state !== 'RESOLU' && incident.state !== 'CLOS';
                }).slice().sort(function (a, b) {
                    var rank = flowFormatters.incidentStateMeta(b.state).rank
                        - flowFormatters.incidentStateMeta(a.state).rank;
                    return rank || (new Date(a.opened_at).getTime() || 0)
                        - (new Date(b.opened_at).getTime() || 0);
                }).slice(0, 6);
            },
            watchedFlows: function () {
                var rank = { down: 0, degraded: 1, unknown: 2, ok: 3 };
                return this.flows.slice().sort(function (a, b) {
                    return (rank[a.status] || 2) - (rank[b.status] || 2);
                });
            }
        },
        methods: {
            incidentMeta: flowFormatters.incidentStateMeta,
            healthMeta: function (status) {
                return HEALTH_META[status] || HEALTH_META.unknown;
            },
            flowName: function (flowId) {
                var match = this.flows.filter(function (flow) {
                    return flow.flow_id === flowId;
                })[0];
                return match ? match.name : flowId;
            },
            formatRelative: function (value) {
                return formatters.formatRelative(value, this.now);
            },
            kpiTone: function (count, tone) {
                return count > 0 ? tone : 'unknown';
            },
            openIncident: function (incident) {
                this.$emit('open-incident', incident);
            }
        },
        template:
            '<section class="overview-page" aria-labelledby="overview-title">' +
                '<div class="overview-hero">' +
                    '<h2 id="overview-title">Operational Overview</h2>' +
                '</div>' +
                '<section class="overview-kpis" aria-label="Résumé opérationnel" :aria-busy="loading ? \'true\' : \'false\'">' +
                    '<kpi-card label="Incidents actifs" :value="flowSummary.incidentsActive || 0" :tone="kpiTone(flowSummary.incidentsActive || 0, \'critical\')" :loading="loading"></kpi-card>' +
                    '<kpi-card label="Flux dégradés" :value="affectedFlows" :tone="kpiTone(affectedFlows, \'warning\')" :loading="loading"></kpi-card>' +
                    '<kpi-card label="Alertes flotte" :value="fleetSummary.alerts || 0" :tone="kpiTone(fleetSummary.alerts || 0, \'high\')" :loading="loading"></kpi-card>' +
                    '<kpi-card label="Flux total" :value="flowSummary.total || 0" tone="unknown" :loading="loading"></kpi-card>' +
                '</section>' +
                '<div class="overview-grid">' +
                    '<section class="overview-panel" aria-labelledby="priority-incidents-title">' +
                        '<div class="section-heading">' +
                            '<h3 id="priority-incidents-title">À traiter maintenant</h3>' +
                            '<span class="activity-count">{{ flowSummary.incidentsActive || 0 }}</span>' +
                        '</div>' +
                        '<ol v-if="activeIncidents.length" class="priority-list">' +
                            '<li v-for="incident in activeIncidents" :key="incident.incident_id">' +
                                '<button type="button" class="priority-list__item" :class="\'priority-list__item--\' + incidentMeta(incident.state).tone" @click="openIncident(incident)">' +
                                    '<span class="priority-list__top">' +
                                        '<span class="priority-list__id">{{ incident.incident_id }}</span>' +
                                        '<span class="priority-list__meta">{{ incidentMeta(incident.state).label }} · {{ formatRelative(incident.opened_at) }}</span>' +
                                    '</span>' +
                                    '<strong class="priority-list__title">{{ incident.error_signature || \'Incident sans signature\' }}</strong>' +
                                    '<small class="priority-list__context">{{ flowName(incident.flow_id) }}</small>' +
                                '</button>' +
                            '</li>' +
                        '</ol>' +
                        '<p v-else class="empty-inline">Aucun incident actif.</p>' +
                    '</section>' +
                    '<section class="overview-panel" aria-labelledby="priority-flows-title">' +
                        '<div class="section-heading">' +
                            '<h3 id="priority-flows-title">Santé des flux</h3>' +
                            '<button class="overview-link" type="button" @click="$emit(\'open-view\', \'flows\')">Ouvrir</button>' +
                        '</div>' +
                        '<ul v-if="watchedFlows.length" class="flow-health-list">' +
                            '<li v-for="flow in watchedFlows" :key="flow.flow_id" :class="\'flow-health--\' + healthMeta(flow.status).tone">' +
                                '<strong>{{ flow.name }}</strong>' +
                                '<span class="flow-health-track" aria-hidden="true">' +
                                    '<i v-for="tick in 10" :key="tick" :class="{ \'is-on\': tick <= healthMeta(flow.status).fill }"></i>' +
                                '</span>' +
                                '<span class="flow-health-token">{{ healthMeta(flow.status).token }}</span>' +
                            '</li>' +
                        '</ul>' +
                        '<p v-else class="empty-inline">Aucun flux dans le snapshot courant.</p>' +
                    '</section>' +
                '</div>' +
            '</section>'
    };
}(window));
