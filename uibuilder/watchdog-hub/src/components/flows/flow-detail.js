(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowDetail = {
        name: 'FlowDetail',
        emits: ['select-incident', 'select-anomaly', 'select-event', 'close'],
        props: {
            flow: { type: Object, default: null },
            rules: { type: Array, default: function () { return []; } },
            incidents: { type: Array, default: function () { return []; } },
            anomalies: { type: Array, default: function () { return []; } },
            events: { type: Array, default: function () { return []; } }
        },
        computed: {
            relatedIncidents: function () {
                var flow = this.flow;
                if (!flow) return [];
                return this.incidents.filter(function (incident) {
                    return incident.flow_id === flow.flow_id;
                });
            },
            relatedAnomalies: function () {
                var flow = this.flow;
                return flow ? this.anomalies.filter(function (anomaly) {
                    return anomaly.flow_id === flow.flow_id;
                }) : [];
            },
            relatedEvents: function () {
                var flow = this.flow;
                return flow ? this.events.filter(function (event) {
                    return event.flow_id === flow.flow_id;
                }) : [];
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
            reason: formatters.reasonLabel,
            badgeState: function (status) {
                if (status === 'down') return 'dead';
                if (status === 'degraded') return 'cloud_down';
                if (status === 'ok') return 'ok';
                return 'unknown';
            },
            why: function (flow) {
                if (!flow) return 'Sélectionnez un flux pour afficher son diagnostic.';
                if (flow.status === 'unknown' && flow.status_reason === 'no_events') {
                    return 'Aucun événement de santé reçu. État opérationnel non déterminable.';
                }
                if (flow.status === 'ok') return 'État opérationnel confirmé.';
                return this.reason(flow.status_reason);
            },
            selectIncident: function (incident, event) {
                this.$emit('select-incident', incident, event.currentTarget);
            },
            selectAnomaly: function (anomaly) {
                this.$emit('select-anomaly', anomaly);
            },
            selectEvent: function (event) {
                this.$emit('select-event', event);
            }
        },
        template:
            '<aside class="flow-detail side-drawer" :class="{ \'flow-detail--empty\': !flow }" aria-labelledby="flow-detail-title">' +
                '<template v-if="flow">' +
                    '<div class="section-heading side-drawer__header"><div><p class="eyebrow">Diagnostic du flux</p><h3 id="flow-detail-title">{{ flow.name }}</h3><small class="device-id">{{ flow.flow_id }}</small></div><div class="flex-row-gap"><status-badge :state="badgeState(flow.status)" :label="meta(flow.status).label"></status-badge><button type="button" class="modal__close" aria-label="Fermer le diagnostic du flux" @click="$emit(\'close\')">×</button></div></div>' +
                    '<section class="flow-detail__section inspector-section"><h4>Pourquoi ?</h4><p>{{ why(flow) }}</p></section>' +
                    '<section class="flow-detail__section inspector-section"><h4>Chaîne supervisée</h4><ol class="flow-pipeline pipeline-diagram"><li class="pipeline-node"><span class="pipeline-node__role">Source</span><strong class="pipeline-node__id">{{ flow.source_id || \'Non disponible\' }}</strong></li><li class="pipeline-node"><span class="pipeline-node__role">Connecteur</span><strong class="pipeline-node__id">{{ flow.connector_id || \'Non disponible\' }}</strong></li><li class="pipeline-node"><span class="pipeline-node__role">Destination</span><strong class="pipeline-node__id">{{ flow.destination_id || \'Non disponible\' }}</strong></li></ol></section>' +
                    '<section class="flow-detail__section inspector-section"><h4>Dernier événement</h4><p><code v-if="flow.last_event_id" class="technical-value">{{ flow.last_event_id }}</code><span v-else>Aucun événement disponible</span></p></section>' +
                    '<section class="flow-detail__section inspector-section"><h4>Règles de santé</h4><ul v-if="relatedRules.length"><li v-for="rule in relatedRules" :key="rule.clause_id || rule.id">{{ rule.clause_id || rule.id || \'Règle projetée\' }}</li></ul><p v-else class="empty-inline">Aucune règle projetée pour ce flux.</p></section>' +
                    '<section class="flow-detail__section inspector-section"><h4>Incidents liés</h4><p class="flow-detail__count">{{ relatedIncidents.length }}</p><ul v-if="relatedIncidents.length" class="flow-related-list related-chips"><li v-for="incident in relatedIncidents" :key="incident.incident_id"><button type="button" class="related-link related-chip" @click="selectIncident(incident, $event)"><strong>{{ incident.incident_id }}</strong></button><span>{{ incident.state }}</span></li></ul><p v-else class="empty-inline">Aucun incident lié dans le snapshot courant.</p></section>' +
                    '<section v-if="relatedAnomalies.length" class="flow-detail__section inspector-section"><h4>Anomalies liées</h4><ul class="flow-related-list related-chips"><li v-for="anomaly in relatedAnomalies" :key="anomaly.anomaly_id"><button type="button" class="related-link related-chip" @click="selectAnomaly(anomaly)"><strong>{{ anomaly.anomaly_id }}</strong></button><span>{{ anomaly.status }}</span></li></ul></section>' +
                    '<section v-if="relatedEvents.length" class="flow-detail__section inspector-section"><h4>Événements liés</h4><ul class="flow-related-list related-chips"><li v-for="event in relatedEvents" :key="event.event_id"><button type="button" class="related-link related-chip" @click="selectEvent(event)"><strong>{{ event.event_id }}</strong></button><span>{{ event.event_type }}</span></li></ul></section>' +
                '</template>' +
                '<p v-else class="flow-detail__empty-message">Sélectionnez un flux pour afficher son diagnostic.</p>' +
            '</aside>'
    };
}(window));
