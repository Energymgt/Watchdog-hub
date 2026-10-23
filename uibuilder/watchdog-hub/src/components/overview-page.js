(function (global) {
    'use strict';

    var flowFormatters = global.WatchdogHub.flowsFormatters;
    var formatters = global.WatchdogHub.formatters;

    var FLOW_STATE = {
        ok: { label: 'Opérationnel', tone: 'ok', rank: 3, bucket: 'ok' },
        degraded: { label: 'Dégradé', tone: 'warning', rank: 1, bucket: 'warning' },
        down: { label: 'Indisponible', tone: 'high', rank: 0, bucket: 'failure' },
        unknown: { label: 'Inconnu', tone: 'unknown', rank: 2, bucket: 'unknown' }
    };

    function flowState(status) {
        return FLOW_STATE[status] || FLOW_STATE.unknown;
    }

    function deviceState(device) {
        var state = device && device.state;
        var meta = formatters.stateMeta(state);
        if (state === 'dead') return { label: meta.label || 'Hors service', tone: 'high', rank: 0, bucket: 'failure' };
        if (state === 'heartbeat_missing') return { label: meta.label || 'Heartbeat absent', tone: 'warning', rank: 1, bucket: 'warning' };
        if (state === 'cloud_down' || state === 'unknown_online') {
            return { label: meta.label || 'À surveiller', tone: 'warning', rank: 1, bucket: 'warning' };
        }
        if (state === 'ok') return { label: meta.label || 'Opérationnel', tone: 'ok', rank: 3, bucket: 'ok' };
        return { label: meta.label || 'Inconnu', tone: 'unknown', rank: 2, bucket: 'unknown' };
    }

    function flowsKnownFrom(summary) {
        return Object.prototype.hasOwnProperty.call(summary || {}, 'total');
    }

    function isActiveIncident(incident) {
        return incident && incident.state !== 'RESOLU' && incident.state !== 'CLOS';
    }

    function addBucket(counts, bucket) {
        counts[bucket] += 1;
    }

    /**
     * Les contrats n'ont pas de gravité d'incident.
     * down = flux indisponible. dead = appareil hors service.
     * Un incident actif est déjà porté par l'état du flux : il n'ajoute pas un élément compté.
     */
    function buildOverview(view) {
        var summary = view.flowSummary || {};
        var flowsKnown = flowsKnownFrom(summary);
        var fleetKnown = view.fleetKnown === true;
        var fleetSummary = view.fleetSummary || {};
        var flows = Array.isArray(view.flows) ? view.flows : [];
        var devices = Array.isArray(view.devices) ? view.devices : null;
        var incidents = (Array.isArray(view.incidents) ? view.incidents : []).filter(isActiveIncident);
        var counts = { ok: 0, failure: 0, warning: 0, unknown: 0 };
        var notes = [];
        var loaded = false;

        if (flowsKnown) {
            loaded = true;
            if (flows.length === (summary.total || 0)) {
                flows.forEach(function (flow) { addBucket(counts, flowState(flow.status).bucket); });
            } else {
                counts.failure += summary.down || 0;
                counts.warning += summary.degraded || 0;
                counts.unknown += summary.unknown || 0;
                counts.ok += summary.ok || 0;
            }
        } else if (!(view.loading && !fleetKnown)) {
            notes.push(view.flowsError
                ? 'Les flux n’ont pas pu être chargés.'
                : 'Les flux n’ont pas été reçus.');
        }

        if (fleetKnown) {
            loaded = true;
            var expected = fleetSummary.total;
            var sameLength = devices && (expected === undefined || expected === devices.length);
            var emptyConfirmed = (!devices || devices.length === 0) && (expected || 0) === 0;
            if (sameLength) {
                devices.forEach(function (device) { addBucket(counts, deviceState(device).bucket); });
            } else if (!emptyConfirmed) {
                notes.push('Le détail des appareils est incomplet.');
                if (devices) devices.forEach(function (device) { addBucket(counts, deviceState(device).bucket); });
            }
        } else if (!(view.loading && !flowsKnown)) {
            notes.push(view.fleetError
                ? 'L’état des appareils n’a pas pu être chargé.'
                : 'L’état des appareils n’a pas été reçu.');
        }

        var watched = loaded ? counts.ok + counts.failure + counts.warning + counts.unknown : null;
        var flowById = {};
        flows.forEach(function (flow) { flowById[flow.flow_id] = flow; });
        var incidentFlowIds = {};
        incidents.forEach(function (incident) {
            if (incident.flow_id) incidentFlowIds[incident.flow_id] = true;
        });
        var now = view.now;
        function relative(value) {
            return formatters.formatRelative(value, now);
        }
        function absolute(value) {
            return formatters.formatDateTime(value);
        }
        function flowElement(flow) {
            var state = flowState(flow.status);
            var cause = flowFormatters.reasonLabel(flow.status_reason);
            return {
                key: 'flow:' + flow.flow_id,
                kind: 'Flux',
                name: flow.name,
                stateLabel: state.label,
                tone: state.tone,
                rank: state.rank,
                bucket: state.bucket,
                since: 'Non daté',
                sinceTitle: 'Aucun horodatage de début n’est fourni pour ce flux.',
                sign: '',
                signTitle: '',
                cause: cause,
                action: 'Ouvrir',
                actionLabel: 'Ouvrir le flux ' + flow.name,
                target: 'flow',
                flow: flow,
                haystack: [flow.name, flow.flow_id, state.label, cause, 'flux'].join(' ').toLocaleLowerCase('fr-FR')
            };
        }
        function deviceElement(device) {
            var state = deviceState(device);
            var detail = device.detail || 'Aucun détail fourni';
            var sign = device.lastHeartbeat ? 'Dernier heartbeat : ' + relative(device.lastHeartbeat) : '';
            return {
                key: 'device:' + device.uuid,
                kind: 'Appareil',
                name: device.name,
                stateLabel: state.label,
                tone: state.tone,
                rank: state.rank,
                bucket: state.bucket,
                since: 'Non daté',
                sinceTitle: 'Aucun horodatage de changement d’état n’est fourni pour cet appareil.',
                sign: sign,
                signTitle: device.lastHeartbeat ? 'Dernier heartbeat : ' + absolute(device.lastHeartbeat) : '',
                cause: detail,
                action: 'Ouvrir',
                actionLabel: 'Ouvrir l’appareil ' + device.name,
                target: 'device',
                device: device,
                haystack: [device.name, device.uuid, state.label, detail, sign, 'appareil'].join(' ').toLocaleLowerCase('fr-FR')
            };
        }
        var attention = incidents.map(function (incident) {
            var flow = flowById[incident.flow_id];
            var state = flow ? flowState(flow.status) : { label: 'Inconnu', tone: 'unknown', rank: 2 };
            var meta = flowFormatters.incidentStateMeta(incident.state);
            return {
                key: 'incident:' + incident.incident_id,
                kind: 'Incident ' + (meta.label || incident.state || ''),
                name: flow ? flow.name : (incident.flow_id || incident.incident_id),
                stateLabel: state.label,
                tone: state.tone,
                rank: state.rank,
                since: incident.opened_at ? 'Incident ouvert depuis ' + relative(incident.opened_at) : 'Non daté',
                sinceTitle: incident.opened_at
                    ? 'Incident ouvert le ' + absolute(incident.opened_at)
                    : 'Aucune date d’ouverture n’est fournie.',
                cause: incident.error_signature || 'Cause non précisée',
                action: 'Ouvrir l’incident',
                actionLabel: 'Ouvrir l’incident ' + incident.incident_id,
                target: 'incident',
                incident: incident,
                flow: flow || null
            };
        });
        flows.forEach(function (flow) {
            var state = flowState(flow.status);
            if (state.bucket === 'ok' || state.bucket === 'unknown') return;
            if (incidentFlowIds[flow.flow_id]) return;
            attention.push(flowElement(flow));
        });
        (devices || []).forEach(function (device) {
            var state = deviceState(device);
            if (state.bucket === 'ok' || state.bucket === 'unknown') return;
            attention.push(deviceElement(device));
        });
        attention.sort(function (a, b) {
            return a.rank - b.rank || String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' });
        });
        var review = [];
        flows.forEach(function (flow) {
            if (flowState(flow.status).bucket === 'unknown') review.push(flowElement(flow));
        });
        (devices || []).forEach(function (device) {
            if (deviceState(device).bucket === 'unknown') review.push(deviceElement(device));
        });
        var elements = flows.map(flowElement).concat((devices || []).map(deviceElement)).sort(function (a, b) {
            return a.rank - b.rank || String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base' });
        });

        return {
            counts: {
                watched: watched,
                failures: loaded ? counts.failure : null,
                warnings: loaded ? counts.warning : null,
                unknown: loaded ? counts.unknown : null,
                ok: loaded ? counts.ok : null,
                note: notes.join(' '),
                partial: notes.length > 0
            },
            situation: describeSituation(view, counts, loaded, notes),
            attention: attention,
            review: review,
            elements: elements
        };
    }

    function describeSituation(view, counts, loaded, notes) {
        var reliability = [];
        if (view.connected === false) {
            reliability.push('Connexion interrompue. Les états affichés sont le dernier relevé reçu, pas un état actuel confirmé.');
        }
        if (view.stale) {
            reliability.push('Le relevé des appareils est périmé.');
        }
        notes.forEach(function (note) {
            if (reliability.indexOf(note) === -1) reliability.push(note);
        });

        if (view.loading && !loaded) {
            return {
                label: 'Lecture en cours',
                tone: 'unknown',
                detail: 'Les données de supervision arrivent.',
                reliability: ''
            };
        }

        var picture;
        if (!loaded) {
            picture = {
                label: 'État inconnu',
                tone: 'unknown',
                detail: 'Aucune donnée de supervision n’a été reçue.'
            };
        } else if (counts.failure > 0) {
            picture = {
                label: 'Des éléments sont indisponibles',
                tone: 'high',
                detail: counts.unknown > 0
                    ? 'D’autres éléments restent inconnus.'
                    : 'Au moins un flux est indisponible ou un appareil est hors service.'
            };
        } else if (counts.warning > 0) {
            picture = {
                label: 'Des éléments nécessitent votre attention',
                tone: 'warning',
                detail: counts.unknown > 0
                    ? 'D’autres éléments restent inconnus.'
                    : 'Au moins un flux est dégradé ou un appareil demande une surveillance.'
            };
        } else if (counts.unknown > 0 || notes.length > 0) {
            picture = {
                label: 'Des éléments sont à vérifier',
                tone: 'unknown',
                detail: 'La synthèse ne confirme pas que tout fonctionne.'
            };
        } else {
            picture = {
                label: 'Tout fonctionne',
                tone: 'ok',
                detail: 'Aucun défaut, avertissement ou inconnu dans les données reçues.'
            };
        }

        if (view.connected === false && loaded) {
            return {
                label: picture.label === 'Tout fonctionne'
                    ? 'Dernier relevé : aucun défaut signalé'
                    : 'Dernier relevé : ' + picture.label.charAt(0).toLocaleLowerCase('fr-FR') + picture.label.slice(1),
                tone: picture.tone === 'ok' ? 'unknown' : picture.tone,
                detail: picture.detail,
                reliability: reliability.join(' ')
            };
        }
        if (view.stale && picture.label === 'Tout fonctionne') {
            return {
                label: 'État non confirmé',
                tone: 'warning',
                detail: 'Le dernier relevé ne signalait aucun défaut.',
                reliability: reliability.join(' ')
            };
        }
        return {
            label: picture.label,
            tone: picture.tone,
            detail: picture.detail,
            reliability: reliability.join(' ')
        };
    }

    global.WatchdogHub.overviewModel = {
        build: buildOverview,
        flowState: flowState,
        deviceState: deviceState
    };

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
            fleetError: { type: String, default: '' },
            flowsError: { type: String, default: '' },
            now: { type: Number, default: Date.now }
        },
        data: function () {
            return { query: '', scope: 'all' };
        },
        computed: {
            flowsKnown: function () { return flowsKnownFrom(this.flowSummary); },
            initialLoading: function () {
                return this.loading && !this.flowsKnown && !this.fleetKnown;
            },
            built: function () { return buildOverview(this); },
            counts: function () { return this.built.counts; },
            situation: function () { return buildOverview(this).situation; },
            attentionItems: function () { return this.built.attention; },
            reviewItems: function () { return this.built.review; },
            watchedRows: function () { return this.built.elements; },
            visibleRows: function () {
                var scope = this.scope;
                var query = this.query.trim().toLocaleLowerCase('fr-FR');
                return this.watchedRows.filter(function (row) {
                    if (scope === 'attention' && row.bucket !== 'failure' && row.bucket !== 'warning') return false;
                    if (scope === 'review' && row.bucket !== 'unknown') return false;
                    if (scope === 'flows' && row.kind !== 'Flux') return false;
                    if (scope === 'devices' && row.kind !== 'Appareil') return false;
                    if (!query) return true;
                    return row.haystack.indexOf(query) !== -1;
                });
            }
        },
        methods: {
            openItem: function (item) {
                if (item.target === 'incident') this.$emit('open-incident', item.incident);
                else if (item.target === 'device') this.$emit('open-device', item.device);
                else this.$emit('open-view', 'flows', item.flow);
            },
            openFlow: function (flow) {
                this.$emit('open-view', 'flows', flow);
            },
            openActivity: function (item) {
                if (item && item.navigation) this.$emit('open-view', item.navigation.view, item);
            },
            openView: function (view) {
                this.$emit('open-view', view);
            },
            setScope: function (scope) { this.scope = scope; },
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
                        '<p v-if="situation.reliability" class="overview-reliability">{{ situation.reliability }}</p>' +
                    '</div>' +
                    '<div class="overview-hero__links">' +
                        '<button class="overview-link" type="button" @click="openView(\'incidents\')">Incidents</button>' +
                        '<button class="overview-link" type="button" @click="openView(\'flows\')">Flux</button>' +
                        '<button class="overview-link" type="button" @click="openView(\'fleet\')">Appareils</button>' +
                    '</div>' +
                '</div>' +
                '<section class="overview-kpis" aria-label="Indicateurs essentiels" :aria-busy="initialLoading ? \'true\' : \'false\'">' +
                    '<div class="overview-kpi"><kpi-card label="Surveillés" :value="counts.watched" tone="unknown" :loading="initialLoading"></kpi-card></div>' +
                    '<div class="overview-kpi"><kpi-card label="En défaut" :value="counts.failures" :tone="counts.failures > 0 ? \'high\' : \'unknown\'" :loading="initialLoading"></kpi-card></div>' +
                    '<div class="overview-kpi"><kpi-card label="Avertissements" :value="counts.warnings" :tone="counts.warnings > 0 ? \'warning\' : \'unknown\'" :loading="initialLoading"></kpi-card></div>' +
                    '<div class="overview-kpi"><kpi-card label="Inconnus" :value="counts.unknown" :tone="counts.unknown > 0 ? \'unknown\' : \'unknown\'" :loading="initialLoading"></kpi-card></div>' +
                '</section>' +
                '<p v-if="counts.note" class="overview-reliability">{{ counts.note }}</p>' +
                '<section class="overview-panel" aria-labelledby="priority-title">' +
                    '<div class="section-heading"><h3 id="priority-title">À traiter</h3><span class="activity-count">{{ attentionItems.length }}</span></div>' +
                    '<p v-if="initialLoading" class="empty-inline">Lecture des problèmes en cours.</p>' +
                    '<p v-else-if="!attentionItems.length" class="empty-inline">Aucun défaut ni avertissement confirmé.</p>' +
                    '<ol v-else class="priority-list">' +
                        '<li v-for="item in attentionItems" :key="item.key">' +
                            '<div class="priority-list__item" :class="\'priority-list__item--\' + item.tone">' +
                                '<button type="button" class="priority-list__main" @click="openItem(item)">' +
                                    '<span class="priority-list__top"><span class="priority-list__id">{{ item.kind }}</span><span class="priority-list__meta">{{ item.stateLabel }} · <span :title="item.sinceTitle">{{ item.since }}</span></span></span>' +
                                    '<strong class="priority-list__title">{{ item.name }}</strong>' +
                                    '<small class="priority-list__context">{{ item.cause }}</small>' +
                                    '<span v-if="item.sign" class="priority-list__context" :title="item.signTitle">{{ item.sign }}</span>' +
                                '</button>' +
                                '<span class="priority-list__actions">' +
                                    '<button type="button" class="detail-button" :aria-label="item.actionLabel" @click="openItem(item)">{{ item.action }}</button>' +
                                    '<button v-if="item.target === \'incident\' && item.flow" type="button" class="detail-button" :aria-label="\'Ouvrir le flux \' + item.flow.name" @click="openFlow(item.flow)">Voir le flux</button>' +
                                '</span>' +
                            '</div>' +
                        '</li>' +
                    '</ol>' +
                '</section>' +
                '<section v-if="reviewItems.length" class="overview-panel" aria-labelledby="review-title">' +
                    '<div class="section-heading"><h3 id="review-title">À vérifier</h3><span class="activity-count">{{ reviewItems.length }}</span></div>' +
                    '<ol class="priority-list">' +
                        '<li v-for="item in reviewItems" :key="item.key">' +
                            '<button type="button" class="priority-list__item priority-list__item--unknown" @click="openItem(item)">' +
                                '<span class="priority-list__top"><span class="priority-list__id">{{ item.kind }}</span><span class="priority-list__meta">{{ item.stateLabel }} · <span :title="item.sinceTitle">{{ item.since }}</span></span></span>' +
                                '<strong class="priority-list__title">{{ item.name }}</strong>' +
                                '<small class="priority-list__context">{{ item.cause }}</small>' +
                                '<span v-if="item.sign" class="priority-list__context" :title="item.signTitle">{{ item.sign }}</span>' +
                            '</button>' +
                        '</li>' +
                    '</ol>' +
                '</section>' +
                '<section class="overview-panel" aria-labelledby="watched-title">' +
                    '<div class="section-heading"><h3 id="watched-title">Éléments surveillés</h3><span class="activity-count">{{ visibleRows.length }}</span></div>' +
                    '<div class="watch-toolbar">' +
                        '<div class="watch-scopes" role="group" aria-label="Filtrer les éléments">' +
                            '<button type="button" :aria-pressed="scope === \'all\' ? \'true\' : \'false\'" @click="setScope(\'all\')">Tous</button>' +
                            '<button type="button" :aria-pressed="scope === \'attention\' ? \'true\' : \'false\'" @click="setScope(\'attention\')">À traiter</button>' +
                            '<button type="button" :aria-pressed="scope === \'review\' ? \'true\' : \'false\'" @click="setScope(\'review\')">À vérifier</button>' +
                            '<button type="button" :aria-pressed="scope === \'flows\' ? \'true\' : \'false\'" @click="setScope(\'flows\')">Flux</button>' +
                            '<button type="button" :aria-pressed="scope === \'devices\' ? \'true\' : \'false\'" @click="setScope(\'devices\')">Appareils</button>' +
                        '</div>' +
                        '<label class="watch-search" for="overview-search">Recherche<input id="overview-search" type="search" v-model="query" placeholder="Nom, état ou cause"></label>' +
                    '</div>' +
                    '<p class="results-summary">{{ visibleRows.length }} élément{{ visibleRows.length > 1 ? \'s\' : \'\' }} affiché{{ visibleRows.length > 1 ? \'s\' : \'\' }}.</p>' +
                    '<div v-if="visibleRows.length" class="watch-wrap">' +
                        '<table class="watch-table"><caption class="sr-only">Flux et appareils, problèmes en premier</caption>' +
                            '<thead><tr><th scope="col">Élément</th><th scope="col">Type</th><th scope="col">État</th><th scope="col">Repère</th><th scope="col">Cause</th><th scope="col">Action</th></tr></thead>' +
                            '<tbody><tr v-for="row in visibleRows" :key="row.key">' +
                                '<td><span class="watch-label">Élément</span><strong :title="row.name">{{ row.name }}</strong></td>' +
                                '<td><span class="watch-label">Type</span>{{ row.kind }}</td>' +
                                '<td><span class="watch-label">État</span><span class="status-badge" :class="\'status-badge--\' + row.tone">{{ row.stateLabel }}</span></td>' +
                                '<td :title="row.sinceTitle"><span class="watch-label">Repère</span>{{ row.since }}<small v-if="row.sign" class="cell-note" :title="row.signTitle">{{ row.sign }}</small></td>' +
                                '<td><span class="watch-label">Cause</span>{{ row.cause }}</td>' +
                                '<td><button class="detail-button" type="button" :aria-label="row.actionLabel" @click="openItem(row)">{{ row.action }}</button></td>' +
                            '</tr></tbody></table>' +
                    '</div>' +
                    '<p v-else-if="query || scope !== \'all\'" class="empty-inline">Aucun élément ne correspond. <button type="button" class="overview-link" @click="resetQuery">Réinitialiser</button></p>' +
                    '<p v-else class="empty-inline">Aucun élément surveillé pour le moment.</p>' +
                '</section>' +
                '<details class="overview-panel overview-activity"><summary id="overview-activity-title">Activité récente</summary>' +
                    '<p v-if="activityPartial" class="activity-partial">Certaines sources d’activité sont indisponibles.</p>' +
                    '<activity-timeline :items="activity" :now="now" @open="openActivity"></activity-timeline>' +
                '</details>' +
            '</section>'
    };
}(window));
