(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FleetActivity = {
        name: 'FleetActivity',
        props: {
            transitions: { type: Array, default: function () { return []; } },
            pending: { type: Array, default: function () { return []; } },
            now: { type: Number, default: Date.now }
        },
        data: function () {
            return { expanded: false };
        },
        computed: {
            visibleTransitions: function () {
                return this.expanded ? this.transitions : this.transitions.slice(0, 8);
            }
        },
        methods: {
            formatDateTime: formatters.formatDateTime,
            formatRelative: function (value) {
                return formatters.formatRelative(value, this.now);
            },
            stateLabel: function (value) {
                return formatters.stateMeta(value).label;
            }
        },
        template:
            '<section class="activity-panel" aria-labelledby="fleet-activity-title">' +
                '<div class="section-heading">' +
                    '<div><p class="eyebrow">Événements et validation</p><h2 id="fleet-activity-title">Activité flotte</h2></div>' +
                    '<span class="activity-count">{{ transitions.length }} transition{{ transitions.length > 1 ? \'s\' : \'\' }}</span>' +
                '</div>' +
                '<div v-if="pending.length" class="pending-panel" role="status">' +
                    '<h3>En attente de confirmation</h3>' +
                    '<ul>' +
                        '<li v-for="item in pending" :key="item.uuid">' +
                            '<strong>{{ item.name }}</strong> — {{ stateLabel(item.observedState) }} ' +
                            '({{ item.count }}/{{ item.required }})' +
                            '<span v-if="item.firstSeenGraceActive"> — grâce nouvel appareil jusqu’à {{ formatDateTime(item.firstSeenGraceUntil) }}</span>' +
                        '</li>' +
                    '</ul>' +
                '</div>' +
                '<ol v-if="visibleTransitions.length" class="activity-list">' +
                    '<li v-for="transition in visibleTransitions" :key="transition.at + transition.uuid + transition.to">' +
                        '<time :datetime="new Date(transition.at).toISOString()" :title="formatDateTime(transition.at)">{{ formatRelative(transition.at) }}</time>' +
                        '<div><strong>{{ transition.name || transition.uuid }}</strong><span>{{ stateLabel(transition.from) }} → {{ stateLabel(transition.to) }}</span><small>{{ transition.detail }}</small></div>' +
                    '</li>' +
                '</ol>' +
                '<p v-else class="empty-inline">Aucune transition enregistrée.</p>' +
                '<ui-button v-if="transitions.length > 8" variant="secondary" class="activity-toggle" :aria-expanded="expanded" @click="expanded = !expanded">' +
                    '{{ expanded ? \'Réduire\' : \'Afficher les \' + transitions.length + \' transitions\' }}' +
                '</ui-button>' +
            '</section>'
    };
}(window));
