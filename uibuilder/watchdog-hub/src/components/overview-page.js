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
            activity: { type: Array, default: function () { return []; } },
            activityPartial: { type: Boolean, default: false },
            recentTransitions: { type: Array, default: function () { return []; } },
            loading: { type: Boolean, default: false },
            connected: { type: Boolean, default: null },
            stale: { type: Boolean, default: false },
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
            },
            situation: function () {
                if (this.loading) return { label: 'LECTURE EN COURS', tone: 'unknown', detail: 'Les snapshots Overview sont en cours de lecture.' };
                if (this.connected === false) return { label: 'CONNEXION INTERRUPTUE', tone: 'critical', detail: 'Les données affichées proviennent du dernier état reçu.' };
                if (this.stale) return { label: 'DONNÉES ANCIENNES', tone: 'warning', detail: 'Le snapshot flotte dépasse la période de fraîcheur configurée.' };
                if (!Object.prototype.hasOwnProperty.call(this.flowSummary, 'total')) {
                    return { label: 'NON DÉTERMINÉE', tone: 'unknown', detail: 'Aucune donnée opérationnelle disponible.' };
                }
                if ((this.flowSummary.down || 0) > 0) {
                    return { label: 'FLUX INDISPONIBLES', tone: 'critical', detail: 'Au moins un flux est déclaré indisponible.' };
                }
                if ((this.flowSummary.incidentsActive || 0) > 0
                    || (this.flowSummary.degraded || 0) > 0
                    || (this.fleetSummary.alerts || 0) > 0) {
                    return { label: 'SITUATION DÉGRADÉE', tone: 'warning', detail: 'Des incidents, flux dégradés ou alertes flotte sont présents.' };
                }
                if ((this.flowSummary.unknown || 0) > 0) {
                    return { label: 'ÉTAT PARTIEL', tone: 'unknown', detail: 'Certains flux sont dans un état inconnu.' };
                }
                return { label: 'SITUATION NOMINALE', tone: 'ok', detail: 'Aucun incident actif, flux dégradé ou alerte flotte dans les snapshots.' };
            }
        },
        methods: {
            incidentMeta: flowFormatters.incidentStateMeta,
            healthMeta: function (status) {
                return HEALTH_META[status] || HEALTH_META.unknown;
            },
            reasonLabel: flowFormatters.reasonLabel,
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
            },
            openView: function (view, item) {
                this.$emit('open-view', view, item || null);
            },
            openActivity: function (item) {
                if (item && item.navigation) {
                    this.$emit('open-view', item.navigation.view, item);
                }
            }
        },
        template:
            '<section class="overview-page" aria-labelledby="overview-title">' +
                '<div class="overview-hero">' +
                    '<div><p class="eyebrow">Console opérationnelle</p><h2 id="overview-title">Operational Overview</h2><p class="overview-situation" :class="\'overview-situation--\' + situation.tone"><strong>{{ situation.label }}</strong><span>{{ situation.detail }}</span></p></div>' +
                '</div>' +
                '<section class="overview-kpis" aria-label="Résumé opérationnel" :aria-busy="loading ? \'true\' : \'false\'">' +
                    '<button class="overview-kpi" type="button" @click="openView(\'incidents\')"><kpi-card label="Incidents actifs" :value="flowSummary.incidentsActive || 0" :tone="kpiTone(flowSummary.incidentsActive || 0, \'critical\')" :loading="loading"></kpi-card></button>' +
                    '<button class="overview-kpi" type="button" @click="openView(\'flows\')"><kpi-card label="Flux dégradés" :value="affectedFlows" :tone="kpiTone(affectedFlows, \'warning\')" :loading="loading"></kpi-card></button>' +
                    '<button class="overview-kpi" type="button" @click="openView(\'fleet\')"><kpi-card label="Alertes flotte" :value="fleetSummary.alerts || 0" :tone="kpiTone(fleetSummary.alerts || 0, \'high\')" :loading="loading"></kpi-card></button>' +
                    '<button class="overview-kpi" type="button" @click="openView(\'fleet\')"><kpi-card label="Appareils suivis" :value="fleetSummary.total || 0" tone="unknown" :loading="loading"></kpi-card></button>' +
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
                                '<button class="flow-health-item" type="button" @click="openView(\'flows\', flow)"><strong>{{ flow.name }}</strong>' +
                                '<span class="flow-health-track" aria-hidden="true">' +
                                    '<i v-for="tick in 10" :key="tick" :class="{ \'is-on\': tick <= healthMeta(flow.status).fill }"></i>' +
                                '</span>' +
                                '<span class="flow-health-token">{{ healthMeta(flow.status).token }}</span><small v-if="flow.status_reason">{{ reasonLabel(flow.status_reason) }}</small><small v-if="flow.last_event_id">Dernier événement : {{ flow.last_event_id }}</small></button>' +
                            '</li>' +
                        '</ul>' +
                        '<p v-else class="empty-inline">Aucun flux dans le snapshot courant.</p>' +
                    '</section>' +
                '</div>' +
                '<section class="overview-panel overview-activity" aria-labelledby="overview-activity-title">' +
                    '<div class="section-heading"><h3 id="overview-activity-title">Activité récente</h3><button class="overview-link" type="button" @click="openView(\'events\')">Voir toute l’activité</button></div>' +
                    '<p v-if="activityPartial" class="activity-partial">Certaines sources d’activité sont indisponibles.</p>' +
                    '<activity-timeline :items="activity" :now="now" @open="openActivity"></activity-timeline>' +
                '</section>' +
            '</section>'
    };
}(window));
