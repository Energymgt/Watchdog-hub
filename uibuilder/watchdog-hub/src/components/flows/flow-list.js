(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowList = {
        name: 'FlowList',
        props: {
            flows: { type: Array, default: function () { return []; } },
            refreshing: { type: Boolean, default: false }
        },
        methods: {
            meta: formatters.flowStatusMeta,
            reason: formatters.reasonLabel
        },
        template:
            '<section class="flows-section" aria-labelledby="flows-list-title" :aria-busy="refreshing ? \'true\' : \'false\'">' +
                '<div class="section-heading"><h2 id="flows-list-title">Flux supervisés</h2><span class="activity-count">{{ flows.length }}</span></div>' +
                '<div v-if="flows.length" class="table-wrap">' +
                    '<table class="flows-table"><caption class="sr-only">État des flux supervisés</caption>' +
                        '<thead><tr><th scope="col">Flux</th><th scope="col">Source</th><th scope="col">Connecteur</th><th scope="col">Destination</th><th scope="col">État</th><th scope="col">Diagnostic</th></tr></thead>' +
                        '<tbody><tr v-for="flow in flows" :key="flow.flow_id">' +
                            '<td><span class="device-name">{{ flow.name }}</span><span class="device-id">{{ flow.flow_id }}</span></td>' +
                            '<td>{{ flow.source_id || \'Non disponible\' }}</td>' +
                            '<td>{{ flow.connector_id || \'Non disponible\' }}</td>' +
                            '<td>{{ flow.destination_id || \'Non disponible\' }}</td>' +
                            '<td><span class="status-badge" :class="\'status-badge--\' + meta(flow.status).tone">{{ meta(flow.status).label }}</span></td>' +
                            '<td>{{ reason(flow.status_reason) }}</td>' +
                        '</tr></tbody>' +
                    '</table>' +
                '</div>' +
                '<state-panel v-else title="Aucun flux" message="Aucun contrat de flux ne correspond aux filtres actuels."></state-panel>' +
            '</section>'
    };
}(window));
