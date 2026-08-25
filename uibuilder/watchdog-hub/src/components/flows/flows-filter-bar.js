(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowsFilterBar = {
        name: 'FlowsFilterBar',
        emits: ['update:query', 'update:status', 'update:incident-state', 'refresh', 'reset'],
        props: {
            query: { type: String, default: '' },
            status: { type: String, default: 'all' },
            incidentState: { type: String, default: 'active' },
            refreshing: { type: Boolean, default: false }
        },
        template:
            '<section class="toolbar flows-toolbar" aria-label="Filtres des flux et incidents">' +
                '<div class="toolbar-row">' +
                    '<ui-field label="Recherche" extra-class="filter-search">' +
                        '<template #default="slotProps"><input id="flows-search" type="search" :value="query" :aria-describedby="slotProps.describedBy" placeholder="Flux, connecteur, signature..." @input="$emit(\'update:query\', $event.target.value)"></template>' +
                    '</ui-field>' +
                    '<ui-field label="État du flux">' +
                        '<template #default="slotProps"><select :value="status" :aria-describedby="slotProps.describedBy" @change="$emit(\'update:status\', $event.target.value)"><option value="all">Tous</option><option value="ok">Opérationnel</option><option value="degraded">Dégradé</option><option value="down">Indisponible</option><option value="unknown">Inconnu</option></select></template>' +
                    '</ui-field>' +
                    '<ui-field label="État des incidents">' +
                        '<template #default="slotProps"><select :value="incidentState" :aria-describedby="slotProps.describedBy" @change="$emit(\'update:incident-state\', $event.target.value)"><option value="active">Actifs</option><option value="all">Tous</option><option value="DETECTE">Détecté</option><option value="OUVERT">Ouvert</option><option value="EN_ANALYSE">En analyse</option><option value="EN_CORRECTION">En correction</option><option value="EN_VALIDATION">En validation</option><option value="RESOLU">Résolu</option><option value="CLOS">Clos</option></select></template>' +
                    '</ui-field>' +
                    '<div class="toolbar-actions"><ui-button variant="secondary" :loading="refreshing" @click="$emit(\'refresh\')">Actualiser</ui-button><ui-button variant="ghost" @click="$emit(\'reset\')">Réinitialiser</ui-button></div>' +
                '</div>' +
            '</section>'
    };
}(window));
