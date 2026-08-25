(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowsPage = {
        name: 'FlowsPage',
        emits: ['refresh', 'retry', 'select-incident', 'show-incidents', 'select-flow'],
        props: {
            state: { type: Object, required: true },
            now: { type: Number, default: Date.now },
            section: { type: String, default: 'all' },
            selectedFlow: { type: Object, default: null }
        },
        computed: {
            normalizedQuery: function () {
                return this.state.query.trim().toLocaleLowerCase('fr-FR');
            },
            filteredFlows: function () {
                var self = this;
                return this.state.flows.filter(function (flow) {
                    var statusOk = self.state.statusFilter === 'all' || flow.status === self.state.statusFilter;
                    var haystack = [flow.flow_id, flow.name, flow.source_id, flow.connector_id, flow.destination_id]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return statusOk && (!self.normalizedQuery || haystack.indexOf(self.normalizedQuery) !== -1);
                }).slice().sort(function (a, b) {
                    var rank = formatters.flowStatusMeta(b.status).rank - formatters.flowStatusMeta(a.status).rank;
                    return rank || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                });
            },
            filteredIncidents: function () {
                var self = this;
                return this.state.incidents.filter(function (incident) {
                    var stateOk = self.state.incidentStateFilter === 'all'
                        || (self.state.incidentStateFilter === 'active'
                            && incident.state !== 'RESOLU' && incident.state !== 'CLOS')
                        || incident.state === self.state.incidentStateFilter;
                    var haystack = [incident.incident_id, incident.flow_id, incident.error_signature, incident.correlation_key]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return stateOk && (!self.normalizedQuery || haystack.indexOf(self.normalizedQuery) !== -1);
                }).slice().sort(function (a, b) {
                    return (new Date(b.opened_at).getTime() || 0) - (new Date(a.opened_at).getTime() || 0);
                });
            },
            unknownBecauseNoEvents: function () {
                return this.filteredFlows.length > 0
                    && this.filteredFlows.every(function (flow) {
                        return flow.status === 'unknown' && flow.status_reason === 'no_events';
                    });
            }
        },
        methods: {
            formatDateTime: global.WatchdogHub.formatters.formatDateTime,
            resetFilters: function () {
                this.state.query = '';
                this.state.statusFilter = 'all';
                this.state.incidentStateFilter = 'active';
            },
            forwardSelection: function (incident, opener) {
                this.$emit('select-incident', incident, opener);
            }
        },
        template:
            '<div class="flows-page">' +
                '<ui-banner v-if="state.lastError" kind="error">{{ state.lastError }}</ui-banner>' +
                '<ui-banner v-if="state.notice" kind="success">{{ state.notice }}</ui-banner>' +
                '<state-panel v-if="state.loading && !state.snapshot" kind="loading" title="Chargement des flux" message="Lecture du registre Watchdog..." :busy="true"></state-panel>' +
                '<state-panel v-else-if="!state.snapshot" kind="error" title="Flux indisponibles" :message="state.lastError || \'Aucune donnée Flux n’a été reçue.\'" action-label="Réessayer" @retry="$emit(\'retry\')"></state-panel>' +
                '<template v-else>' +
                    '<div class="flows-hero"><div><p class="eyebrow">Registre opérationnel</p><h2>{{ section === \'incidents\' ? \'Incidents\' : (section === \'flows\' ? \'Flux supervisés\' : \'Flux et incidents\') }}</h2><p>État calculé par les contrats de santé Watchdog.</p></div><small>Dernière lecture : {{ formatDateTime(state.snapshot.generatedAt) }}</small></div>' +
                    '<flows-kpis :summary="state.summary" :loading="state.refreshing"></flows-kpis>' +
                    '<flows-filter-bar :query="state.query" :status="state.statusFilter" :incident-state="state.incidentStateFilter" :refreshing="state.refreshing" @update:query="state.query = $event" @update:status="state.statusFilter = $event" @update:incident-state="state.incidentStateFilter = $event" @refresh="$emit(\'refresh\')" @reset="resetFilters"></flows-filter-bar>' +
                    '<p class="results-summary"><template v-if="section !== \'incidents\'">{{ filteredFlows.length }} flux</template><template v-if="section === \'all\'"> et </template><template v-if="section !== \'flows\'">{{ filteredIncidents.length }} incident{{ filteredIncidents.length > 1 ? \'s\' : \'\' }}</template> affiché<span v-if="filteredFlows.length + filteredIncidents.length > 1">s</span>.</p>' +
                    '<ui-banner v-if="section !== \'incidents\' && unknownBecauseNoEvents" kind="info"><strong>État non déterminable.</strong> Aucun événement de santé reçu. Les états opérationnels ne peuvent pas encore être confirmés.</ui-banner>' +
                    '<div v-if="section !== \'incidents\'" class="flow-workspace"><flow-list :flows="filteredFlows" :refreshing="state.refreshing" @show-incidents="$emit(\'show-incidents\', $event)" @select="$emit(\'select-flow\', $event)"></flow-list><flow-detail :flow="selectedFlow" :rules="state.rules" :incidents="state.incidents"></flow-detail></div>' +
                    '<incident-list v-if="section !== \'flows\'" :incidents="filteredIncidents" :refreshing="state.refreshing" @select="forwardSelection"></incident-list>' +
                '</template>' +
            '</div>'
    };
}(window));
