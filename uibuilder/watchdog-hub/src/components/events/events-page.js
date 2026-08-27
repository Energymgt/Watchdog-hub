(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.EventsPage = {
        name: 'EventsPage',
        emits: ['refresh', 'retry', 'select-event', 'select-flow'],
        props: {
            state: { type: Object, required: true },
            flows: { type: Array, default: function () { return []; } }
        },
        computed: {
            normalizedQuery: function () {
                return this.state.query.trim().toLocaleLowerCase('fr-FR');
            },
            typeOptions: function () {
                return Array.from(new Set(this.state.events.map(function (event) {
                    return event.event_type;
                }).filter(Boolean))).sort();
            },
            sourceOptions: function () {
                return Array.from(new Set(this.state.events.map(function (event) {
                    return event.source_id;
                }).filter(Boolean))).sort();
            },
            flowOptions: function () {
                return this.flows.slice().sort(function (a, b) {
                    return String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' });
                });
            },
            filteredEvents: function () {
                var self = this;
                return this.state.events.filter(function (event) {
                    var typeOk = self.state.typeFilter === 'all' || event.event_type === self.state.typeFilter;
                    var sourceOk = self.state.sourceFilter === 'all' || event.source_id === self.state.sourceFilter;
                    var flowOk = self.state.flowFilter === 'all' || event.flow_id === self.state.flowFilter;
                    var haystack = [
                        event.event_id, event.event_type, event.source_id, event.flow_id,
                        event.connector_id, event.destination_id, event.status,
                        event.error_signature, event.producer
                    ].join(' ').toLocaleLowerCase('fr-FR');
                    return typeOk && sourceOk && flowOk
                        && (!self.normalizedQuery || haystack.indexOf(self.normalizedQuery) !== -1);
                });
            },
            selectedFlow: function () {
                if (!this.state.selectedEvent) return null;
                return this.flows.filter(function (flow) {
                    return flow.flow_id === this.state.selectedEvent.flow_id;
                })[0] || null;
            },
            formattedPayload: function () {
                return this.formatPayload(this.state.selectedEvent && this.state.selectedEvent.payload);
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
            select: function (event) {
                this.$emit('select-event', event);
            },
            resetFilters: function () {
                this.state.query = '';
                this.state.typeFilter = 'all';
                this.state.sourceFilter = 'all';
                this.state.flowFilter = 'all';
            },
            formatPayload: function (payload) {
                if (payload === null || payload === undefined) return 'Aucun payload disponible';
                try {
                    return JSON.stringify(payload, null, 2);
                } catch (error) {
                    return String(payload);
                }
            }
        },
        template:
            '<div class="events-page">' +
                '<ui-banner v-if="state.lastError" kind="error">{{ state.lastError }}</ui-banner>' +
                '<state-panel v-if="state.loading && !state.snapshot" kind="loading" title="Chargement des événements" message="Lecture du registre Watchdog..." :busy="true"></state-panel>' +
                '<state-panel v-else-if="!state.snapshot" kind="error" title="Événements indisponibles" :message="state.lastError || \'Aucune donnée Events n’a été reçue.\'" action-label="Réessayer" @retry="$emit(\'retry\')"></state-panel>' +
                '<template v-else>' +
                    '<div class="events-hero"><div><p class="eyebrow">Traçabilité opérationnelle</p><h2>Events Workspace</h2><p>{{ state.events.length }} événement{{ state.events.length > 1 ? \'s\' : \'\' }} dans le snapshot courant.</p></div><ui-button variant="secondary" :loading="state.refreshing" @click="$emit(\'refresh\')">Actualiser</ui-button></div>' +
                    '<section class="toolbar events-toolbar" aria-label="Filtres des événements"><div class="toolbar-row"><ui-field label="Recherche" extra-class="filter-search"><template #default="slotProps"><input id="events-search" type="search" :value="state.query" :aria-describedby="slotProps.describedBy" placeholder="ID, type, source, flow..." @input="state.query = $event.target.value"></template></ui-field><ui-field label="Type"><template #default="slotProps"><select :value="state.typeFilter" :aria-describedby="slotProps.describedBy" @change="state.typeFilter = $event.target.value"><option value="all">Tous</option><option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</option></select></template></ui-field><ui-field label="Source"><template #default="slotProps"><select :value="state.sourceFilter" :aria-describedby="slotProps.describedBy" @change="state.sourceFilter = $event.target.value"><option value="all">Toutes</option><option v-for="source in sourceOptions" :key="source" :value="source">{{ source }}</option></select></template></ui-field><ui-field label="Flow"><template #default="slotProps"><select :value="state.flowFilter" :aria-describedby="slotProps.describedBy" @change="state.flowFilter = $event.target.value"><option value="all">Tous</option><option v-for="flow in flowOptions" :key="flow.flow_id" :value="flow.flow_id">{{ flow.name }}</option></select></template></ui-field><div class="toolbar-actions"><ui-button variant="ghost" @click="resetFilters">Réinitialiser</ui-button></div></div></section>' +
                    '<p class="results-summary" aria-live="polite">{{ filteredEvents.length }} événement{{ filteredEvents.length > 1 ? \'s\' : \'\' }} affiché{{ filteredEvents.length > 1 ? \'s\' : \'\' }}.</p>' +
                    '<div class="events-workspace"><section class="events-list-panel" aria-labelledby="events-list-title"><div class="section-heading"><h3 id="events-list-title">Timeline des événements</h3><span class="activity-count">{{ filteredEvents.length }}</span></div><div v-if="filteredEvents.length" class="events-timeline"><button v-for="event in filteredEvents" :key="event.event_id" type="button" class="event-row" :class="{ \'is-selected\': state.selectedEvent && state.selectedEvent.event_id === event.event_id }" @click="select(event)"><time>{{ formatDateTime(event.timestamp) }}</time><strong>{{ event.event_type }}</strong><span>{{ event.source_id || \'Source non disponible\' }}</span><span>{{ flowName(event.flow_id) }}</span><code :title="event.event_id">{{ event.event_id }}</code></button></div><state-panel v-else title="Aucun événement disponible." message="Aucun événement ne correspond aux filtres actuels."></state-panel></section>' +
                        '<aside class="event-detail" :class="{ \'event-detail--empty\': !state.selectedEvent }" aria-labelledby="event-detail-title"><template v-if="state.selectedEvent"><div class="section-heading"><div><p class="eyebrow">Event Detail</p><h3 id="event-detail-title">{{ state.selectedEvent.event_id }}</h3></div><button type="button" class="icon-button" aria-label="Fermer le détail Event" title="Fermer" @click="state.selectedEvent = null">×</button></div><dl class="event-detail__facts"><div><dt>Timestamp</dt><dd>{{ formatDateTime(state.selectedEvent.timestamp) }}</dd></div><div><dt>Type</dt><dd>{{ state.selectedEvent.event_type }}</dd></div><div><dt>Statut</dt><dd>{{ state.selectedEvent.status }}</dd></div><div><dt>Source</dt><dd>{{ state.selectedEvent.source_id || \'Non disponible\' }}</dd></div><div><dt>Flow</dt><dd><button v-if="state.selectedEvent.flow_id" type="button" class="related-link" @click="$emit(\'select-flow\', selectedFlow || { flow_id: state.selectedEvent.flow_id })">{{ flowName(state.selectedEvent.flow_id) }}</button><span v-else>Non disponible</span></dd></div><div><dt>Connecteur</dt><dd>{{ state.selectedEvent.connector_id || \'Non disponible\' }}</dd></div><div><dt>Destination</dt><dd>{{ state.selectedEvent.destination_id || \'Non disponible\' }}</dd></div><div><dt>Producteur</dt><dd>{{ state.selectedEvent.producer || \'Non disponible\' }}</dd></div><div><dt>Signature</dt><dd>{{ state.selectedEvent.error_signature || \'Non disponible\' }}</dd></div></dl><section class="event-detail__payload"><h4>Payload</h4><pre><code>{{ formattedPayload }}</code></pre></section></template><p v-else class="event-detail__empty-message">Sélectionnez un événement pour afficher son détail.</p></aside></div>' +
                '</template>' +
            '</div>'
    };
}(window));
