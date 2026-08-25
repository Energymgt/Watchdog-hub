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
        methods: {
            meta: formatters.incidentStateMeta,
            formatDateTime: common.formatDateTime,
            open: function (incident, event) {
                this.$emit('select', incident, event.currentTarget);
            }
        },
        template:
            '<section class="flows-section" aria-labelledby="incidents-list-title" :aria-busy="refreshing ? \'true\' : \'false\'">' +
                '<div class="section-heading"><h2 id="incidents-list-title">Incidents</h2><span class="activity-count">{{ incidents.length }}</span></div>' +
                '<div v-if="incidents.length" class="table-wrap">' +
                    '<table class="incidents-table"><caption class="sr-only">Incidents corrélés par Watchdog</caption>' +
                        '<thead><tr><th scope="col">Flux</th><th scope="col">État</th><th scope="col">Signature</th><th scope="col">Ouvert le</th><th scope="col">Action</th></tr></thead>' +
                        '<tbody><tr v-for="incident in incidents" :key="incident.incident_id">' +
                            '<td><span class="device-name">{{ incident.flow_id }}</span><span class="device-id">{{ incident.incident_id }}</span></td>' +
                            '<td><span class="status-badge" :class="\'status-badge--\' + meta(incident.state).tone">{{ meta(incident.state).label }}</span></td>' +
                            '<td class="incident-signature">{{ incident.error_signature || \'Non disponible\' }}</td>' +
                            '<td>{{ formatDateTime(incident.opened_at) }}</td>' +
                            '<td><button class="detail-button" type="button" :aria-label="\'Gérer l’incident \' + incident.incident_id" @click="open(incident, $event)">Gérer</button></td>' +
                        '</tr></tbody>' +
                    '</table>' +
                '</div>' +
                '<state-panel v-else title="Aucun incident" message="Aucun incident ne correspond aux filtres actuels."></state-panel>' +
            '</section>'
    };
}(window));
