(function (global) {
    'use strict';

    /**
     * Placeholder de chargement. Masqué des lecteurs d’écran via aria-hidden ;
     * l’annonce est portée par le parent (role=status).
     * @property {number} [lines]
     * @property {'text'|'card'|'table'} [variant]
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.UiSkeleton = {
        name: 'UiSkeleton',
        props: {
            lines: { type: Number, default: 3 },
            variant: { type: String, default: 'text' }
        },
        computed: {
            count: function () {
                var value = Number(this.lines);
                if (!Number.isFinite(value)) return 3;
                return Math.max(1, Math.min(8, Math.round(value)));
            }
        },
        template:
            '<div class="ui-skeleton" :class="\'ui-skeleton--\' + variant" aria-hidden="true">' +
                '<span v-for="n in count" :key="n" class="ui-skeleton__line"></span>' +
            '</div>'
    };
}(window));
