(function (global) {
    'use strict';

    var numberFormat = new Intl.NumberFormat('fr-FR');

    /**
     * Indicateur chiffré. Le ton est décoratif ; le libellé + la valeur restent lisibles.
     * @property {string} label
     * @property {number|string} [value]
     * @property {string} [tone]
     * @property {boolean} [loading]
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.KpiCard = {
        name: 'KpiCard',
        props: {
            label: { type: String, required: true },
            value: { type: [Number, String], default: 0 },
            tone: { type: String, default: 'unknown' },
            loading: { type: Boolean, default: false }
        },
        computed: {
            displayValue: function () {
                if (this.loading) return '…';
                if (typeof this.value === 'number' && Number.isFinite(this.value)) {
                    return numberFormat.format(this.value);
                }
                if (this.value === null || this.value === undefined || this.value === '') return '—';
                return String(this.value);
            }
        },
        template:
            '<article class="kpi-card" :class="\'kpi-card--\' + tone" :aria-busy="loading ? \'true\' : \'false\'">' +
                '<p class="kpi-card__label">{{ label }}</p>' +
                '<p class="kpi-card__value">' +
                    '<span v-if="loading" class="ui-skeleton__line kpi-card__skeleton" aria-hidden="true"></span>' +
                    '<span :class="{ \'sr-only\': loading }">{{ displayValue }}</span>' +
                '</p>' +
            '</article>'
    };
}(window));
