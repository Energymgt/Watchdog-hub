(function (global) {
    'use strict';

    var Vue = global.Vue;
    var fleet = global.WatchdogHub;
    var router = fleet.hashRouter;
    var store = fleet.createFleetStore(Vue);
    var flowsStore = fleet.createFlowsStore(Vue);
    var anomaliesStore = fleet.createAnomaliesStore(Vue);
    var eventsStore = fleet.createEventsStore(Vue);
    var client;
    var flowsClient;
    var anomaliesClient;
    var eventsClient;

    var Root = {
        name: 'WatchdogHubApp',
        setup: function () {
            var now = Vue.ref(Date.now());
            var detailOpener = Vue.ref(null);
            var liveMessage = Vue.ref('');
            var page = Vue.ref(1);
            var pageSize = Vue.ref(50);
            var enrollOpen = Vue.ref(false);
            var enrollOpener = Vue.ref(null);
            var incidentOpener = Vue.ref(null);
            var commandPaletteOpen = Vue.ref(false);
            var selectedFlow = Vue.ref(null);
            var timerId;
            var activity = Vue.computed(function () {
                return fleet.activitySelector.selectActivity({
                    events: eventsStore.state.events,
                    incidents: flowsStore.state.incidents,
                    anomalies: anomaliesStore.state.anomalies,
                    fleetTransitions: store.state.recentTransitions
                }, { limit: 8 });
            });
            var activityPartial = Vue.computed(function () {
                return !store.state.snapshot || !flowsStore.state.snapshot
                    || !anomaliesStore.state.snapshot || !eventsStore.state.snapshot;
            });
            var commandPaletteItems = Vue.computed(function () {
                return fleet.commandPaletteSelector.buildSearchItems({
                    incidents: flowsStore.state.incidents,
                    flows: flowsStore.state.flows,
                    anomalies: anomaliesStore.state.anomalies,
                    events: eventsStore.state.events,
                    devices: store.state.devices
                });
            });

            var stale = Vue.computed(function () {
                return Boolean(store.state.snapshot && fleet.formatters.isSnapshotStale(
                    store.state.snapshot.generatedAt,
                    store.state.snapshot.grace,
                    now.value
                ));
            });

            var filteredDevices = Vue.computed(function () {
                var query = store.state.query.trim().toLocaleLowerCase('fr-FR');
                var filtered = store.state.devices.filter(function (device) {
                    var matchesState = store.state.statusFilter === 'all' || device.state === store.state.statusFilter;
                    var matchesSource = store.state.sourceFilter === 'all'
                        || (store.state.sourceFilter === 'balena' && !device.online)
                        || (store.state.sourceFilter === 'heartbeat' && !device.hbOk)
                        || (store.state.sourceFilter === 'bacnet' && device.health && device.health.ok === false)
                        || (store.state.sourceFilter === 'buffer' && device.buffer && device.buffer.state !== 'ok');
                    var haystack = [device.name, device.uuid, device.detail, device.overallStatus]
                        .join(' ')
                        .toLocaleLowerCase('fr-FR');
                    return matchesState && matchesSource && (!query || haystack.indexOf(query) !== -1);
                });

                return filtered.slice().sort(function (a, b) {
                    if (store.state.sortBy === 'name') {
                        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                    }
                    if (store.state.sortBy === 'connectivity') {
                        return (new Date(b.lastConnectivity).getTime() || 0) - (new Date(a.lastConnectivity).getTime() || 0);
                    }
                    var rankDifference = fleet.formatters.stateMeta(b.state).rank - fleet.formatters.stateMeta(a.state).rank;
                    return rankDifference || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
                });
            });
            var pagedDevices = Vue.computed(function () {
                var start = (page.value - 1) * pageSize.value;
                return filteredDevices.value.slice(start, start + pageSize.value);
            });

            Vue.watch([
                function () { return store.state.query; },
                function () { return store.state.statusFilter; },
                function () { return store.state.sourceFilter; },
                function () { return store.state.sortBy; },
                pageSize
            ], function () {
                page.value = 1;
            });
            Vue.watch(function () { return filteredDevices.value.length; }, function (total) {
                var maxPage = Math.max(1, Math.ceil(total / pageSize.value));
                if (page.value > maxPage) page.value = maxPage;
            });

            var fleetName = Vue.computed(function () {
                return (store.state.admin && store.state.admin.fleetName) || 'Watchdog Hub';
            });

            function viewFromHash() {
                return router.parse(global.location.hash);
            }

            function setView(view, incidentId) {
                store.setView(view);
                var nextHash = router.format(view, incidentId);
                if (global.location.hash !== nextHash) {
                    global.location.hash = nextHash;
                    return;
                }
                if (view === 'overview' || view === 'flows' || view === 'incidents') loadFlows(false);
                if (view === 'anomalies') loadAnomalies(false);
                if (view === 'events') loadEvents(false);
                if (view === 'overview') {
                    loadAnomalies(false);
                    loadEvents(false);
                }
            }

            function openView(view, item) {
                if (view === 'flows' && item && item.flow_id) selectFlow(item);
                if (view === 'flows' && item && item.navigation && item.navigation.flowId) {
                    var flow = flowsStore.state.flows.filter(function (candidate) {
                        return candidate.flow_id === item.navigation.flowId;
                    })[0];
                    selectFlow(flow || null);
                }
                if (view === 'incidents' && item && item.navigation && item.navigation.incidentId) {
                    setView(view, item.navigation.incidentId);
                    return;
                }
                setView(view);
            }

            function onHashChange() {
                var route = viewFromHash();
                store.setView(route.view);
                if (route.view === 'overview' || route.view === 'flows' || route.view === 'incidents') {
                    loadFlows(false);
                }
                if (route.view === 'anomalies') loadAnomalies(false);
                if (route.view === 'events') loadEvents(false);
                if (route.view === 'overview') {
                    loadAnomalies(false);
                    loadEvents(false);
                }
                if (route.incidentId) flowsClient.requestIncident(route.incidentId);
            }

            function announceSnapshot() {
                liveMessage.value = store.state.devices.length + ' appareils chargés.';
            }

            function refresh() {
                if (store.state.refreshing) return;
                store.beginRefresh();
                liveMessage.value = 'Actualisation demandée.';
                client.requestRefresh();
            }

            function retry() {
                liveMessage.value = 'Nouvelle tentative de connexion.';
                client.requestSnapshot();
            }

            function loadFlows(refreshing) {
                if (flowsStore.state.loading || flowsStore.state.refreshing) return;
                flowsStore.beginLoad();
                if (refreshing) {
                    liveMessage.value = 'Actualisation des flux demandée.';
                    flowsClient.requestRefresh();
                } else {
                    flowsClient.requestSnapshot();
                }
            }

            function openIncident(incident, opener) {
                incidentOpener.value = opener || null;
                flowsStore.beginMutation();
                flowsClient.requestIncident(incident.incident_id);
                if (store.state.view !== 'incidents' || router.parse(global.location.hash).incidentId !== incident.incident_id) {
                    global.location.hash = router.format('incidents', incident.incident_id);
                }
            }

            function closeIncident() {
                flowsStore.selectIncident(null);
                if (router.parse(global.location.hash).incidentId) {
                    global.location.hash = router.format('incidents');
                }
            }

            function openRelated(item) {
                if (!item || item.target_kind !== 'flow') return;
                var flow = flowsStore.state.flows.filter(function (candidate) {
                    return candidate.flow_id === item.target_id;
                })[0];
                closeIncident();
                selectFlow(flow || null);
                setView('flows');
            }

            function openIncidentFlow(flowId) {
                var flow = flowsStore.state.flows.filter(function (candidate) {
                    return candidate.flow_id === flowId;
                })[0];
                flowsStore.selectIncident(null);
                if (flow) selectFlow(flow);
                setView('flows');
            }

            function showFlowIncidents(flow) {
                flowsStore.state.query = flow.flow_id;
                setView('incidents');
            }

            function selectFlow(flow) {
                selectedFlow.value = flow || null;
            }

            function loadAnomalies(refreshing) {
                if (anomaliesStore.state.loading || anomaliesStore.state.refreshing) return;
                anomaliesStore.beginLoad();
                if (refreshing) {
                    liveMessage.value = 'Actualisation des anomalies demandée.';
                }
                anomaliesClient.requestSnapshot();
            }

            function selectAnomaly(anomaly) {
                anomaliesStore.beginLoad();
                anomaliesClient.requestDetail(anomaly.anomaly_id);
            }

            function selectAnomalyFlow(flow) {
                selectFlow(flow && flow.flow_id ? flow : null);
                setView('flows');
            }

            function openAnomalyFromFlow(anomaly) {
                setView('anomalies');
                selectAnomaly(anomaly);
            }

            function loadEvents(refreshing) {
                if (eventsStore.state.loading || eventsStore.state.refreshing) return;
                eventsStore.beginLoad();
                if (refreshing) {
                    liveMessage.value = 'Actualisation des événements demandée.';
                }
                eventsClient.requestSnapshot();
            }

            function selectEvent(event) {
                eventsStore.beginLoad();
                eventsClient.requestDetail(event.event_id);
            }

            function selectEventFlow(flow) {
                selectFlow(flow && flow.flow_id ? flow : null);
                setView('flows');
            }

            function openEventFromFlow(event) {
                setView('events');
                selectEvent(event);
            }

            function openEventFromAnomaly(event) {
                openEventFromFlow(event);
            }

            function openCommandPalette() {
                commandPaletteOpen.value = true;
            }

            function openPaletteResult(item) {
                if (!item || !item.navigation) return;
                var view = item.navigation.view;
                if (view === 'incidents') {
                    openIncident({ incident_id: item.id });
                    return;
                }
                if (view === 'flows') {
                    var flow = flowsStore.state.flows.filter(function (candidate) {
                        return candidate.flow_id === item.id;
                    })[0];
                    selectFlow(flow || null);
                    setView(view);
                    return;
                }
                if (view === 'anomalies') {
                    setView(view);
                    var anomaly = anomaliesStore.state.anomalies.filter(function (candidate) {
                        return candidate.anomaly_id === item.id;
                    })[0];
                    if (anomaly) anomaliesStore.selectAnomaly(anomaly);
                    return;
                }
                if (view === 'events') {
                    setView(view);
                    var event = eventsStore.state.events.filter(function (candidate) {
                        return candidate.event_id === item.id;
                    })[0];
                    if (event) eventsStore.selectEvent(event);
                    return;
                }
                if (view === 'fleet') {
                    setView(view);
                    var device = store.state.devices.filter(function (candidate) {
                        return candidate.uuid === item.id;
                    })[0];
                    if (device) openDetail(device);
                }
            }

            function handleGlobalKeydown(event) {
                if (event.key === 'Escape' && eventsStore.state.selectedEvent) {
                    eventsStore.selectEvent(null);
                    return;
                }
                if (event.key === 'Escape' && store.state.selectedDevice) {
                    closeDetail();
                    return;
                }
                if (event.key === 'Escape' && anomaliesStore.state.selectedAnomaly) {
                    anomaliesStore.selectAnomaly(null);
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                    event.preventDefault();
                    openCommandPalette();
                }
            }

            function handleCommand(command) {
                if (command && command.kind === 'result') {
                    openPaletteResult(command.item);
                    return;
                }
                if (command && command.kind === 'navigate') command = command.view;
                if (command === 'refresh') {
                    refresh();
                    if (store.state.view === 'overview' || store.state.view === 'incidents' || store.state.view === 'flows') {
                        loadFlows(true);
                    }
                    if (store.state.view === 'anomalies') loadAnomalies(true);
                    if (store.state.view === 'events') loadEvents(true);
                    if (store.state.view === 'overview') {
                        loadAnomalies(true);
                        loadEvents(true);
                    }
                    return;
                }
                setView(command);
                if (command === 'incidents' || command === 'flows') {
                    Vue.nextTick(function () {
                        var search = global.document.getElementById('flows-search');
                        if (search) search.focus();
                    });
                }
            }

            function addIncidentNote(data) {
                flowsStore.beginMutation();
                liveMessage.value = 'Enregistrement de la note.';
                flowsClient.addAction(data);
            }

            function transitionIncident(data) {
                flowsStore.beginMutation();
                liveMessage.value = 'Mise à jour de l’incident.';
                flowsClient.transitionIncident(data);
            }

            function resolveIncident(data) {
                flowsStore.beginMutation();
                liveMessage.value = 'Enregistrement de la résolution.';
                flowsClient.resolveIncident(data);
            }

            function resetFilters() {
                store.state.query = '';
                store.state.statusFilter = 'all';
                store.state.sourceFilter = 'all';
                store.state.sortBy = 'severity';
            }

            function setFleetStatus(status) {
                store.state.statusFilter = status;
            }

            function openDetail(device, opener) {
                detailOpener.value = opener;
                store.selectDevice(device);
            }

            function closeDetail() {
                store.selectDevice(null);
            }

            function saveAdmin(data) {
                store.beginAdminSave();
                liveMessage.value = 'Enregistrement de la configuration.';
                client.saveAdmin(data);
            }

            function testTeams() {
                liveMessage.value = 'Carte Teams de test demandée.';
                client.testTeams();
            }

            function openEnroll(event) {
                enrollOpener.value = event && event.currentTarget ? event.currentTarget : null;
                enrollOpen.value = true;
            }

            function closeEnroll() {
                enrollOpen.value = false;
            }

            function enrollDevice(payload) {
                liveMessage.value = 'Enregistrement de l’appareil.';
                client.enrollDevice(payload);
                enrollOpen.value = false;
            }

            function unenrollDevice(uuid) {
                liveMessage.value = 'Retrait de l’appareil manuel.';
                client.unenrollDevice(uuid);
            }

            var modalOpen = Vue.computed(function () {
                return Boolean(store.state.selectedDevice)
                    || Boolean(flowsStore.state.selectedIncident)
                    || enrollOpen.value
                    || commandPaletteOpen.value;
            });

            client = fleet.createUibuilderClient({
                onSnapshot: function (payload) {
                    if (store.acceptSnapshot(payload)) announceSnapshot();
                },
                onConnection: function (connected) {
                    var wasConnected = store.state.connected;
                    store.setConnected(connected);
                    if (wasConnected !== null && wasConnected !== connected) {
                        liveMessage.value = connected ? 'Connexion rétablie.' : 'Connexion interrompue. Reconnexion en cours.';
                    }
                },
                onError: store.setClientError,
                onFlowsSnapshot: function (payload) {
                    var selected = flowsStore.state.selectedIncident
                        && flowsStore.state.selectedIncident.incident;
                    if (flowsStore.acceptSnapshot(payload)) {
                        liveMessage.value = flowsStore.state.flows.length + ' flux chargés.';
                        if (selected) flowsClient.requestIncident(selected.incident_id);
                    }
                },
                onFlowsIncident: function (payload) {
                    if (flowsStore.acceptIncident(payload)) {
                        liveMessage.value = 'Détail de l’incident chargé.';
                    }
                },
                onFlowsError: flowsStore.setError,
                onAnomaliesSnapshot: function (payload) {
                    if (anomaliesStore.acceptSnapshot(payload)) {
                        liveMessage.value = anomaliesStore.state.anomalies.length + ' anomalies chargées.';
                    }
                },
                onAnomaliesDetail: function (payload) {
                    if (anomaliesStore.acceptDetail(payload)) {
                        liveMessage.value = 'Détail de l’anomalie chargé.';
                    }
                },
                onAnomaliesError: anomaliesStore.setError,
                onEventsSnapshot: function (payload) {
                    if (eventsStore.acceptSnapshot(payload)) {
                        liveMessage.value = eventsStore.state.events.length + ' événements chargés.';
                    }
                },
                onEventsDetail: function (payload) {
                    if (eventsStore.acceptDetail(payload)) {
                        liveMessage.value = 'Détail de l’événement chargé.';
                    }
                },
                onEventsError: eventsStore.setError
            });
            flowsClient = fleet.createFlowsUibuilderClient({
                onError: flowsStore.setError
            });
            anomaliesClient = fleet.createAnomaliesUibuilderClient({
                onError: anomaliesStore.setError
            });
            eventsClient = fleet.createEventsUibuilderClient({
                onError: eventsStore.setError
            });

            Vue.onMounted(function () {
                var initialRoute = viewFromHash();
                store.setView(initialRoute.view);
                global.addEventListener('hashchange', onHashChange);
                global.addEventListener('keydown', handleGlobalKeydown);
                timerId = global.setInterval(function () {
                    now.value = Date.now();
                }, 15000);
                flowsClient.start();
                anomaliesClient.start();
                eventsClient.start();
                client.start();
                if (initialRoute.view === 'overview' || initialRoute.view === 'flows' || initialRoute.view === 'incidents') {
                    loadFlows(false);
                }
                if (initialRoute.view === 'anomalies') loadAnomalies(false);
                if (initialRoute.view === 'events') loadEvents(false);
                if (initialRoute.view === 'overview') {
                    loadAnomalies(false);
                    loadEvents(false);
                }
                if (initialRoute.incidentId) flowsClient.requestIncident(initialRoute.incidentId);
            });

            Vue.onBeforeUnmount(function () {
                global.removeEventListener('hashchange', onHashChange);
                global.removeEventListener('keydown', handleGlobalKeydown);
                global.clearInterval(timerId);
            });

            return {
                state: store.state,
                flowsState: flowsStore.state,
                anomaliesState: anomaliesStore.state,
                eventsState: eventsStore.state,
                activity: activity,
                commandPaletteItems: commandPaletteItems,
                now: now,
                stale: stale,
                fleetName: fleetName,
                modalOpen: modalOpen,
                enrollOpen: enrollOpen,
                commandPaletteOpen: commandPaletteOpen,
                enrollOpener: enrollOpener,
                incidentOpener: incidentOpener,
                selectedFlow: selectedFlow,
                filteredDevices: filteredDevices,
                pagedDevices: pagedDevices,
                page: page,
                pageSize: pageSize,
                detailOpener: detailOpener,
                liveMessage: liveMessage,
                setView: setView,
                refresh: refresh,
                retry: retry,
                loadFlows: loadFlows,
                openView: openView,
                openIncident: openIncident,
                openIncidentFlow: openIncidentFlow,
                closeIncident: closeIncident,
                showFlowIncidents: showFlowIncidents,
                selectFlow: selectFlow,
                openAnomalyFromFlow: openAnomalyFromFlow,
                openEventFromFlow: openEventFromFlow,
                openEventFromAnomaly: openEventFromAnomaly,
                openCommandPalette: openCommandPalette,
                handleCommand: handleCommand,
                addIncidentNote: addIncidentNote,
                transitionIncident: transitionIncident,
                resolveIncident: resolveIncident,
                resetFilters: resetFilters,
                setFleetStatus: setFleetStatus,
                openDetail: openDetail,
                closeDetail: closeDetail,
                saveAdmin: saveAdmin,
                testTeams: testTeams,
                openEnroll: openEnroll,
                closeEnroll: closeEnroll,
                enrollDevice: enrollDevice,
                unenrollDevice: unenrollDevice
            };
        },
        template:
            '<div class="app-shell">' +
                '<fleet-header :fleet-name="fleetName" :generated-at="state.snapshot && state.snapshot.generatedAt" :last-evaluation-at="state.snapshot && state.snapshot.lastEvaluationAt" :next-poll-at="state.snapshot && state.snapshot.nextPollAt" :now="now" :stale="stale" :connected="state.connected === true" :source-status="state.sourceStatus" :flow-summary="flowsState.summary" :fleet-summary="state.summary" :inert="modalOpen ? true : undefined" @open-command="openCommandPalette"></fleet-header>' +
                '<app-nav :view="state.view" :incidents="flowsState.summary.incidentsActive || 0" :flows="(flowsState.summary.degraded || 0) + (flowsState.summary.down || 0)" :anomalies="anomaliesState.anomalies.filter(function (anomaly) { return anomaly.status === \'open\'; }).length" :events="eventsState.events.length" :fleet-alerts="state.summary.alerts || 0" :inert="modalOpen ? true : undefined" @update:view="setView"></app-nav>' +
                '<main id="main-content" class="dashboard" tabindex="-1" :aria-busy="(state.view === \'overview\' || state.view === \'flows\' || state.view === \'incidents\') ? (flowsState.refreshing || flowsState.mutating ? \'true\' : \'false\') : (state.view === \'anomalies\' ? (anomaliesState.refreshing ? \'true\' : \'false\') : (state.view === \'events\' ? (eventsState.refreshing ? \'true\' : \'false\') : (state.refreshing || state.adminSaving ? \'true\' : \'false\')))" :inert="modalOpen ? true : undefined">' +
                    '<p class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage }}</p>' +
                    '<ui-banner v-if="state.connected === false" kind="warning">Connexion au serveur interrompue. Reconnexion automatique en cours…</ui-banner>' +
                    '<ui-banner v-if="state.view !== \'flows\' && state.lastError && state.snapshot" kind="error">{{ state.lastError }}</ui-banner>' +
                    '<ui-banner v-if="state.view !== \'flows\' && state.notice" kind="info">{{ state.notice }}</ui-banner>' +
                    '<template v-if="state.view === \'admin\'">' +
                        '<admin-page v-if="state.admin" :admin="state.admin" :source-status="state.sourceStatus" :saving="state.adminSaving" :notice="state.notice" :error="state.lastError" :now="now" @save="saveAdmin" @test-teams="testTeams" @unenroll="unenrollDevice" @open-enroll="openEnroll"></admin-page>' +
                        '<state-panel v-else-if="state.loading" kind="loading" title="Chargement de l’administration" message="Récupération de la configuration…" :busy="true"></state-panel>' +
                        '<state-panel v-else kind="error" title="Configuration indisponible" :message="state.lastError || \'Aucun snapshot n’a été reçu.\'" action-label="Réessayer" @retry="retry"></state-panel>' +
                    '</template>' +
                    '<template v-else-if="state.view === \'overview\'">' +
                        '<overview-page :fleet-summary="state.summary" :flow-summary="flowsState.summary" :incidents="flowsState.incidents" :flows="flowsState.flows" :activity="activity" :activity-partial="activityPartial" :recent-transitions="state.recentTransitions" :loading="flowsState.loading || flowsState.refreshing" :connected="state.connected === true" :stale="stale" :now="now" @open-incident="openIncident" @open-view="openView"></overview-page>' +
                    '</template>' +
                    '<template v-else-if="state.view === \'flows\' || state.view === \'incidents\'">' +
                        '<flows-page :state="flowsState" :section="state.view" :selected-flow="selectedFlow" :anomalies="anomaliesState.anomalies" :events="eventsState.events" :now="now" @refresh="loadFlows(true)" @retry="loadFlows(false)" @select-incident="openIncident" @select-anomaly="openAnomalyFromFlow" @select-event="openEventFromFlow" @show-incidents="showFlowIncidents" @select-flow="selectFlow"></flows-page>' +
                    '</template>' +
                    '<template v-else-if="state.view === \'anomalies\'">' +
                        '<anomalies-page :state="anomaliesState" :flows="flowsState.flows" :events="eventsState.events" @refresh="loadAnomalies(true)" @retry="loadAnomalies(false)" @select-anomaly="selectAnomaly" @select-flow="selectAnomalyFlow" @select-event="openEventFromAnomaly"></anomalies-page>' +
                    '</template>' +
                    '<template v-else-if="state.view === \'events\'">' +
                        '<events-page :state="eventsState" :flows="flowsState.flows" @refresh="loadEvents(true)" @retry="loadEvents(false)" @select-event="selectEvent" @select-flow="selectEventFlow"></events-page>' +
                    '</template>' +
                    '<template v-else-if="state.snapshot">' +
                        '<section class="fleet-command-center" aria-labelledby="fleet-command-title">' +
                        '<div class="workspace-heading"><p class="eyebrow">Supervision infrastructure</p><h2 id="fleet-command-title">Fleet Command Center</h2><p>État des appareils, connectivité et activité récente à partir du snapshot courant.</p></div>' +
                        '<fleet-kpis :summary="state.summary" :loading="state.refreshing" @filter-status="setFleetStatus"></fleet-kpis>' +
                        '<div class="fleet-devices-heading"><h2>Appareils à surveiller</h2><p>Les appareils nécessitant une attention apparaissent en premier selon leur état courant.</p></div>' +
                        '<filter-bar :query="state.query" :status="state.statusFilter" :source="state.sourceFilter" :sort="state.sortBy" :refreshing="state.refreshing" results-id="fleet-device-results" @update:query="state.query = $event" @update:status="state.statusFilter = $event" @update:source="state.sourceFilter = $event" @update:sort="state.sortBy = $event" @refresh="refresh" @reset="resetFilters"></filter-bar>' +
                        '<p class="results-summary" aria-live="polite" aria-atomic="true">{{ filteredDevices.length }} appareil{{ filteredDevices.length > 1 ? \'s\' : \'\' }} affiché{{ filteredDevices.length > 1 ? \'s\' : \'\' }} sur {{ state.devices.length }}<span v-if="state.refreshing"> — Actualisation…</span></p>' +
                        '<div id="fleet-device-results">' +
                            '<device-list v-if="filteredDevices.length" :devices="pagedDevices" :now="now" :sort="state.sortBy" :refreshing="state.refreshing" @select="openDetail" @update:sort="state.sortBy = $event"></device-list>' +
                            '<pagination-controls v-if="filteredDevices.length" :page="page" :page-size="pageSize" :total="filteredDevices.length" @update:page="page = $event" @update:page-size="pageSize = $event"></pagination-controls>' +
                            '<state-panel v-else-if="state.devices.length" title="Aucun résultat" message="Aucun appareil ne correspond aux critères actuels." action-label="Réinitialiser les filtres" @retry="resetFilters"></state-panel>' +
                            '<state-panel v-else title="Flotte vide" message="Le snapshot ne contient aucun appareil. Utilisez Administration → Connecter un appareil." action-label="Ouvrir l’administration" @retry="setView(\'admin\')"></state-panel>' +
                        '</div>' +
                        '<fleet-activity :transitions="state.recentTransitions" :pending="state.pendingConfirmations" :now="now"></fleet-activity>' +
                        '</section>' +
                    '</template>' +
                    '<state-panel v-else-if="state.loading" kind="loading" title="Chargement de la flotte" message="Connexion au flux de supervision…" :busy="true"></state-panel>' +
                    '<state-panel v-else kind="error" title="Données indisponibles" :message="state.lastError || \'Aucun snapshot n’a été reçu.\'" action-label="Réessayer" @retry="retry"></state-panel>' +
                '</main>' +
                '<device-detail v-if="state.selectedDevice" :device="state.selectedDevice" :opener="detailOpener" @close="closeDetail"></device-detail>' +
                '<enroll-wizard v-if="enrollOpen" :opener="enrollOpener" :mqtt="(state.admin && state.admin.mqtt) || {}" @close="closeEnroll" @enroll="enrollDevice"></enroll-wizard>' +
                '<incident-detail v-if="flowsState.selectedIncident" :detail="flowsState.selectedIncident" :opener="incidentOpener" :busy="flowsState.mutating" @close="closeIncident" @note="addIncidentNote" @transition="transitionIncident" @resolve="resolveIncident" @open-related="openRelated" @open-flow="openIncidentFlow"></incident-detail>' +
                '<command-palette v-if="commandPaletteOpen" :items="commandPaletteItems" @close="commandPaletteOpen = false" @command="handleCommand"></command-palette>' +
            '</div>'
    };

    var app = Vue.createApp(Root);
    Object.keys(fleet.components).forEach(function (name) {
        app.component(name, fleet.components[name]);
    });
    app.mount('#app');
}(window));
