(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;
    var common = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.IncidentList = {
        name: 'IncidentList',
        emits: ['select'],
        props: {
            incidents: { type: Array, default: function () { return []; } },
            refreshing: { type: Boolean, default: false }
        },
        computed: {
            groups: function () {
                var self = this;
                var order = ['EN_CORRECTION', 'EN_ANALYSE', 'OUVERT', 'DETECTE', 'EN_VALIDATION', 'RESOLU', 'CLOS'];
                return order.map(function (state) {
                    var incidents = self.incidents.filter(function (incident) { return incident.state === state; })
                        .slice().sort(function (a, b) {
                            return (new Date(b.opened_at).getTime() || 0)
                                - (new Date(a.opened_at).getTime() || 0)
                                || String(a.incident_id).localeCompare(String(b.incident_id), 'fr');
                        });
                    return { state: state, incidents: incidents };
                }).filter(function (group) { return group.incidents.length; });
            }
        },
        methods: {
            meta: formatters.incidentStateMeta,
            formatDateTime: common.formatDateTime,
            open: function (incident, event) {
                this.$emit('select', incident, event.currentTarget);
            }
        },
        template:
            '<section class="flows-section" aria-labelledby="incidents-list-title" :aria-busy="refreshing ? \'true\' : \'false\'">' +
                '<div class="section-heading"><h2 id="incidents-list-title">Incidents</h2><span class="activity-count">{{ incidents.length }} résultat{{ incidents.length > 1 ? \'s\' : \'\' }}</span></div>' +
                '<div v-if="incidents.length" class="incident-workbench">' +
                    '<section v-for="group in groups" :key="group.state" class="incident-group" :aria-label="meta(group.state).label">' +
                        '<h3>{{ meta(group.state).label }} <span>{{ group.incidents.length }}</span></h3>' +
                        '<ol><li v-for="incident in group.incidents" :key="incident.incident_id">' +
                            '<button type="button" class="incident-row" :aria-label="\'Ouvrir l’incident \' + incident.incident_id" @click="open(incident, $event)">' +
                                '<span class="incident-row__identity"><strong>{{ incident.incident_id }}</strong><small>{{ incident.flow_id }}</small></span>' +
                                '<span class="incident-row__signature">{{ incident.error_signature || \'Signature non disponible\' }}</span>' +
                                '<span class="incident-row__meta"><span class="status-badge" :class="\'status-badge--\' + meta(incident.state).tone">{{ meta(incident.state).label }}</span><small>{{ formatDateTime(incident.opened_at) }}</small></span>' +
                            '</button>' +
                        '</li></ol>' +
                    '</section>' +
                '</div>' +
                '<state-panel v-else title="Aucun incident" message="Aucun incident ne correspond aux filtres actuels."></state-panel>' +
            '</section>'
    };
}(window));
