(function (global) {
    'use strict';

    var Vue = global.Vue;
    var hub = global.WatchdogHub;
    var router = hub.canonicalRouter;
    var formatters = hub.formatters;
    var flowFormatters = hub.flowsFormatters;

    var INCIDENT_GRAPH = {
        DETECTE: ['OUVERT'],
        OUVERT: ['EN_ANALYSE'],
        EN_ANALYSE: ['EN_CORRECTION'],
        EN_CORRECTION: ['EN_VALIDATION'],
        EN_VALIDATION: ['RESOLU'],
        RESOLU: ['CLOS'],
        CLOS: []
    };

    var INCIDENT_ORDER = [
        'DETECTE',
        'OUVERT',
        'EN_ANALYSE',
        'EN_CORRECTION',
        'EN_VALIDATION',
        'RESOLU',
        'CLOS'
    ];

    var FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    var App = {
        name: 'WatchdogPrototypeApp',
        setup: function () {
            var now = Vue.ref(Date.now());
            var dataset = Vue.reactive(hub.createDemoDataset(now.value));

            // État de simulation du prototype
            var scenario = Vue.ref('crisis');
            var connected = Vue.ref(true);
            var staleOverride = Vue.ref(false);
            var fleetMissingOverride = Vue.ref(false);

            // Thème explicite Clair / Sombre (Audit #11)
            var theme = Vue.ref(readInitialTheme());
            applyThemeToDom(theme.value, false);

            // Route canonique courante et pile d'historique de session
            var route = Vue.ref(router.parse(global.location.hash));
            var urlBarInput = Vue.ref(route.value.canonicalHash);
            var routeNotice = Vue.ref('');
            var sessionHistory = Vue.ref([route.value.canonicalHash]);
            var copyUrlFeedback = Vue.ref('');
            var copyIdFeedback = Vue.ref('');
            var liveAnnouncement = Vue.ref('');
            var lastOpener = null;

            // Surcouches modales (prioritaires sur l'inspecteur pour la touche Échap — Audit #8)
            var paletteOpen = Vue.ref(false);
            var paletteQuery = Vue.ref('');
            var paletteIndex = Vue.ref(0);
            var enrollOpen = Vue.ref(false);
            var enrollForm = Vue.reactive({ method: 'mqtt', uuid: '', name: '' });

            // Filtres strictement isolés par écran (Audit #3) + Pagination Flotte
            var flowFilters = Vue.reactive({ query: '', status: 'all' });
            var incidentFilters = Vue.reactive({ query: '', state: 'active', flowId: 'all' });
            var fleetFilters = Vue.reactive({ query: '', status: 'all', source: 'all', sort: 'severity', page: 1, pageSize: 5 });
            var alertFilters = Vue.reactive({ query: '', status: 'active', plan: 'all' });
            var anomalyFilters = Vue.reactive({ query: '', status: 'all', flowId: 'all', clause: 'all' });
            var eventFilters = Vue.reactive({ query: '', type: 'all', source: 'all', flowId: 'all' });

            // Formulaire d'action opérateur dans l'inspecteur (Incident / Alerte)
            var operatorForm = Vue.reactive({
                actor: 'c.catarino',
                noteComment: '',
                transitionTarget: '',
                transitionComment: '',
                resolutionComment: '',
                ackActor: 'c.catarino'
            });

            // Formulaire Administration
            var adminForm = Vue.reactive({
                fleetName: dataset.admin.fleetName,
                balenaAppId: dataset.admin.balena.appId,
                balenaToken: '',
                teamsWebhookUrl: '',
                mqttHost: dataset.admin.mqtt.host,
                mqttPort: dataset.admin.mqtt.port,
                mqttTopicPattern: dataset.admin.mqtt.topicPattern,
                offlineGraceMinutes: dataset.admin.settings.offlineGraceMinutes,
                firstSeenGraceMinutes: dataset.admin.settings.firstSeenGraceMinutes,
                confirmsRequired: dataset.admin.settings.confirmsRequired,
                heartbeatTtlDays: dataset.admin.settings.heartbeatTtlDays,
                pollIntervalMs: dataset.admin.settings.pollIntervalMs,
                dirty: false,
                notice: ''
            });

            function readInitialTheme() {
                try {
                    var saved = global.localStorage && global.localStorage.getItem('watchdog-theme');
                    if (saved === 'light' || saved === 'dark') return saved;
                } catch (e) { /* ignore */ }
                return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            }

            function applyThemeToDom(nextTheme, persist) {
                var valid = nextTheme === 'light' ? 'light' : 'dark';
                theme.value = valid;
                document.documentElement.setAttribute('data-theme', valid);
                document.documentElement.style.colorScheme = valid;
                if (persist) {
                    try {
                        global.localStorage.setItem('watchdog-theme', valid);
                    } catch (e) { /* ignore */ }
                }
            }

            function toggleTheme() {
                applyThemeToDom(theme.value === 'dark' ? 'light' : 'dark', true);
                liveAnnouncement.value = theme.value === 'dark' ? 'Thème sombre activé.' : 'Thème clair activé.';
            }

            function rememberOpener() {
                if (document.activeElement && document.activeElement !== document.body) {
                    lastOpener = document.activeElement;
                }
            }

            function restoreOpenerFocus() {
                if (lastOpener && typeof lastOpener.focus === 'function') {
                    var target = lastOpener;
                    lastOpener = null;
                    Vue.nextTick(function () {
                        try { target.focus(); } catch (e) { /* ignore */ }
                    });
                }
            }

            // Synchronisation URL <-> État
            function syncFromHash() {
                var parsed = router.parse(global.location.hash);
                if (!parsed.isKnownView) {
                    routeNotice.value = 'Route inconnue « #' + parsed.rawRequestedView + ' » : redirection automatique vers #overview.';
                } else {
                    routeNotice.value = '';
                }
                route.value = parsed;
                urlBarInput.value = parsed.canonicalHash;

                var historyArr = sessionHistory.value;
                if (historyArr[historyArr.length - 1] !== parsed.canonicalHash) {
                    historyArr.push(parsed.canonicalHash);
                }

                if (global.location.hash !== parsed.canonicalHash && (global.location.hash || parsed.view !== 'overview')) {
                    global.history.replaceState(null, '', parsed.canonicalHash);
                }

                if (parsed.objectKind === 'incident') {
                    var inc = findObject('incident', parsed.objectId);
                    if (inc) {
                        var allowed = (INCIDENT_GRAPH[inc.state] || []).filter(function (s) { return s !== 'RESOLU'; });
                        operatorForm.transitionTarget = allowed[0] || '';
                    }
                }

                if (parsed.objectId) {
                    Vue.nextTick(function () {
                        var closeBtn = document.getElementById('inspector-close-btn');
                        if (closeBtn) closeBtn.focus();
                    });
                } else {
                    restoreOpenerFocus();
                }
            }

            function navigate(view, objectId) {
                var nextHash = router.format(view, objectId);
                if (global.location.hash !== nextHash) {
                    global.location.hash = nextHash;
                } else {
                    syncFromHash();
                }
            }

            function inspectObject(kind, objectId) {
                rememberOpener();
                var targetHash = router.formatObject(kind, objectId);
                if (global.location.hash !== targetHash) {
                    global.location.hash = targetHash;
                } else {
                    syncFromHash();
                }
            }

            function closeInspector() {
                navigate(route.value.view, null);
            }

            /**
             * Retour intelligent :
             * - Si l'opérateur a navigué dans la session (sessionHistory.length > 1), utilise history.back()
             * - Si l'opérateur a ouvert directement un lien profond dans un nouvel onglet, replie vers la vue liste parente (#vue)
             */
            function smartBack() {
                if (sessionHistory.value.length > 1) {
                    sessionHistory.value.pop();
                    global.history.back();
                } else if (route.value.objectId) {
                    closeInspector();
                } else {
                    navigate('overview', null);
                }
            }

            function goForwardBrowser() {
                global.history.forward();
            }

            function submitCustomUrlBar() {
                var raw = String(urlBarInput.value || '').trim();
                if (!raw) {
                    navigate('overview', null);
                    return;
                }
                var normalized = raw.charAt(0) === '#' ? raw : ('#' + raw);
                if (global.location.hash !== normalized) {
                    global.location.hash = normalized;
                } else {
                    syncFromHash();
                }
            }

            function findObject(kind, id) {
                if (!kind || !id) return null;
                if (kind === 'flow') {
                    return dataset.flows.filter(function (f) { return f.flow_id === id; })[0] || null;
                }
                if (kind === 'device') {
                    return dataset.devices.filter(function (d) { return d.uuid === id; })[0] || null;
                }
                if (kind === 'alert') {
                    return dataset.alerts.filter(function (a) { return a.alert_id === id; })[0] || null;
                }
                if (kind === 'incident') {
                    return dataset.incidents.filter(function (i) { return i.incident_id === id; })[0] || null;
                }
                if (kind === 'anomaly') {
                    return dataset.anomalies.filter(function (a) { return a.anomaly_id === id; })[0] || null;
                }
                if (kind === 'event') {
                    return dataset.events.filter(function (e) { return e.event_id === id; })[0] || null;
                }
                return null;
            }

            // Résolution de l'objet inspecté depuis l'URL (distingue 200 Found, 404 Not Found, 503 Snapshot Absent)
            var inspected = Vue.computed(function () {
                return router.resolveTarget(route.value, {
                    dataset: dataset,
                    availability: {
                        flow: true,
                        device: !fleetMissingOverride.value,
                        alert: true,
                        incident: true,
                        anomaly: true,
                        event: true
                    }
                });
            });

            var anyOverlayOpen = Vue.computed(function () {
                return Boolean(inspected.value) || paletteOpen.value || enrollOpen.value;
            });

            // Scénarios de démonstration en 1 clic
            function applyScenario(mode) {
                scenario.value = mode;
                if (mode === 'crisis') {
                    var fresh = hub.createDemoDataset(now.value);
                    dataset.flows = fresh.flows;
                    dataset.devices = fresh.devices;
                    dataset.incidents = fresh.incidents;
                    dataset.alerts = fresh.alerts;
                    dataset.anomalies = fresh.anomalies;
                    connected.value = true;
                    staleOverride.value = false;
                    fleetMissingOverride.value = false;
                } else if (mode === 'nominal') {
                    var base = hub.createDemoDataset(now.value);
                    dataset.flows = base.flows.map(function (f) {
                        return Object.assign({}, f, { status: 'ok', status_reason: 'nominal' });
                    });
                    dataset.devices = base.devices.map(function (d) {
                        return Object.assign({}, d, {
                            state: 'ok',
                            confirmedState: 'ok',
                            severity: 'ok',
                            online: true,
                            hbOk: true,
                            detail: 'Passerelle opérationnelle (Balena en ligne + heartbeat MQTT récent)',
                            indicators: { bacnet: 'ok', mqtt: 'ok', buffer: 'ok', supervisor: 'ok' },
                            pendingConfirmation: null
                        });
                    });
                    dataset.incidents = base.incidents.map(function (inc) {
                        return Object.assign({}, inc, { state: 'CLOS', closed_at: new Date(now.value).toISOString() });
                    });
                    dataset.alerts = base.alerts.map(function (al) {
                        return Object.assign({}, al, { status: 'closed' });
                    });
                    dataset.anomalies = base.anomalies.map(function (an) {
                        return Object.assign({}, an, { status: 'closed', closed_at: new Date(now.value).toISOString() });
                    });
                    connected.value = true;
                    staleOverride.value = false;
                    fleetMissingOverride.value = false;
                } else if (mode === 'disconnected') {
                    connected.value = false;
                    staleOverride.value = false;
                    fleetMissingOverride.value = false;
                } else if (mode === 'stale') {
                    connected.value = true;
                    staleOverride.value = true;
                    fleetMissingOverride.value = false;
                } else if (mode === 'missing_fleet') {
                    connected.value = true;
                    staleOverride.value = false;
                    fleetMissingOverride.value = true;
                }
            }

            function trigger404Demo() {
                inspectObject('incident', 'INC-404-INTROUVABLE');
            }

            function triggerUnknownRouteDemo() {
                global.location.hash = '#ancienne-page-inconnue';
            }

            // Résumés calculés en temps réel
            var flowSummary = Vue.computed(function () {
                var s = { total: dataset.flows.length, ok: 0, degraded: 0, down: 0, unknown: 0, incidentsActive: 0 };
                dataset.flows.forEach(function (f) {
                    if (s[f.status] !== undefined) s[f.status] += 1;
                    else s.unknown += 1;
                });
                s.incidentsActive = dataset.incidents.filter(function (i) {
                    return i.state !== 'RESOLU' && i.state !== 'CLOS';
                }).length;
                return s;
            });

            var incidentCounts = Vue.computed(function () {
                var c = { active: 0, detecte: 0, inProgress: 0, validation: 0, terminal: 0 };
                dataset.incidents.forEach(function (i) {
                    if (i.state === 'RESOLU' || i.state === 'CLOS') {
                        c.terminal += 1;
                    } else {
                        c.active += 1;
                        if (i.state === 'DETECTE') c.detecte += 1;
                        else if (i.state === 'EN_VALIDATION') c.validation += 1;
                        else c.inProgress += 1;
                    }
                });
                return c;
            });

            var fleetSummary = Vue.computed(function () {
                var total = dataset.devices.length;
                var ok = 0;
                var alerts = 0;
                var hbMissing = 0;
                var dead = 0;
                var unknown = 0;
                dataset.devices.forEach(function (d) {
                    if (d.state === 'ok') ok += 1;
                    else if (d.state === 'unknown') unknown += 1;
                    else {
                        alerts += 1;
                        if (d.state === 'heartbeat_missing') hbMissing += 1;
                        if (d.state === 'dead') dead += 1;
                    }
                });
                return { total: total, ok: ok, alerts: alerts, heartbeatMissing: hbMissing, dead: dead, unknown: unknown };
            });

            var pendingFleetConfirmations = Vue.computed(function () {
                return dataset.devices.filter(function (d) { return Boolean(d.pendingConfirmation); });
            });

            var openAnomaliesCount = Vue.computed(function () {
                return dataset.anomalies.filter(function (a) { return a.status === 'open'; }).length;
            });

            var closedAnomaliesCount = Vue.computed(function () {
                return dataset.anomalies.filter(function (a) { return a.status === 'closed'; }).length;
            });

            var openAlertsCount = Vue.computed(function () {
                return dataset.alerts.filter(function (a) { return a.status === 'open'; }).length;
            });

            var anomalyClauseOptions = Vue.computed(function () {
                return Array.from(new Set(dataset.anomalies.map(function (a) { return a.clause_id; }).filter(Boolean))).sort();
            });

            var eventTypeOptions = Vue.computed(function () {
                return Array.from(new Set(dataset.events.map(function (e) { return e.event_type; }).filter(Boolean))).sort();
            });

            var eventSourceOptions = Vue.computed(function () {
                return Array.from(new Set(dataset.events.map(function (e) { return e.source_id; }).filter(Boolean))).sort();
            });

            // Modèle de la Vue d'ensemble
            var overviewBuilt = Vue.computed(function () {
                return hub.overviewModel.build({
                    loading: false,
                    connected: connected.value,
                    stale: staleOverride.value,
                    fleetKnown: !fleetMissingOverride.value,
                    flowSummary: flowSummary.value,
                    fleetSummary: fleetSummary.value,
                    flows: dataset.flows,
                    devices: fleetMissingOverride.value ? [] : dataset.devices,
                    incidents: dataset.incidents,
                    now: now.value
                });
            });

            var combinedActivity = Vue.computed(function () {
                return hub.activitySelector.selectActivity({
                    events: dataset.events,
                    incidents: dataset.incidents,
                    anomalies: dataset.anomalies,
                    fleetTransitions: dataset.recentTransitions
                }, { limit: 8 });
            });

            // Listes filtrées (avec filtres isolés Flux vs Incidents — Audit #3)
            var filteredFlows = Vue.computed(function () {
                var q = flowFilters.query.trim().toLocaleLowerCase('fr-FR');
                return dataset.flows.filter(function (f) {
                    var statusOk = flowFilters.status === 'all' || f.status === flowFilters.status;
                    var hay = [f.flow_id, f.name, f.source_id, f.connector_id, f.destination_id, f.producer]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return statusOk && (!q || hay.indexOf(q) !== -1);
                }).slice().sort(function (a, b) {
                    var rank = flowFormatters.flowStatusMeta(b.status).rank - flowFormatters.flowStatusMeta(a.status).rank;
                    return rank || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                });
            });

            var filteredIncidents = Vue.computed(function () {
                var q = incidentFilters.query.trim().toLocaleLowerCase('fr-FR');
                return dataset.incidents.filter(function (inc) {
                    var stateOk = incidentFilters.state === 'all'
                        || (incidentFilters.state === 'active' && inc.state !== 'RESOLU' && inc.state !== 'CLOS')
                        || (incidentFilters.state === 'in_progress' && (inc.state === 'OUVERT' || inc.state === 'EN_ANALYSE' || inc.state === 'EN_CORRECTION'))
                        || (incidentFilters.state === 'terminal' && (inc.state === 'RESOLU' || inc.state === 'CLOS'))
                        || inc.state === incidentFilters.state;
                    var flowOk = incidentFilters.flowId === 'all' || inc.flow_id === incidentFilters.flowId;
                    var hay = [inc.incident_id, inc.flow_id, inc.error_signature, inc.clause_id, inc.correlation_key]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return stateOk && flowOk && (!q || hay.indexOf(q) !== -1);
                });
            });

            var filteredDevices = Vue.computed(function () {
                var q = fleetFilters.query.trim().toLocaleLowerCase('fr-FR');
                return dataset.devices.filter(function (d) {
                    var stateOk = fleetFilters.status === 'all'
                        || (fleetFilters.status === 'alerts' && d.state !== 'ok' && d.state !== 'unknown')
                        || d.state === fleetFilters.status;
                    var sourceOk = fleetFilters.source === 'all'
                        || (fleetFilters.source === 'balena' && !d.online)
                        || (fleetFilters.source === 'heartbeat' && !d.hbOk)
                        || (fleetFilters.source === 'field' && d.health && d.health.ok === false)
                        || (fleetFilters.source === 'buffer' && d.buffer && d.buffer.state !== 'ok');
                    var hay = [d.name, d.uuid, d.protocol, d.detail, d.overallStatus]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return stateOk && sourceOk && (!q || hay.indexOf(q) !== -1);
                }).slice().sort(function (a, b) {
                    if (fleetFilters.sort === 'name') {
                        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                    }
                    if (fleetFilters.sort === 'heartbeat') {
                        return (new Date(b.lastHeartbeat).getTime() || 0) - (new Date(a.lastHeartbeat).getTime() || 0);
                    }
                    var rankDiff = formatters.stateMeta(b.state).rank - formatters.stateMeta(a.state).rank;
                    return rankDiff || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                });
            });

            var fleetTotalPages = Vue.computed(function () {
                return Math.max(1, Math.ceil(filteredDevices.value.length / fleetFilters.pageSize));
            });

            var pagedDevices = Vue.computed(function () {
                var currentPage = Math.min(fleetFilters.page, fleetTotalPages.value);
                var start = (currentPage - 1) * fleetFilters.pageSize;
                return filteredDevices.value.slice(start, start + fleetFilters.pageSize);
            });

            Vue.watch(
                [
                    function () { return fleetFilters.query; },
                    function () { return fleetFilters.status; },
                    function () { return fleetFilters.source; },
                    function () { return fleetFilters.sort; },
                    function () { return fleetFilters.pageSize; }
                ],
                function () { fleetFilters.page = 1; }
            );

            var filteredAlerts = Vue.computed(function () {
                var q = alertFilters.query.trim().toLocaleLowerCase('fr-FR');
                return dataset.alerts.filter(function (al) {
                    var statusOk = alertFilters.status === 'all'
                        || (alertFilters.status === 'active' && al.status !== 'closed')
                        || al.status === alertFilters.status;
                    var planOk = alertFilters.plan === 'all' || al.plan === alertFilters.plan;
                    var hay = [al.alert_id, al.subject_name, al.source_id, al.detail, al.incident_id]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return statusOk && planOk && (!q || hay.indexOf(q) !== -1);
                });
            });

            var filteredAnomalies = Vue.computed(function () {
                var q = anomalyFilters.query.trim().toLocaleLowerCase('fr-FR');
                return dataset.anomalies.filter(function (an) {
                    var statusOk = anomalyFilters.status === 'all' || an.status === anomalyFilters.status;
                    var flowOk = anomalyFilters.flowId === 'all' || an.flow_id === anomalyFilters.flowId;
                    var clauseOk = anomalyFilters.clause === 'all' || an.clause_id === anomalyFilters.clause;
                    var hay = [an.anomaly_id, an.flow_id, an.clause_id, an.error_signature]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return statusOk && flowOk && clauseOk && (!q || hay.indexOf(q) !== -1);
                });
            });

            var filteredEvents = Vue.computed(function () {
                var q = eventFilters.query.trim().toLocaleLowerCase('fr-FR');
                return dataset.events.filter(function (ev) {
                    var typeOk = eventFilters.type === 'all' || ev.event_type === eventFilters.type;
                    var sourceOk = eventFilters.source === 'all' || ev.source_id === eventFilters.source;
                    var flowOk = eventFilters.flowId === 'all' || ev.flow_id === eventFilters.flowId;
                    var hay = [ev.event_id, ev.event_type, ev.flow_id, ev.source_id, ev.connector_id, ev.destination_id, ev.error_signature, ev.producer]
                        .join(' ').toLocaleLowerCase('fr-FR');
                    return typeOk && sourceOk && flowOk && (!q || hay.indexOf(q) !== -1);
                });
            });

            // Helpers pour le tiroir d'inspection
            function flowWhyText(flow) {
                if (!flow) return '';
                if (flow.status === 'unknown' && flow.status_reason === 'no_events') {
                    return 'Aucun événement de santé n’a encore été reçu pour ce contrat. L’état opérationnel ne peut pas être confirmé.';
                }
                if (flow.status === 'ok') {
                    return 'Fonctionnement nominal confirmé par le dernier événement de santé sans anomalie ni incident actif.';
                }
                return flowFormatters.reasonLabel(flow.status_reason) + ' sur la chaîne ' + flow.source_id + ' → ' + flow.destination_id + '.';
            }

            function rulesForFlow(flowId) {
                return dataset.rules.filter(function (r) { return r.flow_id === flowId; });
            }

            function alertsForDevice(uuid) {
                return dataset.alerts.filter(function (a) { return a.plan === 'device' && a.source_id === uuid; });
            }

            function lastActionLabel(inc) {
                if (!inc || !inc.actions || !inc.actions.length) return 'Aucune action opérateur';
                var act = inc.actions[0];
                return act.actor + ' : ' + act.comment;
            }

            // Actions métier interactives (Incidents, Alertes, Enrôlement, Admin)
            function submitIncidentNote() {
                var rec = inspected.value && inspected.value.record;
                if (!rec || !operatorForm.actor.trim() || !operatorForm.noteComment.trim()) return;
                rec.actions.unshift({
                    action_id: 'act-' + Date.now(),
                    actor: operatorForm.actor.trim(),
                    kind: 'note',
                    comment: operatorForm.noteComment.trim(),
                    created_at: new Date().toISOString()
                });
                operatorForm.noteComment = '';
                liveAnnouncement.value = 'Note opérateur enregistrée.';
            }

            function submitIncidentTransition() {
                var rec = inspected.value && inspected.value.record;
                if (!rec || !operatorForm.actor.trim() || !operatorForm.transitionTarget) return;
                var fromState = rec.state;
                var toState = operatorForm.transitionTarget;
                rec.state = toState;
                if (toState === 'CLOS') rec.closed_at = new Date().toISOString();
                rec.history.push({
                    history_id: 'h-' + Date.now(),
                    from_state: fromState,
                    to_state: toState,
                    actor: operatorForm.actor.trim(),
                    reason: operatorForm.transitionComment.trim() || 'Transition opérateur',
                    changed_at: new Date().toISOString()
                });
                rec.actions.unshift({
                    action_id: 'act-' + Date.now(),
                    actor: operatorForm.actor.trim(),
                    kind: 'transition',
                    comment: 'Passage à ' + flowFormatters.incidentStateMeta(toState).label + (operatorForm.transitionComment.trim() ? ' — ' + operatorForm.transitionComment.trim() : ''),
                    created_at: new Date().toISOString()
                });
                operatorForm.transitionComment = '';
                var nextAllowed = (INCIDENT_GRAPH[toState] || []).filter(function (s) { return s !== 'RESOLU'; });
                operatorForm.transitionTarget = nextAllowed[0] || '';
                recomputeFlowStatus(rec.flow_id);
                liveAnnouncement.value = 'Incident passé à l’état ' + flowFormatters.incidentStateMeta(toState).label + '.';
            }

            function submitIncidentResolution() {
                var rec = inspected.value && inspected.value.record;
                if (!rec || !operatorForm.actor.trim() || !operatorForm.resolutionComment.trim()) return;
                var fromState = rec.state;
                rec.state = 'RESOLU';
                rec.history.push({
                    history_id: 'h-' + Date.now(),
                    from_state: fromState,
                    to_state: 'RESOLU',
                    actor: operatorForm.actor.trim(),
                    reason: operatorForm.resolutionComment.trim(),
                    changed_at: new Date().toISOString()
                });
                rec.actions.unshift({
                    action_id: 'act-' + Date.now(),
                    actor: operatorForm.actor.trim(),
                    kind: 'resolution',
                    comment: 'Résolution validée : ' + operatorForm.resolutionComment.trim(),
                    created_at: new Date().toISOString()
                });
                operatorForm.resolutionComment = '';
                operatorForm.transitionTarget = 'CLOS';
                recomputeFlowStatus(rec.flow_id);
                liveAnnouncement.value = 'Incident résolu.';
            }

            function recomputeFlowStatus(flowId) {
                var flow = findObject('flow', flowId);
                if (!flow) return;
                var activeIncs = dataset.incidents.filter(function (i) {
                    return i.flow_id === flowId && i.state !== 'RESOLU' && i.state !== 'CLOS';
                });
                var openAnms = dataset.anomalies.filter(function (a) {
                    return a.flow_id === flowId && a.status === 'open';
                });
                if (activeIncs.some(function (i) { return i.state !== 'DETECTE'; })) {
                    flow.status = 'down';
                    flow.status_reason = 'incident_confirmed';
                } else if (activeIncs.length > 0) {
                    flow.status = 'degraded';
                    flow.status_reason = 'incident_detecte';
                } else if (openAnms.length > 0) {
                    flow.status = 'degraded';
                    flow.status_reason = 'anomaly_open';
                } else {
                    flow.status = 'ok';
                    flow.status_reason = 'nominal';
                }
            }

            function acknowledgeInspectedAlert() {
                var rec = inspected.value && inspected.value.record;
                if (!rec || rec.status !== 'open' || !operatorForm.ackActor.trim()) return;
                rec.status = 'acknowledged';
                rec.acknowledged_by = operatorForm.ackActor.trim();
                rec.acknowledged_at = new Date().toISOString();
                rec.updated_at = rec.acknowledged_at;
                rec.history.push({
                    history_id: 'ah-' + Date.now(),
                    at: rec.acknowledged_at,
                    event_type: 'acknowledge',
                    actor: rec.acknowledged_by,
                    reason: 'Accusé de réception opérateur'
                });
                liveAnnouncement.value = 'Alerte acquittée par ' + rec.acknowledged_by + '.';
            }

            function showFlowIncidentsFromTable(flow) {
                incidentFilters.flowId = flow.flow_id;
                incidentFilters.state = 'active';
                navigate('incidents');
            }

            function saveAdminSettings() {
                dataset.admin.fleetName = adminForm.fleetName.trim() || 'Watchdog Hub';
                dataset.admin.balena.appId = adminForm.balenaAppId;
                dataset.admin.mqtt.host = adminForm.mqttHost;
                dataset.admin.mqtt.port = Number(adminForm.mqttPort) || 1883;
                dataset.admin.mqtt.topicPattern = adminForm.mqttTopicPattern;
                dataset.admin.settings.offlineGraceMinutes = Number(adminForm.offlineGraceMinutes);
                dataset.admin.settings.firstSeenGraceMinutes = Number(adminForm.firstSeenGraceMinutes);
                dataset.admin.settings.confirmsRequired = Number(adminForm.confirmsRequired);
                dataset.admin.settings.heartbeatTtlDays = Number(adminForm.heartbeatTtlDays);
                dataset.admin.settings.pollIntervalMs = Number(adminForm.pollIntervalMs);
                adminForm.balenaToken = '';
                adminForm.teamsWebhookUrl = '';
                adminForm.dirty = false;
                adminForm.notice = 'Configuration enregistrée avec succès.';
                setTimeout(function () { adminForm.notice = ''; }, 3500);
            }

            function cancelAdminSettings() {
                adminForm.fleetName = dataset.admin.fleetName;
                adminForm.balenaAppId = dataset.admin.balena.appId;
                adminForm.balenaToken = '';
                adminForm.teamsWebhookUrl = '';
                adminForm.mqttHost = dataset.admin.mqtt.host;
                adminForm.mqttPort = dataset.admin.mqtt.port;
                adminForm.mqttTopicPattern = dataset.admin.mqtt.topicPattern;
                adminForm.offlineGraceMinutes = dataset.admin.settings.offlineGraceMinutes;
                adminForm.firstSeenGraceMinutes = dataset.admin.settings.firstSeenGraceMinutes;
                adminForm.confirmsRequired = dataset.admin.settings.confirmsRequired;
                adminForm.heartbeatTtlDays = dataset.admin.settings.heartbeatTtlDays;
                adminForm.pollIntervalMs = dataset.admin.settings.pollIntervalMs;
                adminForm.dirty = false;
            }

            function submitEnrollDevice() {
                var uuid = enrollForm.uuid.trim();
                if (uuid.length < 6) return;
                var name = enrollForm.name.trim() || ('GW-' + uuid.slice(0, 8).toUpperCase());
                var nowIso = new Date().toISOString();
                dataset.admin.enrolled.unshift({ uuid: uuid, name: name, enrolledAt: nowIso });
                dataset.devices.push({
                    uuid: uuid,
                    name: name,
                    protocol: 'bacnet',
                    state: 'unknown',
                    confirmedState: null,
                    severity: 'unknown',
                    online: false,
                    hbOk: false,
                    lastConnectivity: null,
                    lastHeartbeat: null,
                    overallStatus: 'awaiting_first_signal',
                    detail: 'En attente du premier heartbeat MQTT (appareil pré-déclaré)',
                    gatewayGrace: false,
                    pendingConfirmation: null,
                    heartbeat: null,
                    device: { app: 'Pré-enregistré', host: 'Non communiqué' },
                    health: null,
                    mqtt: null,
                    buffer: null,
                    snapshot: null,
                    supervisor: null,
                    indicators: { bacnet: 'unknown', mqtt: 'unknown', buffer: 'unknown', supervisor: 'unknown' },
                    recentTransitions: [],
                    enrolled: true
                });
                enrollForm.uuid = '';
                enrollForm.name = '';
                enrollOpen.value = false;
                inspectObject('device', uuid);
            }

            function removeEnrolledDevice(uuid) {
                dataset.admin.enrolled = dataset.admin.enrolled.filter(function (e) { return e.uuid !== uuid; });
                dataset.devices = dataset.devices.filter(function (d) { return !(d.uuid === uuid && d.enrolled); });
            }

            // Palette de commandes Ctrl+K (100% Française — Audit #10)
            var paletteDestinations = [
                { kind: 'nav', id: 'overview', typeBadge: 'ÉCRAN', title: 'Vue d’ensemble', subtitle: 'Synthèse des flux, appareils et priorités', meta: '#overview' },
                { kind: 'nav', id: 'flows', typeBadge: 'ÉCRAN', title: 'Flux métier', subtitle: 'Chaînes supervisées et contrats de santé', meta: '#flows' },
                { kind: 'nav', id: 'fleet', typeBadge: 'ÉCRAN', title: 'Appareils', subtitle: 'Passerelles BACnet et Modbus', meta: '#fleet' },
                { kind: 'nav', id: 'alerts', typeBadge: 'ÉCRAN', title: 'Alertes', subtitle: 'Notifications Teams et accusés de réception', meta: '#alerts' },
                { kind: 'nav', id: 'incidents', typeBadge: 'ÉCRAN', title: 'Incidents', subtitle: 'Problèmes corrélés et suivi opérateur', meta: '#incidents' },
                { kind: 'nav', id: 'anomalies', typeBadge: 'ÉCRAN', title: 'Anomalies', subtitle: 'Écarts aux clauses de santé', meta: '#anomalies' },
                { kind: 'nav', id: 'events', typeBadge: 'ÉCRAN', title: 'Événements', subtitle: 'Journal technique immuable et payloads', meta: '#events' },
                { kind: 'nav', id: 'admin', typeBadge: 'ÉCRAN', title: 'Configuration', subtitle: 'Connexions Balena, MQTT, Teams et seuils', meta: '#admin' }
            ];

            var paletteItems = Vue.computed(function () {
                var q = paletteQuery.value.trim().toLocaleLowerCase('fr-FR');
                if (!q) return paletteDestinations;
                var results = [];
                dataset.incidents.forEach(function (inc) {
                    var hay = (inc.incident_id + ' ' + inc.flow_id + ' ' + inc.error_signature).toLocaleLowerCase('fr-FR');
                    if (hay.indexOf(q) !== -1) {
                        results.push({
                            kind: 'object',
                            objectKind: 'incident',
                            id: inc.incident_id,
                            typeBadge: 'INCIDENT',
                            title: inc.incident_id + ' · ' + inc.flow_id,
                            subtitle: inc.error_signature,
                            meta: flowFormatters.incidentStateMeta(inc.state).label
                        });
                    }
                });
                dataset.flows.forEach(function (fl) {
                    var hay = (fl.flow_id + ' ' + fl.name + ' ' + fl.source_id + ' ' + fl.destination_id).toLocaleLowerCase('fr-FR');
                    if (hay.indexOf(q) !== -1) {
                        results.push({
                            kind: 'object',
                            objectKind: 'flow',
                            id: fl.flow_id,
                            typeBadge: 'FLUX',
                            title: fl.name,
                            subtitle: fl.flow_id + ' · ' + fl.source_id + ' → ' + fl.destination_id,
                            meta: flowFormatters.flowStatusMeta(fl.status).label
                        });
                    }
                });
                dataset.devices.forEach(function (dev) {
                    var hay = (dev.name + ' ' + dev.uuid + ' ' + dev.protocol + ' ' + dev.detail).toLocaleLowerCase('fr-FR');
                    if (hay.indexOf(q) !== -1) {
                        results.push({
                            kind: 'object',
                            objectKind: 'device',
                            id: dev.uuid,
                            typeBadge: 'APPAREIL',
                            title: dev.name,
                            subtitle: dev.protocol.toUpperCase() + ' · ' + dev.uuid.slice(0, 12) + '…',
                            meta: formatters.stateMeta(dev.state).label
                        });
                    }
                });
                dataset.alerts.forEach(function (al) {
                    var hay = (al.alert_id + ' ' + al.subject_name + ' ' + al.detail).toLocaleLowerCase('fr-FR');
                    if (hay.indexOf(q) !== -1) {
                        results.push({
                            kind: 'object',
                            objectKind: 'alert',
                            id: al.alert_id,
                            typeBadge: 'ALERTE',
                            title: al.alert_id + ' · ' + al.subject_name,
                            subtitle: al.detail,
                            meta: al.status === 'open' ? 'Ouverte' : (al.status === 'acknowledged' ? 'Acquittée' : 'Close')
                        });
                    }
                });
                dataset.anomalies.forEach(function (an) {
                    var hay = (an.anomaly_id + ' ' + an.flow_id + ' ' + an.error_signature).toLocaleLowerCase('fr-FR');
                    if (hay.indexOf(q) !== -1) {
                        results.push({
                            kind: 'object',
                            objectKind: 'anomaly',
                            id: an.anomaly_id,
                            typeBadge: 'ANOMALIE',
                            title: an.anomaly_id + ' · ' + an.flow_id,
                            subtitle: an.error_signature,
                            meta: an.status === 'open' ? 'Ouverte' : 'Fermée'
                        });
                    }
                });
                dataset.events.forEach(function (ev) {
                    var hay = (ev.event_id + ' ' + ev.flow_id + ' ' + ev.event_type + ' ' + (ev.error_signature || '')).toLocaleLowerCase('fr-FR');
                    if (hay.indexOf(q) !== -1) {
                        results.push({
                            kind: 'object',
                            objectKind: 'event',
                            id: ev.event_id,
                            typeBadge: 'ÉVÉNEMENT',
                            title: ev.event_type + ' · ' + ev.flow_id,
                            subtitle: ev.event_id,
                            meta: ev.status
                        });
                    }
                });
                return results.slice(0, 15);
            });

            function openPalette() {
                rememberOpener();
                paletteOpen.value = true;
                paletteIndex.value = 0;
            }

            function closePalette() {
                paletteOpen.value = false;
                restoreOpenerFocus();
            }

            function selectPaletteItem(item) {
                paletteOpen.value = false;
                paletteQuery.value = '';
                if (!item) return;
                if (item.kind === 'nav') {
                    navigate(item.id, null);
                } else if (item.kind === 'object') {
                    inspectObject(item.objectKind, item.id);
                }
            }

            // Pile d'événements clavier propre : Échap ferme uniquement la couche supérieure + Focus Trap (Audit #8)
            function handleGlobalKeydown(event) {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                    event.preventDefault();
                    if (paletteOpen.value) closePalette();
                    else openPalette();
                    return;
                }
                if (event.key === 'Escape') {
                    if (paletteOpen.value) {
                        event.preventDefault();
                        event.stopPropagation();
                        closePalette();
                        return;
                    }
                    if (enrollOpen.value) {
                        event.preventDefault();
                        event.stopPropagation();
                        enrollOpen.value = false;
                        restoreOpenerFocus();
                        return;
                    }
                    if (inspected.value) {
                        event.preventDefault();
                        event.stopPropagation();
                        closeInspector();
                        return;
                    }
                }
                if (event.key === 'Tab' && anyOverlayOpen.value) {
                    var containerId = paletteOpen.value
                        ? 'palette-dialog-box'
                        : (enrollOpen.value ? 'enroll-dialog-box' : 'inspector-drawer-box');
                    var container = document.getElementById(containerId);
                    if (container) {
                        var nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
                        if (nodes.length > 0) {
                            var first = nodes[0];
                            var last = nodes[nodes.length - 1];
                            if (event.shiftKey && document.activeElement === first) {
                                event.preventDefault();
                                last.focus();
                            } else if (!event.shiftKey && document.activeElement === last) {
                                event.preventDefault();
                                first.focus();
                            }
                        }
                    }
                }
                if (paletteOpen.value) {
                    var len = paletteItems.value.length;
                    if (event.key === 'ArrowDown' && len) {
                        event.preventDefault();
                        paletteIndex.value = (paletteIndex.value + 1) % len;
                    } else if (event.key === 'ArrowUp' && len) {
                        event.preventDefault();
                        paletteIndex.value = (paletteIndex.value - 1 + len) % len;
                    } else if (event.key === 'Enter' && len) {
                        event.preventDefault();
                        selectPaletteItem(paletteItems.value[paletteIndex.value]);
                    }
                }
            }

            function copyCanonicalUrl() {
                var fullUrl = global.location.origin + global.location.pathname + route.value.canonicalHash;
                formatters.copyText(fullUrl).then(function () {
                    copyUrlFeedback.value = 'Lien copié !';
                    setTimeout(function () { copyUrlFeedback.value = ''; }, 2000);
                });
            }

            function copyIdentifier(text) {
                formatters.copyText(text).then(function () {
                    copyIdFeedback.value = 'Copié !';
                    setTimeout(function () { copyIdFeedback.value = ''; }, 2000);
                });
            }

            Vue.onMounted(function () {
                syncFromHash();
                global.addEventListener('hashchange', syncFromHash);
                global.addEventListener('keydown', handleGlobalKeydown);
            });

            Vue.onBeforeUnmount(function () {
                global.removeEventListener('hashchange', syncFromHash);
                global.removeEventListener('keydown', handleGlobalKeydown);
            });

            return {
                now: now,
                dataset: dataset,
                scenario: scenario,
                connected: connected,
                staleOverride: staleOverride,
                fleetMissingOverride: fleetMissingOverride,
                theme: theme,
                route: route,
                urlBarInput: urlBarInput,
                routeNotice: routeNotice,
                inspected: inspected,
                anyOverlayOpen: anyOverlayOpen,
                copyUrlFeedback: copyUrlFeedback,
                copyIdFeedback: copyIdFeedback,
                liveAnnouncement: liveAnnouncement,
                paletteOpen: paletteOpen,
                paletteQuery: paletteQuery,
                paletteIndex: paletteIndex,
                paletteItems: paletteItems,
                enrollOpen: enrollOpen,
                enrollForm: enrollForm,
                flowFilters: flowFilters,
                incidentFilters: incidentFilters,
                fleetFilters: fleetFilters,
                fleetTotalPages: fleetTotalPages,
                pagedDevices: pagedDevices,
                alertFilters: alertFilters,
                anomalyFilters: anomalyFilters,
                anomalyClauseOptions: anomalyClauseOptions,
                eventFilters: eventFilters,
                eventTypeOptions: eventTypeOptions,
                eventSourceOptions: eventSourceOptions,
                operatorForm: operatorForm,
                adminForm: adminForm,
                flowSummary: flowSummary,
                incidentCounts: incidentCounts,
                fleetSummary: fleetSummary,
                pendingFleetConfirmations: pendingFleetConfirmations,
                openAnomaliesCount: openAnomaliesCount,
                closedAnomaliesCount: closedAnomaliesCount,
                openAlertsCount: openAlertsCount,
                overviewBuilt: overviewBuilt,
                combinedActivity: combinedActivity,
                filteredFlows: filteredFlows,
                filteredIncidents: filteredIncidents,
                filteredDevices: filteredDevices,
                filteredAlerts: filteredAlerts,
                filteredAnomalies: filteredAnomalies,
                filteredEvents: filteredEvents,
                INCIDENT_GRAPH: INCIDENT_GRAPH,
                INCIDENT_ORDER: INCIDENT_ORDER,
                toggleTheme: toggleTheme,
                navigate: navigate,
                inspectObject: inspectObject,
                closeInspector: closeInspector,
                smartBack: smartBack,
                goForwardBrowser: goForwardBrowser,
                submitCustomUrlBar: submitCustomUrlBar,
                applyScenario: applyScenario,
                trigger404Demo: trigger404Demo,
                triggerUnknownRouteDemo: triggerUnknownRouteDemo,
                findObject: findObject,
                flowWhyText: flowWhyText,
                rulesForFlow: rulesForFlow,
                alertsForDevice: alertsForDevice,
                lastActionLabel: lastActionLabel,
                submitIncidentNote: submitIncidentNote,
                submitIncidentTransition: submitIncidentTransition,
                submitIncidentResolution: submitIncidentResolution,
                acknowledgeInspectedAlert: acknowledgeInspectedAlert,
                showFlowIncidentsFromTable: showFlowIncidentsFromTable,
                saveAdminSettings: saveAdminSettings,
                cancelAdminSettings: cancelAdminSettings,
                submitEnrollDevice: submitEnrollDevice,
                removeEnrolledDevice: removeEnrolledDevice,
                openPalette: openPalette,
                closePalette: closePalette,
                selectPaletteItem: selectPaletteItem,
                copyCanonicalUrl: copyCanonicalUrl,
                copyIdentifier: copyIdentifier,
                formatDateTime: formatters.formatDateTime,
                formatRelative: function (val) { return formatters.formatRelative(val, now.value); },
                stateMeta: formatters.stateMeta,
                flowStatusMeta: flowFormatters.flowStatusMeta,
                incidentStateMeta: flowFormatters.incidentStateMeta,
                reasonLabel: flowFormatters.reasonLabel,
                indicatorLabel: formatters.indicatorLabel
            };
        },
        template: '#watchdog-prototype-template'
    };

    Vue.createApp(App).mount('#app');
}(window));
