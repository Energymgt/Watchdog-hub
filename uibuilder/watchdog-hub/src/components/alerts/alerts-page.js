(function (global) {
    'use strict';

    var common = global.WatchdogHub.formatters;

    var STATUS = {
        open: { label: 'Ouverte', tone: 'high' },
        acknowledged: { label: 'Acquittée', tone: 'warning' },
        closed: { label: 'Close', tone: 'closed' }
    };
    var SEVERITY = {
        critical: { label: 'Critique', tone: 'critical' },
        high: { label: 'Haute', tone: 'high' }
    };
    var DELIVERY = {
        pending: 'En attente',
        sending: 'Envoi en cours',
        sent: 'Envoyée',
        failed: 'Échec',
        unknown: 'Résultat incertain'
    };
    var EVENT = {
        trigger: 'Déclenchement',
        aggravation: 'Aggravation',
        recovery: 'Récupération',
        acknowledge: 'Accusé de réception',
        state_change: 'Changement d’état'
    };

    function meta(map, key) {
        return map[key] || { label: key || 'Inconnu', tone: 'unknown' };
    }

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.AlertsPage = {
        name: 'AlertsPage',
        emits: ['refresh', 'retry', 'select', 'acknowledge', 'open-incident', 'open-device'],
        props: {
            state: { type: Object, required: true },
            detail: { type: Object, default: null },
            opener: { type: Object, default: null }
        },
        computed: {
            rows: function () {
                var filter = this.state.statusFilter || 'active';
                return (this.state.alerts || []).filter(function (alert) {
                    if (filter === 'active') return alert.status !== 'closed';
                    if (filter === 'all') return true;
                    return alert.status === filter;
                });
            }
        },
        methods: {
            formatDateTime: common.formatDateTime,
            statusMeta: function (status) { return meta(STATUS, status); },
            severityMeta: function (severity) { return meta(SEVERITY, severity); },
            deliveryLabel: function (status) { return DELIVERY[status] || 'Inconnue'; },
            eventLabel: function (type) { return EVENT[type] || type; },
            originLabel: function (alert) {
                return alert.plan === 'flow' ? 'Flux' : 'Appareil';
            },
            select: function (alert, event) {
                this.$emit('select', alert, event && event.currentTarget);
            },
            acknowledge: function (actor) {
                this.$emit('acknowledge', actor);
            },
            openIncident: function (alert) {
                this.$emit('open-incident', alert);
            },
            openDevice: function (alert) {
                this.$emit('open-device', alert);
            }
        },
        template:
            '<section class="flows-section" aria-labelledby="alerts-list-title" :aria-busy="state.refreshing ? \'true\' : \'false\'">' +
                '<div class="workspace-heading"><p class="eyebrow">Notification</p><h2 id="alerts-list-title">Alertes</h2>' +
                '<p>File de notification des transitions d’appareils confirmées et des incidents détectés. L’accusé n’ouvre pas le dossier.</p></div>' +
                '<div class="section-heading"><span class="activity-count">{{ state.summary.open || 0 }} ouverte{{ (state.summary.open || 0) > 1 ? \'s\' : \'\' }}</span>' +
                '<label class="field-inline">Filtre <select :value="state.statusFilter" @change="state.statusFilter = $event.target.value">' +
                    '<option value="active">Actives</option><option value="open">Ouvertes</option><option value="acknowledged">Acquittées</option><option value="closed">Closes</option>' +
                '</select></label>' +
                '<button type="button" class="button button--secondary" @click="$emit(\'refresh\')">Actualiser</button></div>' +
                '<p v-if="state.lastError" class="ui-banner ui-banner--error" role="alert">{{ state.lastError }} <button type="button" @click="$emit(\'retry\')">Réessayer</button></p>' +
                '<div v-if="rows.length" class="incident-workbench">' +
                    '<ol><li v-for="alert in rows" :key="alert.alert_id">' +
                        '<button type="button" class="incident-row" :aria-label="\'Ouvrir l’alerte \' + alert.alert_id" @click="select(alert, $event)">' +
                            '<span class="incident-row__identity"><strong>{{ alert.subject_name || alert.source_id }}</strong><small>{{ originLabel(alert) }} · {{ alert.flow_id || alert.source_id }}</small></span>' +
                            '<span class="incident-row__signature">{{ alert.detail || \'Détail non disponible\' }}</span>' +
                            '<span class="incident-row__meta">' +
                                '<span class="status-badge" :class="\'status-badge--\' + severityMeta(alert.severity).tone">{{ severityMeta(alert.severity).label }}</span>' +
                                '<span class="status-badge" :class="\'status-badge--\' + statusMeta(alert.status).tone">{{ statusMeta(alert.status).label }}</span>' +
                                '<small>{{ deliveryLabel(alert.latest_delivery && alert.latest_delivery.status) }}</small>' +
                                '<small>{{ formatDateTime(alert.updated_at) }}</small>' +
                            '</span>' +
                        '</button>' +
                    '</li></ol>' +
                '</div>' +
                '<state-panel v-else title="Aucune alerte" message="Aucune alerte ne correspond au filtre actuel."></state-panel>' +
                '<alert-detail v-if="detail" :detail="detail" :opener="opener" :busy="state.mutating" @close="$emit(\'select\', null)" @acknowledge="acknowledge" @open-incident="openIncident" @open-device="openDevice"></alert-detail>' +
            '</section>'
    };

    global.WatchdogHub.components.AlertDetail = {
        name: 'AlertDetail',
        emits: ['close', 'acknowledge', 'open-incident', 'open-device'],
        props: {
            detail: { type: Object, required: true },
            opener: { type: Object, default: null },
            busy: { type: Boolean, default: false }
        },
        data: function () {
            return { actor: '' };
        },
        computed: {
            alert: function () { return this.detail.alert || {}; },
            latest: function () {
                var rows = this.detail.deliveries || [];
                return rows.length ? rows[rows.length - 1] : (this.alert.latest_delivery || null);
            }
        },
        methods: {
            formatDateTime: common.formatDateTime,
            statusMeta: function (status) { return meta(STATUS, status); },
            severityMeta: function (severity) { return meta(SEVERITY, severity); },
            deliveryLabel: function (status) { return DELIVERY[status] || 'Inconnue'; },
            eventLabel: function (type) { return EVENT[type] || type; },
            submitAck: function () {
                if (!this.actor.trim() || this.busy || this.alert.status !== 'open') return;
                this.$emit('acknowledge', this.actor.trim());
            },
            openSource: function () {
                if (this.alert.plan === 'flow') this.$emit('open-incident', this.alert);
                else this.$emit('open-device', this.alert);
            }
        },
        template:
            '<ui-drawer :opener="opener" title-id="alert-detail-title" description-id="alert-detail-description" @close="$emit(\'close\')">' +
                '<div class="modal__header side-drawer__header">' +
                    '<div><p class="eyebrow">Alerte</p><h2 id="alert-detail-title">{{ alert.subject_name || alert.alert_id }}</h2></div>' +
                    '<button data-drawer-initial-focus class="modal__close" type="button" aria-label="Fermer l’alerte" @click="$emit(\'close\')">×</button>' +
                '</div>' +
                '<p id="alert-detail-description">{{ alert.plan === \'flow\' ? \'Incident de flux\' : \'Appareil\' }} · {{ alert.source_id }}</p>' +
                '<p><span class="status-badge" :class="\'status-badge--\' + severityMeta(alert.severity).tone">{{ severityMeta(alert.severity).label }}</span> ' +
                '<span class="status-badge" :class="\'status-badge--\' + statusMeta(alert.status).tone">{{ statusMeta(alert.status).label }}</span></p>' +
                '<dl class="alert-facts">' +
                    '<div><dt>Origine</dt><dd>{{ alert.plan === \'flow\' ? \'Flux\' : \'Appareil\' }}</dd></div>' +
                    '<div><dt>Source</dt><dd><button type="button" class="related-link" @click="openSource">{{ alert.incident_id || alert.source_id }}</button></dd></div>' +
                    '<div><dt>Créée</dt><dd>{{ formatDateTime(alert.opened_at) }}</dd></div>' +
                    '<div><dt>Dernière évolution</dt><dd>{{ formatDateTime(alert.updated_at) }}</dd></div>' +
                    '<div><dt>Livraison Teams</dt><dd>{{ deliveryLabel(latest && latest.status) }}</dd></div>' +
                    '<div><dt>Dernier résultat</dt><dd>{{ latest ? ((latest.http_status || \'sans code\') + (latest.possible_duplicate ? \' · doublon possible\' : \'\')) : \'Aucune tentative\' }}</dd></div>' +
                    '<div><dt>Accusé</dt><dd>{{ alert.acknowledged_by ? (alert.acknowledged_by + \' · \' + formatDateTime(alert.acknowledged_at)) : \'Pas encore accusé\' }}</dd></div>' +
                '</dl>' +
                '<form v-if="alert.status === \'open\'" @submit.prevent="submitAck">' +
                    '<label>Acteur <input v-model="actor" type="text" maxlength="64" autocomplete="name" required></label>' +
                    '<button class="button" type="submit" :disabled="busy">Accuser réception</button>' +
                '</form>' +
                '<h3>Historique</h3>' +
                '<ol class="alert-log"><li v-for="row in detail.history" :key="row.history_id">{{ formatDateTime(row.at) }} · {{ eventLabel(row.event_type) }} · {{ row.actor || \'système\' }}<small v-if="row.reason"> · {{ row.reason }}</small></li></ol>' +
                '<h3>Tentatives Teams</h3>' +
                '<ol class="alert-log"><li v-for="row in detail.deliveries" :key="row.delivery_id">Tentative {{ row.attempt }} · {{ eventLabel(row.event_type) }} · {{ deliveryLabel(row.status) }}<small v-if="row.http_status"> · HTTP {{ row.http_status }}</small><small v-if="row.error_kind"> · {{ row.error_kind }}</small><small v-if="row.possible_duplicate"> · doublon externe possible</small></li></ol>' +
            '</ui-drawer>'
    };
}(window));
