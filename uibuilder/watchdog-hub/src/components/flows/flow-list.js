(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowList = {
        name: 'FlowList',
        emits: ['show-incidents', 'select'],
        props: {
            flows: { type: Array, default: function () { return []; } },
            refreshing: { type: Boolean, default: false }
        },
        methods: {
            meta: formatters.flowStatusMeta,
            reason: formatters.reasonLabel,
            statusLabel: function (flow) {
                return flow.status === 'unknown' ? 'UNKNOWN' : this.meta(flow.status).label;
            },
            showIncidents: function (flow) {
                this.$emit('show-incidents', flow);
            },
            select: function (flow) {
                this.$emit('select', flow);
            }
        },
        template:
            '<section class="flows-section" aria-labelledby="flows-list-title" :aria-busy="refreshing ? \'true\' : \'false\'">' +
                '<div class="section-heading"><h2 id="flows-list-title">Flux supervisés</h2><span class="activity-count">{{ flows.length }}</span></div>' +
                '<div v-if="flows.length" class="table-wrap">' +
                    '<table class="flows-table"><caption class="sr-only">État des flux supervisés</caption>' +
                        '<colgroup><col class="flows-table__col--flow"><col class="flows-table__col--source"><col class="flows-table__col--connector"><col class="flows-table__col--destination"><col class="flows-table__col--status"><col class="flows-table__col--diagnostic"><col class="flows-table__col--action"></colgroup>' +
                        '<thead><tr><th scope="col">Flux</th><th scope="col">Source</th><th scope="col">Connecteur</th><th scope="col">Destination</th><th scope="col">État</th><th scope="col">Diagnostic</th><th scope="col">Action</th></tr></thead>' +
                        '<tbody><tr v-for="flow in flows" :key="flow.flow_id">' +
                            '<td><button class="detail-button device-name" type="button" @click="select(flow)">{{ flow.name }}</button><code class="device-id" :title="flow.flow_id">{{ flow.flow_id }}</code></td>' +
                            '<td class="technical-cell" :title="flow.source_id || \'Non disponible\'" :aria-label="\'Source \' + (flow.source_id || \'Non disponible\')"><code>{{ flow.source_id || \'Non disponible\' }}</code></td>' +
                            '<td class="technical-cell" :title="flow.connector_id || \'Non disponible\'" :aria-label="\'Connecteur \' + (flow.connector_id || \'Non disponible\')"><code>{{ flow.connector_id || \'Non disponible\' }}</code></td>' +
                            '<td class="technical-cell" :title="flow.destination_id || \'Non disponible\'" :aria-label="\'Destination \' + (flow.destination_id || \'Non disponible\')"><code>{{ flow.destination_id || \'Non disponible\' }}</code></td>' +
                            '<td><span class="status-badge" :class="\'status-badge--\' + meta(flow.status).tone">{{ statusLabel(flow) }}</span></td>' +
                            '<td class="flow-diagnostic"><strong>{{ reason(flow.status_reason) }}</strong><small v-if="flow.status === \'unknown\'">État non déterminable</small></td>' +
                            '<td><button class="detail-button" type="button" @click="select(flow)">Ouvrir</button></td>' +
                        '</tr></tbody>' +
                    '</table>' +
                '</div>' +
                '<state-panel v-else title="Aucun flux" message="Aucun contrat de flux ne correspond aux filtres actuels."></state-panel>' +
            '</section>'
    };
}(window));
