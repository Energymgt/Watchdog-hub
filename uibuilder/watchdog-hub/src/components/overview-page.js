(function (global) {
    'use strict';

    var flowFormatters = global.WatchdogHub.flowsFormatters;
    var formatters = global.WatchdogHub.formatters;

    var FLOW_STATE = {
        ok: { label: 'Opérationnel', tone: 'ok', rank: 3, bucket: 'ok' },
        degraded: { label: 'Dégradé', tone: 'warning', rank: 1, bucket: 'warning' },
        down: { label: 'Indisponible', tone: 'critical', rank: 0, bucket: 'failure' },
        unknown: { label: 'Inconnu', tone: 'unknown', rank: 2, bucket: 'unknown' }
    };

    function flowState(status) {
        return FLOW_STATE[status] || FLOW_STATE.unknown;
    }

    function deviceState(device) {
        var state = device && device.state;
        var meta = formatters.stateMeta(state);
        if (state === 'dead') return { label: meta.label || 'Hors service', tone: 'critical', rank: 0, bucket: 'failure' };
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

    function countDevices(devices) {
        var counts = { total: devices.length, ok: 0, attention: 0, dead: 0, unknown: 0 };
        devices.forEach(function (device) {
            var bucket = deviceState(device).bucket;
            if (bucket === 'failure') counts.dead += 1;
            else if (bucket === 'warning') counts.attention += 1;
            else if (bucket === 'unknown') counts.unknown += 1;
            else counts.ok += 1;
        });
        return counts;
    }

    function flowPicture(summary) {
        var down = summary.down || 0;
        var degraded = summary.degraded || 0;
        var unknown = summary.unknown || 0;
        var ok = summary.ok || 0;
        var total = summary.total || 0;
        var counts = { total: total, ok: ok, degraded: degraded, down: down, unknown: unknown };
        if (total === 0) {
            return {
                label: 'Aucun flux',
                tone: 'unknown',
                detail: 'Le registre ne contient aucun flux.',
                counts: counts,
                nominal: false
            };
        }
        if (down > 0) {
            return {
                label: 'Indisponible',
                tone: 'critical',
                detail: down + (down > 1 ? ' flux indisponibles.' : ' flux indisponible.')
                    + (unknown ? ' ' + unknown + ' reste' + (unknown > 1 ? 'nt' : '') + ' inconnu' + (unknown > 1 ? 's' : '') + '.' : ''),
                counts: counts,
                nominal: false
            };
        }
        if (degraded > 0) {
            return {
                label: 'Dégradé',
                tone: 'warning',
                detail: degraded + (degraded > 1 ? ' flux dégradés.' : ' flux dégradé.')
                    + (unknown ? ' ' + unknown + ' reste' + (unknown > 1 ? 'nt' : '') + ' inconnu' + (unknown > 1 ? 's' : '') + '.' : ''),
                counts: counts,
                nominal: false
            };
        }
        if (unknown > 0) {
            return {
                label: 'Inconnu',
                tone: 'unknown',
                detail: unknown + ' flux sans état confirmé.',
                counts: counts,
                nominal: false
            };
        }
        return {
            label: 'Opérationnel',
            tone: 'ok',
            detail: total + (total > 1 ? ' flux opérationnels.' : ' flux opérationnel.'),
            counts: counts,
            nominal: true
        };
    }

    function devicePicture(counts) {
        if (counts.total === 0) {
            return {
                label: 'Aucun appareil',
                tone: 'unknown',
                detail: 'Le relevé confirme une flotte vide.',
                counts: counts,
                nominal: false
            };
        }
        if (counts.dead > 0) {
            return {
                label: 'Hors service',
                tone: 'critical',
                detail: counts.dead + (counts.dead > 1 ? ' appareils hors service.' : ' appareil hors service.')
                    + (counts.unknown ? ' ' + counts.unknown + ' reste' + (counts.unknown > 1 ? 'nt' : '') + ' inconnu' + (counts.unknown > 1 ? 's' : '') + '.' : ''),
                counts: counts,
                nominal: false
            };
        }
        if (counts.attention > 0) {
            return {
                label: 'À surveiller',
                tone: 'warning',
                detail: counts.attention + (counts.attention > 1 ? ' appareils à surveiller.' : ' appareil à surveiller.')
                    + (counts.unknown ? ' ' + counts.unknown + ' reste' + (counts.unknown > 1 ? 'nt' : '') + ' inconnu' + (counts.unknown > 1 ? 's' : '') + '.' : ''),
                counts: counts,
                nominal: false
            };
        }
        if (counts.unknown > 0) {
            return {
                label: 'Inconnu',
                tone: 'unknown',
                detail: counts.unknown + ' appareil' + (counts.unknown > 1 ? 's' : '') + ' sans état confirmé.',
                counts: counts,
                nominal: false
            };
        }
        return {
            label: 'Opérationnel',
            tone: 'ok',
            detail: counts.total + (counts.total > 1 ? ' appareils opérationnels.' : ' appareil opérationnel.'),
            counts: counts,
            nominal: true
        };
    }

    function withhold(picture, message) {
        if (!picture.nominal) return picture;
        return {
            label: 'Non confirmé',
            tone: 'unknown',
            detail: message,
            counts: picture.counts,
            nominal: false
        };
    }

    function describeFlows(view) {
        var summary = view.flowSummary || {};
        var known = flowsKnownFrom(summary);
        if (!known) {
            if (view.loading) {
                return {
                    known: false,
                    status: 'loading',
                    label: 'Lecture en cours',
                    tone: 'unknown',
                    detail: 'Les flux arrivent.',
                    counts: null
                };
            }
            if (view.flowsError) {
                return {
                    known: false,
                    status: 'error',
                    label: 'Erreur de chargement',
                    tone: 'unknown',
                    detail: 'Les flux n’ont pas pu être chargés. ' + view.flowsError,
                    counts: null
                };
            }
            return {
                known: false,
                status: 'missing',
                label: 'Snapshot absent',
                tone: 'unknown',
                detail: 'Les flux n’ont pas été reçus.',
                counts: null
            };
        }
        var picture = flowPicture(summary);
        if (view.connected === false) {
            picture = withhold(picture, 'Le dernier relevé ne signalait aucun défaut de flux.');
        }
        picture.known = true;
        picture.status = 'ready';
        return picture;
    }

    function describeDevices(view) {
        var fleetKnown = view.fleetKnown === true;
        if (!fleetKnown) {
            if (view.fleetError) {
                return {
                    known: false,
                    status: 'error',
                    label: 'Erreur de chargement',
                    tone: 'unknown',
                    detail: 'L’état des appareils n’a pas pu être chargé. ' + view.fleetError,
                    counts: null
                };
            }
            if (view.loading) {
                return {
                    known: false,
                    status: 'loading',
                    label: 'Lecture en cours',
                    tone: 'unknown',
                    detail: 'Les appareils arrivent.',
                    counts: null
                };
            }
            return {
                known: false,
                status: 'missing',
                label: 'Snapshot absent',
                tone: 'unknown',
                detail: 'L’état des appareils n’a pas été reçu.',
                counts: null
            };
        }

        var devices = Array.isArray(view.devices) ? view.devices : null;
        var expected = (view.fleetSummary || {}).total;
        var emptyConfirmed = devices && devices.length === 0 && (expected || 0) === 0;
        var sameLength = devices && (expected === undefined || expected === devices.length);
        var picture;
        if (emptyConfirmed) {
            picture = devicePicture(countDevices(devices));
        } else if (!sameLength) {
            var partialCounts = devices ? countDevices(devices) : null;
            return {
                known: true,
                status: 'partial',
                label: 'Détail incomplet',
                tone: 'unknown',
                detail: 'Le détail des appareils est incomplet.',
                counts: partialCounts,
                nominal: false
            };
        } else {
            picture = devicePicture(countDevices(devices));
        }
        if (view.connected === false || view.stale) {
            picture = withhold(picture, 'Le dernier relevé ne signalait aucun défaut d’appareil.');
        }
        picture.known = true;
        picture.status = 'ready';
        return picture;
    }

    function reliabilityText(view) {
        var flowsKnown = flowsKnownFrom(view.flowSummary);
        var fleetKnown = view.fleetKnown === true;
        if (view.loading && !flowsKnown && !fleetKnown) return '';
        var notes = [];
        if (view.connected === false) {
            notes.push('Connexion interrompue. Les états affichés sont le dernier relevé reçu, pas un état actuel confirmé.');
        }
        if (view.stale && fleetKnown) notes.push('Le relevé des appareils est périmé.');
        return notes.join(' ');
    }

    /**
     * Les contrats n'ont pas de gravité d'incident.
     * down = flux indisponible. dead = appareil hors service.
     * Un incident actif est déjà porté par l'état du flux : il n'ajoute pas une seconde ligne.
     */
    function buildOverview(view) {
        var summary = view.flowSummary || {};
        var flows = Array.isArray(view.flows) ? view.flows : [];
        var devices = Array.isArray(view.devices) ? view.devices : null;
        var incidents = (Array.isArray(view.incidents) ? view.incidents : []).filter(isActiveIncident);
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
            flows: describeFlows(view),
            devices: describeDevices(view),
            reliability: reliabilityText(view),
            attention: attention,
            review: review,
            elements: elements,
            summaryKnown: flowsKnownFrom(summary)
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
        computed: {
            flowsKnown: function () { return flowsKnownFrom(this.flowSummary); },
            initialLoading: function () {
                return this.loading && !this.flowsKnown && !this.fleetKnown;
            },
            built: function () { return buildOverview(this); },
            flowsHealth: function () { return this.built.flows; },
            devicesHealth: function () { return this.built.devices; },
            reliability: function () { return this.built.reliability; },
            attentionItems: function () { return this.built.attention; },
            reviewItems: function () { return this.built.review || []; }
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
            }
        },
        template:
            '<section class="overview-page view-stack" aria-labelledby="overview-title">' +
                '<div class="workspace-heading workspace-header">' +
                    '<div class="workspace-header__titles"><p class="eyebrow">Poste de supervision</p><h2 id="overview-title">Vue d’ensemble</h2><p class="workspace-header__lead">Santé des flux métier et des appareils, puis les problèmes qui demandent une intervention.</p></div>' +
                '</div>' +
                '<p v-if="reliability" class="overview-reliability ui-banner ui-banner--warning">{{ reliability }}</p>' +
                '<div class="health-grid" aria-label="État du système">' +
                    '<article class="health-block" :class="\'health-block--\' + flowsHealth.tone">' +
                        '<header class="health-block__head"><h3>Flux métier</h3><span class="status-badge" :class="\'status-badge--\' + flowsHealth.tone">{{ flowsHealth.label }}</span></header>' +
                        '<p class="health-block__detail health-block__summary">{{ flowsHealth.detail }}</p>' +
                        '<dl v-if="flowsHealth.counts" class="health-counts health-counters">' +
                            '<div class="health-counter-box"><dt>Opérationnels</dt><dd>{{ flowsHealth.counts.ok }}</dd></div>' +
                            '<div class="health-counter-box"><dt>Dégradés</dt><dd>{{ flowsHealth.counts.degraded }}</dd></div>' +
                            '<div class="health-counter-box"><dt>Indisponibles</dt><dd>{{ flowsHealth.counts.down }}</dd></div>' +
                            '<div class="health-counter-box"><dt>Inconnus</dt><dd>{{ flowsHealth.counts.unknown }}</dd></div>' +
                        '</dl>' +
                        '<div class="health-block__foot"><span class="cell-sub">{{ flowSummary.incidentsActive || 0 }} incident(s) actif(s)</span><button class="overview-link btn btn--xs" type="button" @click="openView(\'flows\')">Ouvrir les flux →</button></div>' +
                    '</article>' +
                    '<article class="health-block" :class="\'health-block--\' + devicesHealth.tone">' +
                        '<header class="health-block__head"><h3>Appareils</h3><span class="status-badge" :class="\'status-badge--\' + devicesHealth.tone">{{ devicesHealth.label }}</span></header>' +
                        '<p class="health-block__detail health-block__summary">{{ devicesHealth.detail }}</p>' +
                        '<dl v-if="devicesHealth.counts" class="health-counts health-counters">' +
                            '<div class="health-counter-box"><dt>Opérationnels</dt><dd>{{ devicesHealth.counts.ok }}</dd></div>' +
                            '<div class="health-counter-box"><dt>À surveiller</dt><dd>{{ devicesHealth.counts.attention }}</dd></div>' +
                            '<div class="health-counter-box"><dt>Hors service</dt><dd>{{ devicesHealth.counts.dead }}</dd></div>' +
                            '<div class="health-counter-box"><dt>Inconnus</dt><dd>{{ devicesHealth.counts.unknown }}</dd></div>' +
                        '</dl>' +
                        '<div class="health-block__foot"><span class="cell-sub">{{ fleetSummary.alerts || 0 }} appareil(s) en alerte</span><button class="overview-link btn btn--xs" type="button" @click="openView(\'fleet\')">Ouvrir les appareils →</button></div>' +
                    '</article>' +
                '</div>' +
                '<div class="overview-Workbench">' +
                    '<div class="overview-column">' +
                        '<section class="overview-panel panel-card" aria-labelledby="priority-title">' +
                            '<div class="section-heading panel-card__head"><h3 id="priority-title">À traiter <span class="activity-count nav-counter" :class="attentionItems.length ? \'nav-counter--alert\' : \'nav-counter--volume\'">{{ attentionItems.length }}</span></h3><button class="overview-link btn btn--xs btn--ghost" type="button" @click="openView(\'incidents\')">Ouvrir les incidents →</button></div>' +
                            '<p v-if="initialLoading" class="empty-inline">Lecture des problèmes en cours.</p>' +
                            '<p v-else-if="!attentionItems.length" class="empty-inline">Aucun incident actif, flux en défaut ou appareil en défaut.</p>' +
                            '<ol v-else class="priority-list">' +
                                '<li v-for="item in attentionItems" :key="item.key">' +
                                    '<div class="priority-list__item priority-item" :class="[\'priority-list__item--\' + item.tone, \'priority-item--\' + item.tone]">' +
                                        '<button type="button" class="priority-list__main priority-item__main" @click="openItem(item)">' +
                                            '<span class="priority-list__top priority-item__meta"><span class="status-badge" :class="\'status-badge--\' + item.tone">{{ item.stateLabel }}</span><span class="priority-list__id">{{ item.kind }}</span><span class="priority-list__meta">· <span :title="item.sinceTitle">{{ item.since }}</span></span></span>' +
                                            '<strong class="priority-list__title priority-item__title">{{ item.name }}</strong>' +
                                            '<small class="priority-list__context priority-item__cause">{{ item.cause }}</small>' +
                                            '<span v-if="item.sign" class="priority-list__context priority-item__cause" :title="item.signTitle">{{ item.sign }}</span>' +
                                        '</button>' +
                                        '<span class="priority-list__actions priority-item__actions">' +
                                            '<button v-if="item.target === \'incident\' && item.flow" type="button" class="detail-button btn btn--xs" :aria-label="\'Ouvrir le flux \' + item.flow.name" @click="openFlow(item.flow)">Voir le flux</button>' +
                                            '<button type="button" class="detail-button btn btn--xs btn--primary" :aria-label="item.actionLabel" @click="openItem(item)">{{ item.action }}</button>' +
                                        '</span>' +
                                    '</div>' +
                                '</li>' +
                            '</ol>' +
                        '</section>' +
                        '<section v-if="reviewItems.length" class="overview-panel panel-card" aria-labelledby="review-title">' +
                            '<div class="section-heading panel-card__head"><h3 id="review-title">En attente de premier signal (Inconnu) <span class="activity-count nav-counter nav-counter--volume">{{ reviewItems.length }}</span></h3></div>' +
                            '<ol class="priority-list">' +
                                '<li v-for="item in reviewItems" :key="item.key">' +
                                    '<div class="priority-list__item priority-item priority-list__item--unknown priority-item--unknown">' +
                                        '<button type="button" class="priority-list__main priority-item__main" @click="openItem(item)">' +
                                            '<span class="priority-list__top priority-item__meta"><span class="status-badge status-badge--unknown">Inconnu</span><span class="priority-list__id">{{ item.kind }}</span></span>' +
                                            '<strong class="priority-list__title priority-item__title">{{ item.name }}</strong>' +
                                            '<small class="priority-list__context priority-item__cause">{{ item.cause }}</small>' +
                                        '</button>' +
                                        '<span class="priority-list__actions priority-item__actions">' +
                                            '<button type="button" class="detail-button btn btn--xs" :aria-label="item.actionLabel" @click="openItem(item)">Inspecter</button>' +
                                        '</span>' +
                                    '</div>' +
                                '</li>' +
                            '</ol>' +
                        '</section>' +
                    '</div>' +
                    '<section class="overview-panel panel-card" aria-labelledby="overview-activity-title">' +
                        '<div class="section-heading panel-card__head"><h3 id="overview-activity-title">Activité récente</h3><span class="cell-sub">Inter-domaines</span></div>' +
                        '<p v-if="activityPartial" class="activity-partial">Certaines sources d’activité sont indisponibles.</p>' +
                        '<activity-timeline :items="activity" :now="now" @open="openActivity"></activity-timeline>' +
                    '</section>' +
                '</div>' +
            '</section>'
    };
}(window));
