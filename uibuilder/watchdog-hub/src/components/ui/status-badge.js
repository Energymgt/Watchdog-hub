(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    /**
     * Pastille d’état. Si `label` est un nom de source (Balena, MQTT…),
     * l’état métier est annoncé en sr-only pour ne pas dépendre de la couleur.
     * @property {string} [state]
     * @property {string} [label]
     * @property {boolean} [announceState] - Annonce l’état métier en sr-only (ex. source Balena).
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.StatusBadge = {
        name: 'StatusBadge',
        props: {
            state: { type: String, default: 'unknown' },
            label: { type: String, default: '' },
            announceState: { type: Boolean, default: false }
        },
        computed: {
            meta: function () {
                return formatters.stateMeta(this.state);
            },
            displayLabel: function () {
                return this.label || this.meta.label;
            },
            shouldAnnounceState: function () {
                return this.announceState && this.displayLabel !== this.meta.label;
            }
        },
        template:
            '<span class="status-badge" :class="\'status-badge--\' + meta.tone" :title="meta.label">' +
                '{{ displayLabel }}' +
                '<span v-if="shouldAnnounceState" class="sr-only"> — {{ meta.label }}</span>' +
            '</span>'
    };
}(window));
