(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FleetKpis = {
        name: 'FleetKpis',
        props: {
            summary: { type: Object, default: function () { return {}; } },
            loading: { type: Boolean, default: false }
        },
        methods: {
            value: function (keys) {
                for (var i = 0; i < keys.length; i += 1) {
                    if (this.summary[keys[i]] !== undefined) return this.summary[keys[i]];
                }
                return 0;
            },
            selectStatus: function (status) {
                this.$emit('filter-status', status);
            }
        },
        emits: ['filter-status'],
        template:
            '<section class="kpi-grid" aria-label="Indicateurs de la flotte" :aria-busy="loading ? \'true\' : \'false\'">' +
                '<button type="button" class="fleet-kpi-button" @click="selectStatus(\'all\')"><div class="kpi-card"><p class="kpi-card__label">Appareils</p><p class="kpi-card__value">{{ value([\'total\', \'devices\']) }}</p></div></button>' +
                '<button type="button" class="fleet-kpi-button" @click="selectStatus(\'ok\')"><div class="kpi-card kpi-card--ok"><p class="kpi-card__label">Opérationnels</p><p class="kpi-card__value">{{ value([\'ok\', \'healthy\']) }}</p></div></button>' +
                '<div class="fleet-kpi-static"><div class="kpi-card kpi-card--warning"><p class="kpi-card__label">Alertes</p><p class="kpi-card__value">{{ value([\'alerts\', \'warning\']) }}</p></div></div>' +
                '<button type="button" class="fleet-kpi-button" @click="selectStatus(\'heartbeat_missing\')"><div class="kpi-card kpi-card--high"><p class="kpi-card__label">Heartbeat absent</p><p class="kpi-card__value">{{ value([\'heartbeat_missing\', \'heartbeatMissing\']) }}</p></div></button>' +
                '<button type="button" class="fleet-kpi-button" @click="selectStatus(\'dead\')"><div class="kpi-card kpi-card--critical"><p class="kpi-card__label">Hors service</p><p class="kpi-card__value">{{ value([\'dead\', \'critical\']) }}</p></div></button>' +
            '</section>'
    };
}(window));
