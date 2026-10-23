(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowsPage = {
        name: 'FlowsPage',
        emits: ['refresh', 'retry', 'select-incident', 'select-anomaly', 'select-event', 'show-incidents', 'select-flow'],
        props: {
            state: { type: Object, required: true },
            now: { type: Number, default: Date.now },
            section: { type: String, default: 'all' },
            selectedFlow: { type: Object, default: null },
            anomalies: { type: Array, default: function () { return []; } },
            events: { type: Array, default: function () { return []; } }
        },
        computed: {
            activeQuery: function () {
                var value = this.section === 'incidents' ? this.state.incidentQuery : this.state.flowQuery;
                return value || '';
            },
            filteredFlows: function () {
                var query = String(this.state.flowQuery || '').trim().toLocaleLowerCase('fr-FR');
                var statusFilter = this.state.flowStatusFilter || 'all';
                return this.state.flows.filter(function (flow) {
                    var statusOk = statusFilter === 'all' || flow.status === statusFilter;
                    var haystack = [flow.flow_id, flow.name, flow.source_id, flow.connector_id, flow.destination_id]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return statusOk && (!query || haystack.indexOf(query) !== -1);
                }).slice().sort(function (a, b) {
                    var rank = formatters.flowStatusMeta(b.status).rank - formatters.flowStatusMeta(a.status).rank;
                    return rank || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                });
            },
            filteredIncidents: function () {
                var query = String(this.state.incidentQuery || '').trim().toLocaleLowerCase('fr-FR');
                var incidentStateFilter = this.state.incidentStateFilter || 'active';
                return this.state.incidents.filter(function (incident) {
                    var stateOk = incidentStateFilter === 'all'
                        || (incidentStateFilter === 'active'
                            && incident.state !== 'RESOLU' && incident.state !== 'CLOS')
                        || incident.state === incidentStateFilter;
                    var haystack = [incident.incident_id, incident.flow_id, incident.error_signature, incident.correlation_key]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return stateOk && (!query || haystack.indexOf(query) !== -1);
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
            setQuery: function (value) {
                if (this.section === 'incidents') this.state.incidentQuery = value;
                else this.state.flowQuery = value;
            },
            resetFilters: function () {
                if (this.section === 'incidents') {
                    this.state.incidentQuery = '';
                    this.state.incidentStateFilter = 'active';
                    return;
                }
                this.state.flowQuery = '';
                this.state.flowStatusFilter = 'all';
            },
            forwardSelection: function (incident, opener) {
                this.$emit('select-incident', incident, opener);
            },
            forwardAnomaly: function (anomaly) {
                this.$emit('select-anomaly', anomaly);
            },
            forwardEvent: function (event) {
                this.$emit('select-event', event);
            }
        },
        template:
            '<div class="flows-page">' +
                '<ui-banner v-if="state.lastError" kind="error">{{ state.lastError }}</ui-banner>' +
                '<ui-banner v-if="state.notice" kind="success">{{ state.notice }}</ui-banner>' +
                '<state-panel v-if="state.loading && !state.snapshot" kind="loading" title="Chargement des flux" message="Lecture du registre Watchdog..." :busy="true"></state-panel>' +
                '<state-panel v-else-if="!state.snapshot" kind="error" title="Flux indisponibles" :message="state.lastError || \'Aucune donnée Flux n’a été reçue.\'" action-label="Réessayer" @retry="$emit(\'retry\')"></state-panel>' +
                '<template v-else>' +
                    '<div class="flows-hero"><div><p class="eyebrow">Supervision</p><h2>{{ section === \'incidents\' ? \'Incidents\' : \'Flux métier\' }}</h2><p>{{ section === \'incidents\' ? \'État actuel, dernière action et transition autorisée dans le détail.\' : \'Nom, état calculé, justification et problèmes associés. La chaîne source et destination reste dans le détail.\' }}</p></div><small>Dernière lecture : {{ formatDateTime(state.snapshot.generatedAt) }}</small></div>' +
                    '<flows-filter-bar :section="section" :query="activeQuery" :status="state.flowStatusFilter" :incident-state="state.incidentStateFilter" :refreshing="state.refreshing" @update:query="setQuery" @update:status="state.flowStatusFilter = $event" @update:incident-state="state.incidentStateFilter = $event" @refresh="$emit(\'refresh\')" @reset="resetFilters"></flows-filter-bar>' +
                    '<p class="results-summary"><template v-if="section !== \'incidents\'">{{ filteredFlows.length }} flux</template><template v-if="section === \'all\'"> et </template><template v-if="section !== \'flows\'">{{ filteredIncidents.length }} incident{{ filteredIncidents.length > 1 ? \'s\' : \'\' }}</template> affiché<span v-if="filteredFlows.length + filteredIncidents.length > 1">s</span>.</p>' +
                    '<ui-banner v-if="section !== \'incidents\' && unknownBecauseNoEvents" kind="info"><strong>État non déterminable.</strong> Aucun événement de santé reçu. Les états opérationnels ne peuvent pas encore être confirmés.</ui-banner>' +
                    '<div v-if="section !== \'incidents\'" class="flow-workspace"><flow-list :flows="filteredFlows" :incidents="state.incidents" :anomalies="anomalies" :refreshing="state.refreshing" @show-incidents="$emit(\'show-incidents\', $event)" @select="$emit(\'select-flow\', $event)"></flow-list><flow-detail :flow="selectedFlow" :rules="state.rules" :incidents="state.incidents" :anomalies="anomalies" :events="events" @select-incident="forwardSelection" @select-anomaly="forwardAnomaly" @select-event="forwardEvent"></flow-detail></div>' +
                    '<incident-list v-if="section !== \'flows\'" :incidents="filteredIncidents" :refreshing="state.refreshing" @select="forwardSelection"></incident-list>' +
                '</template>' +
            '</div>'
    };
}(window));
