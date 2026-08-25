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
            }
        },
        template:
            '<section class="kpi-grid" aria-label="Indicateurs de la flotte" :aria-busy="loading ? \'true\' : \'false\'">' +
                '<kpi-card label="Appareils" :value="value([\'total\', \'devices\'])"></kpi-card>' +
                '<kpi-card label="Opérationnels" :value="value([\'ok\', \'healthy\'])" tone="ok"></kpi-card>' +
                '<kpi-card label="Alertes" :value="value([\'alerts\', \'warning\'])" tone="warning"></kpi-card>' +
                '<kpi-card label="Heartbeat absent" :value="value([\'heartbeat_missing\', \'heartbeatMissing\'])" tone="high"></kpi-card>' +
                '<kpi-card label="Hors service" :value="value([\'dead\', \'critical\'])" tone="critical"></kpi-card>' +
            '</section>'
    };
}(window));
