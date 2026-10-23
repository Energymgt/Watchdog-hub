(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.AnomaliesPage = {
        name: 'AnomaliesPage',
        emits: ['refresh', 'retry', 'select-anomaly', 'select-flow', 'select-event', 'select-incident'],
        props: {
            state: { type: Object, required: true },
            flows: { type: Array, default: function () { return []; } },
            events: { type: Array, default: function () { return []; } }
        },
        computed: {
            normalizedQuery: function () {
                return this.state.query.trim().toLocaleLowerCase('fr-FR');
            },
            flowOptions: function () {
                return this.flows.slice().sort(function (a, b) {
                    return String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' });
                });
            },
            clauseOptions: function () {
                return Array.from(new Set(this.state.anomalies.map(function (anomaly) {
                    return anomaly.clause_id;
                }).filter(Boolean))).sort();
            },
            filteredAnomalies: function () {
                var self = this;
                return this.state.anomalies.filter(function (anomaly) {
                    var flowOk = self.state.flowFilter === 'all' || anomaly.flow_id === self.state.flowFilter;
                    var clauseOk = self.state.clauseFilter === 'all' || anomaly.clause_id === self.state.clauseFilter;
                    var statusOk = self.state.statusFilter === 'all' || anomaly.status === self.state.statusFilter;
                    var haystack = [
                        anomaly.anomaly_id,
                        anomaly.flow_id,
                        anomaly.clause_id,
                        anomaly.error_signature
                    ].join(' ').toLocaleLowerCase('fr-FR');
                    return flowOk && clauseOk && statusOk
                        && (!self.normalizedQuery || haystack.indexOf(self.normalizedQuery) !== -1);
                });
            },
            selectedFlow: function () {
                var anomaly = this.state.selectedAnomaly;
                if (!anomaly) return null;
                var flowId = anomaly.flow_id;
                return this.flows.filter(function (flow) {
                    return flow.flow_id === flowId;
                })[0] || null;
            },
            selectedEvent: function () {
                if (!this.state.selectedAnomaly || !this.state.selectedAnomaly.last_event_id) return null;
                var eventId = this.state.selectedAnomaly.last_event_id;
                return this.events.filter(function (event) {
                    return event.event_id === eventId;
                })[0] || null;
            },
            openAnomalies: function () {
                return this.filteredAnomalies.filter(function (anomaly) {
                    return anomaly.status === 'open';
                });
            },
            closedAnomalies: function () {
                return this.filteredAnomalies.filter(function (anomaly) {
                    return anomaly.status === 'closed';
                });
            },
            otherAnomalies: function () {
                return this.filteredAnomalies.filter(function (anomaly) {
                    return anomaly.status !== 'open' && anomaly.status !== 'closed';
                });
            }
        },
        methods: {
            formatDateTime: global.WatchdogHub.formatters.formatDateTime,
            flowName: function (flowId) {
                var flow = this.flows.filter(function (candidate) {
                    return candidate.flow_id === flowId;
                })[0];
                return flow ? flow.name : flowId;
            },
            select: function (anomaly) {
                this.$emit('select-anomaly', anomaly);
            },
            resetFilters: function () {
                this.state.query = '';
                this.state.statusFilter = 'all';
                this.state.flowFilter = 'all';
                this.state.clauseFilter = 'all';
            },
            statusLabel: function (status) {
                if (status === 'open') return 'Ouverte';
                if (status === 'closed') return 'Fermée';
                return 'Inconnu';
            }
        },
        template:
            '<div class="anomalies-page">' +
                '<ui-banner v-if="state.lastError" kind="error">{{ state.lastError }}</ui-banner>' +
                '<state-panel v-if="state.loading && !state.snapshot" kind="loading" title="Chargement des anomalies" message="Lecture du registre Watchdog..." :busy="true"></state-panel>' +
                '<state-panel v-else-if="!state.snapshot" kind="error" title="Anomalies indisponibles" :message="state.lastError || \'Aucune donnée Anomalies n’a été reçue.\'" action-label="Réessayer" @retry="$emit(\'retry\')"></state-panel>' +
                '<template v-else>' +
                    '<div class="anomalies-hero"><div><p class="eyebrow">Problèmes</p><h2>Anomalies</h2><p>{{ openAnomalies.length }} ouverte{{ openAnomalies.length > 1 ? \'s\' : \'\' }}, {{ closedAnomalies.length }} fermée{{ closedAnomalies.length > 1 ? \'s\' : \'\' }}.</p></div><ui-button variant="secondary" :loading="state.refreshing" @click="$emit(\'refresh\')">Actualiser</ui-button></div>' +
                    '<section class="toolbar anomalies-toolbar" aria-label="Filtres des anomalies">' +
                        '<div class="toolbar-row">' +
                            '<ui-field label="Recherche" extra-class="filter-search"><template #default="slotProps"><input id="anomalies-search" type="search" :value="state.query" :aria-describedby="slotProps.describedBy" placeholder="ID, flux, clause, signature..." @input="state.query = $event.target.value"></template></ui-field>' +
                            '<ui-field label="État"><template #default="slotProps"><select :value="state.statusFilter" :aria-describedby="slotProps.describedBy" @change="state.statusFilter = $event.target.value"><option value="all">Tous</option><option value="open">Ouverte</option><option value="closed">Fermée</option></select></template></ui-field>' +
                            '<ui-field label="Flux"><template #default="slotProps"><select :value="state.flowFilter" :aria-describedby="slotProps.describedBy" @change="state.flowFilter = $event.target.value"><option value="all">Tous</option><option v-for="flow in flowOptions" :key="flow.flow_id" :value="flow.flow_id">{{ flow.name }}</option></select></template></ui-field>' +
                            '<ui-field label="Clause"><template #default="slotProps"><select :value="state.clauseFilter" :aria-describedby="slotProps.describedBy" @change="state.clauseFilter = $event.target.value"><option value="all">Toutes</option><option v-for="clause in clauseOptions" :key="clause" :value="clause">{{ clause }}</option></select></template></ui-field>' +
                            '<div class="toolbar-actions"><ui-button variant="ghost" @click="resetFilters">Réinitialiser</ui-button></div>' +
                        '</div>' +
                    '</section>' +
                    '<p class="results-summary" aria-live="polite">{{ filteredAnomalies.length }} anomalie{{ filteredAnomalies.length > 1 ? \'s\' : \'\' }} affichée{{ filteredAnomalies.length > 1 ? \'s\' : \'\' }}.</p>' +
                    '<div class="anomalies-workspace">' +
                        '<section class="anomalies-list-panel" aria-labelledby="anomalies-list-title"><div class="section-heading"><h3 id="anomalies-list-title">Anomalies détectées</h3><span class="activity-count">{{ filteredAnomalies.length }}</span></div><div v-if="filteredAnomalies.length" class="anomaly-groups"><section class="anomaly-group anomaly-group--open" aria-labelledby="anomalies-open-title"><h4 id="anomalies-open-title">Ouvertes <span>{{ openAnomalies.length }}</span></h4><div v-if="openAnomalies.length" class="table-wrap"><table class="anomalies-table"><caption class="sr-only">Anomalies ouvertes</caption><thead><tr><th scope="col">État</th><th scope="col">Anomalie</th><th scope="col">Flux</th><th scope="col">Occurrences</th></tr></thead><tbody><tr v-for="anomaly in openAnomalies" :key="anomaly.anomaly_id" class="anomaly-row anomaly-row--open" :class="{ \'is-selected\': state.selectedAnomaly && state.selectedAnomaly.anomaly_id === anomaly.anomaly_id }"><td><span class="status-badge status-badge--warning">{{ statusLabel(anomaly.status) }}</span></td><td><button type="button" class="detail-button" @click="select(anomaly)"><strong>{{ anomaly.error_signature || \'Signature non disponible\' }}</strong><code :title="anomaly.anomaly_id">{{ anomaly.anomaly_id }}</code></button></td><td :title="flowName(anomaly.flow_id)">{{ flowName(anomaly.flow_id) }}</td><td>{{ anomaly.occurrence_count }}</td></tr></tbody></table></div><p v-else class="empty-inline">Aucune anomalie ouverte dans cette sélection.</p></section><section class="anomaly-group anomaly-group--closed" aria-labelledby="anomalies-closed-title"><h4 id="anomalies-closed-title">Fermées <span>{{ closedAnomalies.length }}</span></h4><div v-if="closedAnomalies.length" class="table-wrap"><table class="anomalies-table"><caption class="sr-only">Anomalies fermées</caption><thead><tr><th scope="col">État</th><th scope="col">Anomalie</th><th scope="col">Flux</th><th scope="col">Occurrences</th></tr></thead><tbody><tr v-for="anomaly in closedAnomalies" :key="anomaly.anomaly_id" class="anomaly-row anomaly-row--closed" :class="{ \'is-selected\': state.selectedAnomaly && state.selectedAnomaly.anomaly_id === anomaly.anomaly_id }"><td><span class="status-badge status-badge--unknown">{{ statusLabel(anomaly.status) }}</span></td><td><button type="button" class="detail-button" @click="select(anomaly)"><strong>{{ anomaly.error_signature || \'Signature non disponible\' }}</strong><code :title="anomaly.anomaly_id">{{ anomaly.anomaly_id }}</code></button></td><td :title="flowName(anomaly.flow_id)">{{ flowName(anomaly.flow_id) }}</td><td>{{ anomaly.occurrence_count }}</td></tr></tbody></table></div><p v-else class="empty-inline">Aucune anomalie fermée dans cette sélection.</p></section><section v-if="otherAnomalies.length" class="anomaly-group" aria-labelledby="anomalies-other-title"><h4 id="anomalies-other-title">État non reconnu <span>{{ otherAnomalies.length }}</span></h4><div class="table-wrap"><table class="anomalies-table"><caption class="sr-only">Anomalies à l’état non reconnu</caption><thead><tr><th scope="col">État</th><th scope="col">Anomalie</th><th scope="col">Flux</th><th scope="col">Occurrences</th></tr></thead><tbody><tr v-for="anomaly in otherAnomalies" :key="anomaly.anomaly_id" :class="{ \'is-selected\': state.selectedAnomaly && state.selectedAnomaly.anomaly_id === anomaly.anomaly_id }"><td><span class="status-badge status-badge--unknown">{{ statusLabel(anomaly.status) }}</span></td><td><button type="button" class="detail-button" @click="select(anomaly)"><strong>{{ anomaly.error_signature || \'Signature non disponible\' }}</strong><code :title="anomaly.anomaly_id">{{ anomaly.anomaly_id }}</code></button></td><td :title="flowName(anomaly.flow_id)">{{ flowName(anomaly.flow_id) }}</td><td>{{ anomaly.occurrence_count }}</td></tr></tbody></table></div></section></div><state-panel v-else-if="!state.anomalies.length" title="Aucune anomalie détectée." message="Le registre ne contient aucune anomalie dans ce snapshot."></state-panel><state-panel v-else title="Aucun résultat" message="Aucune anomalie ne correspond aux filtres actuels." action-label="Réinitialiser" @retry="resetFilters"></state-panel></section>' +
                        '<aside class="anomaly-detail" :class="{ \'anomaly-detail--empty\': !state.selectedAnomaly }" aria-labelledby="anomaly-detail-title"><template v-if="state.selectedAnomaly"><div class="section-heading"><div><p class="eyebrow">Diagnostic de l’anomalie</p><h3 id="anomaly-detail-title">{{ state.selectedAnomaly.anomaly_id }}</h3></div><button type="button" class="icon-button" aria-label="Fermer le diagnostic" title="Fermer" @click="state.selectedAnomaly = null">×</button></div><dl class="anomaly-detail__facts"><div><dt>État</dt><dd><span class="status-badge" :class="\'status-badge--\' + (state.selectedAnomaly.status === \'open\' ? \'warning\' : \'unknown\')">{{ statusLabel(state.selectedAnomaly.status) }}</span></dd></div><div><dt>Flow</dt><dd><button v-if="state.selectedAnomaly.flow_id" type="button" class="related-link" @click="$emit(\'select-flow\', selectedFlow || { flow_id: state.selectedAnomaly.flow_id })">{{ flowName(state.selectedAnomaly.flow_id) }}</button><span v-else>Non disponible</span></dd></div><div><dt>Clause</dt><dd><code>{{ state.selectedAnomaly.clause_id }}</code></dd></div><div><dt>Signature</dt><dd>{{ state.selectedAnomaly.error_signature || \'Non disponible\' }}</dd></div><div><dt>Occurrences</dt><dd>{{ state.selectedAnomaly.occurrence_count }}</dd></div><div><dt>Ouverte</dt><dd>{{ formatDateTime(state.selectedAnomaly.opened_at) }}</dd></div><div><dt>Fermée</dt><dd>{{ state.selectedAnomaly.closed_at ? formatDateTime(state.selectedAnomaly.closed_at) : \'Non disponible\' }}</dd></div><div><dt>Dernier événement</dt><dd><button v-if="selectedEvent" type="button" class="related-link" @click="$emit(\'select-event\', selectedEvent)">{{ state.selectedAnomaly.last_event_id }}</button><code v-else-if="state.selectedAnomaly.last_event_id" class="technical-value">{{ state.selectedAnomaly.last_event_id }}</code><span v-else>Aucun événement disponible</span></dd></div></dl><section class="anomaly-detail__info"><h4>Information</h4><p>Cette anomalie est décrite par sa signature, sa clause et ses occurrences réelles.</p></section></template><p v-else class="anomaly-detail__empty-message">Sélectionnez une anomalie pour afficher son diagnostic.</p></aside>' +
                    '</div>' +
                '</template>' +
            '</div>'
    };
}(window));
