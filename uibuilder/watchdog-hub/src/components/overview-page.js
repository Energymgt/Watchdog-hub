(function (global) {
    'use strict';

    var flowFormatters = global.WatchdogHub.flowsFormatters;
    var formatters = global.WatchdogHub.formatters;

    var FLOW_STATE = {
        ok: { label: 'Opérationnel', tone: 'ok', rank: 3 },
        degraded: { label: 'Dégradé', tone: 'warning', rank: 1 },
        down: { label: 'Indisponible', tone: 'critical', rank: 0 },
        unknown: { label: 'Inconnu', tone: 'unknown', rank: 2 }
    };

    function flowState(status) {
        return FLOW_STATE[status] || FLOW_STATE.unknown;
    }

    function deviceState(device) {
        var meta = formatters.stateMeta(device && device.state);
        var state = device && device.state;
        if (state === 'dead') return { label: meta.label || 'Hors service', tone: 'critical', rank: 0 };
        if (state === 'heartbeat_missing') return { label: meta.label || 'Heartbeat absent', tone: 'high', rank: 1 };
        if (state === 'cloud_down' || state === 'unknown_online') {
            return { label: meta.label || 'Attention', tone: 'warning', rank: 1 };
        }
        if (state === 'ok') return { label: meta.label || 'Opérationnel', tone: 'ok', rank: 3 };
        return { label: meta.label || 'Inconnu', tone: 'unknown', rank: 2 };
    }

    function flowsKnownFrom(summary) {
        return Object.prototype.hasOwnProperty.call(summary || {}, 'total');
    }

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.OverviewPage = {
        name: 'OverviewPage',
        emits: ['open-incident', 'open-device', 'open-view'],
        props: {
            fleetSummary: { type: Object, default: function () { return {}; } },
            flowSummary: { type: Object, default: function () { return {}; } },
            incidents: { type: Array, default: function () { return []; } },
            flows: { type: Array, default: function () { return []; } },
            devices: { type: Array, default: function () { return []; } },
            generatedAt: { type: [String, Number], default: null },
            activity: { type: Array, default: function () { return []; } },
            activityPartial: { type: Boolean, default: false },
            recentTransitions: { type: Array, default: function () { return []; } },
            loading: { type: Boolean, default: false },
            connected: { type: Boolean, default: null },
            stale: { type: Boolean, default: false },
            fleetKnown: { type: Boolean, default: false },
            now: { type: Number, default: Date.now }
        },
        data: function () {
            return {
                query: '',
                scope: 'all'
            };
        },
        computed: {
            flowsKnown: function () {
                return flowsKnownFrom(this.flowSummary);
            },
            initialLoading: function () {
                return this.loading && !this.flowsKnown && !this.fleetKnown;
            },
            activeIncidents: function () {
                return this.incidents.filter(function (incident) {
                    return incident.state !== 'RESOLU' && incident.state !== 'CLOS';
                }).slice().sort(function (a, b) {
                    var rank = flowFormatters.incidentStateMeta(b.state).rank
                        - flowFormatters.incidentStateMeta(a.state).rank;
                    return rank || (new Date(a.opened_at).getTime() || 0)
                        - (new Date(b.opened_at).getTime() || 0);
                });
            },
            watchedCount: function () {
                if (!this.flowsKnown && !this.fleetKnown) return null;
                var count = 0;
                if (this.flowsKnown) count += this.flowSummary.total || 0;
                if (this.fleetKnown) count += this.fleetSummary.total || 0;
                return count;
            },
            failureCount: function () {
                if (!this.flowsKnown && !this.fleetKnown) return null;
                var count = this.flowsKnown ? (this.flowSummary.down || 0) : 0;
                this.devices.forEach(function (device) {
                    if (device.state === 'dead') count += 1;
                });
                return count;
            },
            warningCount: function () {
                if (!this.flowsKnown && !this.fleetKnown) return null;
                var count = this.flowsKnown ? (this.flowSummary.degraded || 0) : 0;
                this.devices.forEach(function (device) {
                    if (device.state === 'heartbeat_missing' || device.state === 'cloud_down' || device.state === 'unknown_online') {
                        count += 1;
                    }
                });
                return count;
            },
            freshnessLabel: function () {
                if (!this.generatedAt) return null;
                return formatters.formatRelative(this.generatedAt, this.now);
            },
            attentionItems: function () {
                var self = this;
                var items = [];
                var incidentFlows = {};
                this.activeIncidents.forEach(function (incident) {
                    incidentFlows[incident.flow_id] = true;
                    var meta = flowFormatters.incidentStateMeta(incident.state);
                    var toneRank = { critical: 0, high: 1, warning: 2, unknown: 3, ok: 4 };
                    items.push({
                        key: 'incident:' + incident.incident_id,
                        kind: 'Incident',
                        name: self.flowName(incident.flow_id),
                        stateLabel: meta.label || incident.state || 'Inconnu',
                        tone: meta.tone || 'unknown',
                        rank: Object.prototype.hasOwnProperty.call(toneRank, meta.tone) ? toneRank[meta.tone] : 1,
                        since: self.formatRelative(incident.opened_at),
                        sinceTitle: 'Ouvert le ' + self.formatDateTime(incident.opened_at),
                        cause: incident.error_signature || 'Cause non précisée',
                        action: 'Ouvrir',
                        actionLabel: 'Ouvrir l’incident ' + incident.incident_id,
                        target: 'incident',
                        incident: incident
                    });
                });
                this.flows.forEach(function (flow) {
                    var state = flowState(flow.status);
                    if (state.tone === 'ok') return;
                    if (incidentFlows[flow.flow_id] && flow.status !== 'unknown') return;
                    items.push(self.flowRow(flow, state));
                });
                this.devices.forEach(function (device) {
                    var state = deviceState(device);
                    if (state.tone === 'ok') return;
                    items.push(self.deviceRow(device, state));
                });
                return items.sort(function (a, b) {
                    return a.rank - b.rank || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                });
            },
            watchedRows: function () {
                var self = this;
                var rows = this.flows.map(function (flow) {
                    return self.flowRow(flow, flowState(flow.status));
                }).concat(this.devices.map(function (device) {
                    return self.deviceRow(device, deviceState(device));
                }));
                return rows.sort(function (a, b) {
                    return a.rank - b.rank || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                });
            },
            visibleRows: function () {
                var scope = this.scope;
                var query = this.query.trim().toLocaleLowerCase('fr-FR');
                return this.watchedRows.filter(function (row) {
                    if (scope === 'attention' && row.tone === 'ok') return false;
                    if (scope === 'flows' && row.kind !== 'Flux') return false;
                    if (scope === 'devices' && row.kind !== 'Appareil') return false;
                    if (!query) return true;
                    return row.haystack.indexOf(query) !== -1;
                });
            },
            situation: function () {
                var summary = this.flowSummary || {};
                var flowsKnown = flowsKnownFrom(summary);
                var down = flowsKnown ? (summary.down || 0) : 0;
                var degraded = flowsKnown ? (summary.degraded || 0) : 0;
                var unknown = flowsKnown ? (summary.unknown || 0) : 0;
                var incidents = flowsKnown ? (summary.incidentsActive || 0) : 0;
                var devices = this.devices || [];
                var hasDeviceRows = devices.length > 0;
                var dead = hasDeviceRows && devices.some(function (device) { return device.state === 'dead'; });
                var warningDevices = 0;
                var unknownDevices = 0;
                if (hasDeviceRows) {
                    devices.forEach(function (device) {
                        if (device.state === 'heartbeat_missing' || device.state === 'cloud_down' || device.state === 'unknown_online') {
                            warningDevices += 1;
                        } else if (device.state !== 'ok' && device.state !== 'dead') {
                            unknownDevices += 1;
                        }
                    });
                }
                var unclassifiedAlerts = !hasDeviceRows && this.fleetKnown && (this.fleetSummary.alerts || 0) > 0;
                var critical = down > 0 || dead;

                if (this.loading && !flowsKnown && !this.fleetKnown) {
                    return { label: 'Lecture en cours', tone: 'unknown', detail: 'Les données de supervision arrivent.' };
                }
                if (this.connected === false) {
                    if (critical) {
                        return {
                            label: 'Incident critique',
                            tone: 'critical',
                            detail: 'Connexion interrompue. Le dernier état reçu contient un incident critique.'
                        };
                    }
                    return {
                        label: 'Connexion interrompue',
                        tone: 'critical',
                        detail: 'La supervision ne reçoit plus les mises à jour. Le dernier état n’est pas une confirmation que tout fonctionne.'
                    };
                }
                if (!flowsKnown && !this.fleetKnown) {
                    return { label: 'État inconnu', tone: 'unknown', detail: 'Aucune donnée de supervision n’a été reçue.' };
                }
                if (critical) {
                    var criticalDetail = down > 0
                        ? 'Au moins un flux est indisponible.'
                        : 'Au moins un appareil est hors service.';
                    if (unknown > 0) criticalDetail += ' Des flux ne sont pas confirmés.';
                    if (this.stale) criticalDetail += ' Les données des appareils sont périmées.';
                    return { label: 'Incident critique', tone: 'critical', detail: criticalDetail };
                }
                if (incidents > 0 || degraded > 0 || warningDevices > 0 || unclassifiedAlerts) {
                    var parts = ['Un flux, un appareil ou un incident demande une action.'];
                    if (unknown > 0) parts.push('Des flux ne sont pas confirmés.');
                    if (unknownDevices > 0) parts.push('Au moins un appareil est dans un état inconnu.');
                    if (!this.fleetKnown) parts.push('L’état des appareils n’a pas été reçu.');
                    if (this.stale) parts.push('Les données des appareils sont périmées.');
                    return {
                        label: 'Des éléments nécessitent votre attention',
                        tone: 'warning',
                        detail: parts.join(' ')
                    };
                }
                if (!flowsKnown || !this.fleetKnown || unknown > 0 || unknownDevices > 0) {
                    var gaps = [];
                    if (!flowsKnown) gaps.push('Les flux n’ont pas été reçus.');
                    if (unknown > 0) gaps.push('Des flux n’ont pas encore d’événement.');
                    if (!this.fleetKnown) gaps.push('L’état des appareils n’a pas été reçu.');
                    if (unknownDevices > 0) gaps.push('Au moins un appareil est dans un état inconnu.');
                    if (this.stale) gaps.push('Les données des appareils sont périmées.');
                    return { label: 'État inconnu', tone: 'unknown', detail: gaps.join(' ') };
                }
                if (this.stale) {
                    return {
                        label: 'Données périmées',
                        tone: 'warning',
                        detail: 'Le dernier état des appareils dépasse la période de fraîcheur.'
                    };
                }
                return {
                    label: 'Tout fonctionne',
                    tone: 'ok',
                    detail: 'Aucun incident, flux dégradé ou alerte appareil dans les données reçues.'
                };
            }
        },
        methods: {
            reasonLabel: flowFormatters.reasonLabel,
            formatDateTime: formatters.formatDateTime,
            formatRelative: function (value) {
                return formatters.formatRelative(value, this.now);
            },
            flowName: function (flowId) {
                var match = this.flows.filter(function (flow) {
                    return flow.flow_id === flowId;
                })[0];
                return match ? match.name : flowId;
            },
            flowSince: function (flow) {
                var incident = this.activeIncidents.filter(function (item) {
                    return item.flow_id === flow.flow_id;
                })[0];
                if (incident && incident.opened_at) {
                    return {
                        label: this.formatRelative(incident.opened_at),
                        title: 'Incident ouvert le ' + this.formatDateTime(incident.opened_at)
                    };
                }
                return {
                    label: 'Non daté',
                    title: 'Aucun horodatage de changement n’est fourni pour ce flux.'
                };
            },
            deviceSince: function (device) {
                var value = device.lastHeartbeat || device.lastConnectivity;
                if (!value) return { label: 'Non disponible', title: 'Aucun heartbeat ni connexion datés.' };
                var source = device.lastHeartbeat ? 'Dernier heartbeat' : 'Dernière connexion';
                return {
                    label: this.formatRelative(value),
                    title: source + ' : ' + this.formatDateTime(value)
                };
            },
            flowRow: function (flow, state) {
                var since = this.flowSince(flow);
                var cause = this.reasonLabel(flow.status_reason);
                return {
                    key: 'flow:' + flow.flow_id,
                    kind: 'Flux',
                    name: flow.name,
                    stateLabel: state.label,
                    tone: state.tone,
                    rank: state.rank,
                    since: since.label,
                    sinceTitle: since.title,
                    cause: cause,
                    action: 'Ouvrir',
                    actionLabel: 'Ouvrir le flux ' + flow.name,
                    target: 'flow',
                    flow: flow,
                    haystack: [flow.name, flow.flow_id, state.label, cause, 'flux'].join(' ').toLocaleLowerCase('fr-FR')
                };
            },
            deviceRow: function (device, state) {
                var since = this.deviceSince(device);
                var cause = device.detail || 'Aucun détail fourni';
                return {
                    key: 'device:' + device.uuid,
                    kind: 'Appareil',
                    name: device.name,
                    stateLabel: state.label,
                    tone: state.tone,
                    rank: state.rank,
                    since: since.label,
                    sinceTitle: since.title,
                    cause: cause,
                    action: 'Ouvrir',
                    actionLabel: 'Ouvrir l’appareil ' + device.name,
                    target: 'device',
                    device: device,
                    haystack: [device.name, device.uuid, state.label, cause, 'appareil'].join(' ').toLocaleLowerCase('fr-FR')
                };
            },
            openItem: function (item) {
                if (item.target === 'incident') this.$emit('open-incident', item.incident);
                else if (item.target === 'device') this.$emit('open-device', item.device);
                else this.$emit('open-view', 'flows', item.flow);
            },
            openActivity: function (item) {
                if (item && item.navigation) this.$emit('open-view', item.navigation.view, item);
            },
            openView: function (view) {
                this.$emit('open-view', view);
            },
            setScope: function (scope) {
                this.scope = scope;
            },
            resetQuery: function () {
                this.query = '';
                this.scope = 'all';
            }
        },
        template:
            '<section class="overview-page" aria-labelledby="overview-title">' +
                '<div class="overview-hero">' +
                    '<div>' +
                        '<p class="eyebrow">Supervision</p>' +
                        '<h2 id="overview-title">Vue d’ensemble</h2>' +
                        '<p class="overview-situation" :class="\'overview-situation--\' + situation.tone">' +
                            '<strong>{{ situation.label }}</strong>' +
                            '<span>{{ situation.detail }}</span>' +
                        '</p>' +
                    '</div>' +
                    '<div class="overview-hero__links">' +
                        '<button class="overview-link" type="button" @click="openView(\'incidents\')">Incidents</button>' +
                        '<button class="overview-link" type="button" @click="openView(\'flows\')">Flux</button>' +
                        '<button class="overview-link" type="button" @click="openView(\'fleet\')">Appareils</button>' +
                    '</div>' +
                '</div>' +
                '<section class="overview-kpis" aria-label="Indicateurs essentiels" :aria-busy="initialLoading ? \'true\' : \'false\'">' +
                    '<div class="overview-kpi"><kpi-card label="Surveillés" :value="watchedCount" tone="unknown" :loading="initialLoading"></kpi-card></div>' +
                    '<div class="overview-kpi"><kpi-card label="En défaut" :value="failureCount" :tone="failureCount > 0 ? \'critical\' : \'unknown\'" :loading="initialLoading"></kpi-card></div>' +
                    '<div class="overview-kpi"><kpi-card label="Avertissements" :value="warningCount" :tone="warningCount > 0 ? \'warning\' : \'unknown\'" :loading="initialLoading"></kpi-card></div>' +
                    '<div class="overview-kpi" :title="formatDateTime(generatedAt)"><kpi-card label="Actualisation" :value="freshnessLabel" tone="unknown" :loading="initialLoading"></kpi-card></div>' +
                '</section>' +
                '<section class="overview-panel" aria-labelledby="priority-title">' +
                    '<div class="section-heading">' +
                        '<h3 id="priority-title">À traiter</h3>' +
                        '<span class="activity-count">{{ attentionItems.length }}</span>' +
                    '</div>' +
                    '<p v-if="initialLoading" class="empty-inline">Lecture des problèmes en cours.</p>' +
                    '<p v-else-if="!attentionItems.length" class="empty-inline">Aucun problème en cours.</p>' +
                    '<ol v-else class="priority-list">' +
                        '<li v-for="item in attentionItems" :key="item.key">' +
                            '<button type="button" class="priority-list__item" :class="\'priority-list__item--\' + item.tone" @click="openItem(item)">' +
                                '<span class="priority-list__top">' +
                                    '<span class="priority-list__id">{{ item.kind }}</span>' +
                                    '<span class="priority-list__meta">{{ item.stateLabel }} · <span :title="item.sinceTitle">{{ item.since }}</span></span>' +
                                '</span>' +
                                '<strong class="priority-list__title">{{ item.name }}</strong>' +
                                '<small class="priority-list__context">{{ item.cause }}</small>' +
                                '<span class="priority-list__action">{{ item.action }}</span>' +
                            '</button>' +
                        '</li>' +
                    '</ol>' +
                '</section>' +
                '<section class="overview-panel" aria-labelledby="watched-title">' +
                    '<div class="section-heading">' +
                        '<h3 id="watched-title">Éléments surveillés</h3>' +
                        '<span class="activity-count">{{ visibleRows.length }}</span>' +
                    '</div>' +
                    '<div class="watch-toolbar">' +
                        '<div class="watch-scopes" role="group" aria-label="Filtrer les éléments">' +
                            '<button type="button" :aria-pressed="scope === \'all\' ? \'true\' : \'false\'" @click="setScope(\'all\')">Tous</button>' +
                            '<button type="button" :aria-pressed="scope === \'attention\' ? \'true\' : \'false\'" @click="setScope(\'attention\')">À traiter</button>' +
                            '<button type="button" :aria-pressed="scope === \'flows\' ? \'true\' : \'false\'" @click="setScope(\'flows\')">Flux</button>' +
                            '<button type="button" :aria-pressed="scope === \'devices\' ? \'true\' : \'false\'" @click="setScope(\'devices\')">Appareils</button>' +
                        '</div>' +
                        '<label class="watch-search" for="overview-search">Recherche' +
                            '<input id="overview-search" type="search" v-model="query" placeholder="Nom, état ou cause">' +
                        '</label>' +
                    '</div>' +
                    '<p class="results-summary">{{ visibleRows.length }} élément{{ visibleRows.length > 1 ? \'s\' : \'\' }} affiché{{ visibleRows.length > 1 ? \'s\' : \'\' }}.</p>' +
                    '<div v-if="visibleRows.length" class="watch-wrap">' +
                        '<table class="watch-table">' +
                            '<caption class="sr-only">Flux et appareils, problèmes en premier</caption>' +
                            '<thead><tr>' +
                                '<th scope="col">Élément</th>' +
                                '<th scope="col">Type</th>' +
                                '<th scope="col">État</th>' +
                                '<th scope="col">Depuis</th>' +
                                '<th scope="col">Cause</th>' +
                                '<th scope="col">Action</th>' +
                            '</tr></thead>' +
                            '<tbody>' +
                                '<tr v-for="row in visibleRows" :key="row.key">' +
                                    '<td data-label="Élément"><span class="watch-label">Élément</span><strong>{{ row.name }}</strong></td>' +
                                    '<td data-label="Type"><span class="watch-label">Type</span>{{ row.kind }}</td>' +
                                    '<td data-label="État"><span class="watch-label">État</span><span class="status-badge" :class="\'status-badge--\' + row.tone">{{ row.stateLabel }}</span></td>' +
                                    '<td data-label="Depuis" :title="row.sinceTitle"><span class="watch-label">Depuis</span>{{ row.since }}</td>' +
                                    '<td data-label="Cause"><span class="watch-label">Cause</span>{{ row.cause }}</td>' +
                                    '<td data-label="Action"><button class="detail-button" type="button" :aria-label="row.actionLabel" @click="openItem(row)">{{ row.action }}</button></td>' +
                                '</tr>' +
                            '</tbody>' +
                        '</table>' +
                    '</div>' +
                    '<p v-else-if="query || scope !== \'all\'" class="empty-inline">Aucun élément ne correspond. <button type="button" class="overview-link" @click="resetQuery">Réinitialiser</button></p>' +
                    '<p v-else class="empty-inline">Aucun élément surveillé pour le moment.</p>' +
                '</section>' +
                '<details class="overview-panel overview-activity">' +
                    '<summary id="overview-activity-title">Activité récente</summary>' +
                    '<p v-if="activityPartial" class="activity-partial">Certaines sources d’activité sont indisponibles.</p>' +
                    '<activity-timeline :items="activity" :now="now" @open="openActivity"></activity-timeline>' +
                '</details>' +
            '</section>'
    };
}(window));
