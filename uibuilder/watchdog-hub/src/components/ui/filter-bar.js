(function (global) {
    'use strict';

    var QUERY_DEBOUNCE_MS = 150;

    /**
     * Barre de recherche / filtres / tri. Émet uniquement des valeurs d’UI ;
     * le filtrage reste dans le store / la racine.
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FilterBar = {
        name: 'FilterBar',
        emits: ['update:query', 'update:status', 'update:source', 'update:sort', 'refresh', 'reset'],
        props: {
            query: { type: String, default: '' },
            status: { type: String, default: 'all' },
            source: { type: String, default: 'all' },
            sort: { type: String, default: 'severity' },
            refreshing: { type: Boolean, default: false },
            resultsId: { type: String, default: 'fleet-device-results' }
        },
        data: function () {
            return {
                localQuery: this.query,
                debounceId: 0
            };
        },
        watch: {
            query: function (value) {
                global.clearTimeout(this.debounceId);
                if (value !== this.localQuery) this.localQuery = value;
            }
        },
        beforeUnmount: function () {
            global.clearTimeout(this.debounceId);
        },
        methods: {
            emitQuery: function (value) {
                this.$emit('update:query', value);
            },
            flushQuery: function () {
                global.clearTimeout(this.debounceId);
                if (this.localQuery !== this.query) this.emitQuery(this.localQuery);
            },
            onQueryInput: function (event) {
                var value = event.target.value;
                this.localQuery = value;
                global.clearTimeout(this.debounceId);
                if (!value) {
                    this.emitQuery(value);
                    return;
                }
                var self = this;
                this.debounceId = global.setTimeout(function () {
                    self.emitQuery(value);
                }, QUERY_DEBOUNCE_MS);
            },
            onRefresh: function () {
                this.flushQuery();
                this.$emit('refresh');
            },
            onReset: function () {
                global.clearTimeout(this.debounceId);
                this.localQuery = '';
                this.$emit('reset');
            }
        },
        template:
            '<section class="toolbar" aria-label="Recherche, filtres et tri">' +
                '<div class="toolbar-row">' +
                    '<ui-field label="Rechercher" extra-class="search-field" v-slot="field">' +
                        '<input type="search" :value="localQuery" placeholder="Nom, UUID ou détail" autocomplete="off" spellcheck="false" enterkeyhint="search" :aria-controls="resultsId" :aria-describedby="field.describedBy" :aria-invalid="field.invalid ? \'true\' : \'false\'" @input="onQueryInput">' +
                    '</ui-field>' +
                    '<ui-field label="Source en défaut" extra-class="select-field">' +
                        '<select :value="source" @change="$emit(\'update:source\', $event.target.value)">' +
                            '<option value="all">Toutes les sources</option>' +
                            '<option value="balena">Balena</option>' +
                            '<option value="heartbeat">Heartbeat</option>' +
                            '<option value="bacnet">Service terrain</option>' +
                            '<option value="buffer">Buffer</option>' +
                        '</select>' +
                    '</ui-field>' +
                    '<ui-field label="État" extra-class="select-field">' +
                        '<select :value="status" @change="$emit(\'update:status\', $event.target.value)">' +
                            '<option value="all">Tous les états</option>' +
                            '<option value="ok">Opérationnel</option>' +
                            '<option value="cloud_down">Cloud indisponible</option>' +
                            '<option value="unknown_online">Absent de Balena</option>' +
                            '<option value="heartbeat_missing">Heartbeat absent</option>' +
                            '<option value="dead">Hors service</option>' +
                            '<option value="unknown">Inconnu</option>' +
                        '</select>' +
                    '</ui-field>' +
                    '<ui-field label="Trier par" extra-class="select-field">' +
                        '<select :value="sort" @change="$emit(\'update:sort\', $event.target.value)">' +
                            '<option value="severity">Criticité</option>' +
                            '<option value="name">Nom</option>' +
                            '<option value="connectivity">Dernière connexion</option>' +
                        '</select>' +
                    '</ui-field>' +
                    '<div class="toolbar-actions">' +
                        '<ui-button variant="secondary" @click="onReset">Réinitialiser</ui-button>' +
                        '<ui-button :loading="refreshing" @click="onRefresh">{{ refreshing ? \'Actualisation…\' : \'Actualiser\' }}</ui-button>' +
                    '</div>' +
                '</div>' +
            '</section>'
    };
}(window));
