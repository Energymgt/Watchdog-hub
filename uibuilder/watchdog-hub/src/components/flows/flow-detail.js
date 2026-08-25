(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowDetail = {
        name: 'FlowDetail',
        props: {
            flow: { type: Object, default: null },
            rules: { type: Array, default: function () { return []; } },
            incidents: { type: Array, default: function () { return []; } }
        },
        computed: {
            relatedIncidents: function () {
                var flow = this.flow;
                if (!flow) return [];
                return this.incidents.filter(function (incident) {
                    return incident.flow_id === flow.flow_id;
                });
            },
            relatedRules: function () {
                var flow = this.flow;
                if (!flow) return [];
                return this.rules.filter(function (rule) {
                    return rule.flow_id === flow.flow_id;
                });
            }
        },
        methods: {
            meta: formatters.flowStatusMeta,
            reason: formatters.reasonLabel
        },
        template:
            '<aside v-if="flow" class="flow-detail" aria-labelledby="flow-detail-title">' +
                '<div class="section-heading"><div><p class="eyebrow">Diagnostic du flux</p><h3 id="flow-detail-title">{{ flow.name }}</h3><small class="device-id">{{ flow.flow_id }}</small></div><status-badge :state="meta(flow.status).tone === \'critical\' ? \'dead\' : (meta(flow.status).tone === \'warning\' ? \'cloud_down\' : (meta(flow.status).tone === \'ok\' ? \'ok\' : \'unknown\'))" :label="meta(flow.status).label"></status-badge></div>' +
                '<section class="flow-detail__section"><h4>État</h4><p>{{ meta(flow.status).label }}</p><h4>Diagnostic</h4><p>{{ reason(flow.status_reason) }}</p></section>' +
                '<section class="flow-detail__section"><h4>Chaîne supervisée</h4><ol class="flow-pipeline"><li>{{ flow.source_id || \'Source non disponible\' }}</li><li>{{ flow.connector_id || \'Connecteur non disponible\' }}</li><li>{{ flow.destination_id || \'Destination non disponible\' }}</li></ol></section>' +
                '<section class="flow-detail__section"><h4>Dernier événement</h4><p>{{ flow.last_event_id || \'Aucun\' }}</p></section>' +
                '<section class="flow-detail__section"><h4>Règles de santé</h4><ul v-if="relatedRules.length"><li v-for="rule in relatedRules" :key="rule.clause_id || rule.id">{{ rule.clause_id || rule.id || \'Règle projetée\' }}</li></ul><p v-else class="empty-inline">Aucune règle projetée pour ce flux.</p></section>' +
                '<section class="flow-detail__section"><h4>Incidents liés</h4><p class="flow-detail__count">{{ relatedIncidents.length }}</p><ul v-if="relatedIncidents.length"><li v-for="incident in relatedIncidents" :key="incident.incident_id"><strong>{{ incident.incident_id }}</strong> - {{ incident.state }}</li></ul><p v-else class="empty-inline">Aucun incident lié dans le snapshot courant.</p></section>' +
            '</aside>'
    };
}(window));
