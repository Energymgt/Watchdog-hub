(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.FlowsKpis = {
        name: 'FlowsKpis',
        props: {
            summary: { type: Object, default: function () { return {}; } },
            loading: { type: Boolean, default: false }
        },
        template:
            '<section class="kpi-grid flows-kpi-grid" aria-label="Indicateurs des flux">' +
                '<kpi-card label="Flux supervisés" :value="summary.total || 0" tone="unknown" :loading="loading"></kpi-card>' +
                '<kpi-card label="Opérationnels" :value="summary.ok || 0" tone="ok" :loading="loading"></kpi-card>' +
                '<kpi-card label="Dégradés" :value="summary.degraded || 0" tone="warning" :loading="loading"></kpi-card>' +
                '<kpi-card label="Indisponibles" :value="summary.down || 0" tone="critical" :loading="loading"></kpi-card>' +
                '<kpi-card label="Incidents actifs" :value="summary.incidentsActive || 0" tone="high" :loading="loading"></kpi-card>' +
            '</section>'
    };
}(window));
