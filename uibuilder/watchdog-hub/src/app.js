(function (global) {
    'use strict';

    var Vue = global.Vue;
    var fleet = global.WatchdogHub;
    var router = fleet.hashRouter;
    var store = fleet.createFleetStore(Vue);
    var flowsStore = fleet.createFlowsStore(Vue);
    var client;
    var flowsClient;

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
                }
                if (view === 'overview' || view === 'flows' || view === 'incidents') loadFlows(false);
            }

            function onHashChange() {
                var route = viewFromHash();
                store.setView(route.view);
                if (route.view === 'overview' || route.view === 'flows' || route.view === 'incidents') {
                    loadFlows(false);
                }
                if (route.incidentId) flowsClient.requestIncident(route.incidentId);
            }

            function announceSnapshot() {
                liveMessage.value = store.state.devices.length + ' appareils chargés.';
            }

            function refresh() {
                store.beginRefresh();
                liveMessage.value = 'Actualisation demandée.';
                client.requestRefresh();
            }

            function retry() {
                liveMessage.value = 'Nouvelle tentative de connexion.';
                client.requestSnapshot();
            }

            function loadFlows(refreshing) {
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

            function showFlowIncidents(flow) {
                flowsStore.state.query = flow.flow_id;
                setView('incidents');
            }

            function selectFlow(flow) {
                selectedFlow.value = flow || null;
            }

            function openCommandPalette() {
                commandPaletteOpen.value = true;
            }

            function handleGlobalKeydown(event) {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                    event.preventDefault();
                    openCommandPalette();
                }
            }

            function handleCommand(command) {
                if (command === 'refresh') {
                    refresh();
                    if (store.state.view === 'overview' || store.state.view === 'incidents' || store.state.view === 'flows') {
                        loadFlows(true);
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
                onFlowsError: flowsStore.setError
            });
            flowsClient = fleet.createFlowsUibuilderClient({
                onError: flowsStore.setError
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
                client.start();
                if (initialRoute.view === 'overview' || initialRoute.view === 'flows' || initialRoute.view === 'incidents') {
                    loadFlows(false);
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
                openIncident: openIncident,
                closeIncident: closeIncident,
                showFlowIncidents: showFlowIncidents,
                selectFlow: selectFlow,
                openCommandPalette: openCommandPalette,
                handleCommand: handleCommand,
                addIncidentNote: addIncidentNote,
                transitionIncident: transitionIncident,
                resolveIncident: resolveIncident,
                resetFilters: resetFilters,
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
                '<fleet-header :fleet-name="fleetName" :generated-at="state.snapshot && state.snapshot.generatedAt" :last-evaluation-at="state.snapshot && state.snapshot.lastEvaluationAt" :next-poll-at="state.snapshot && state.snapshot.nextPollAt" :now="now" :stale="stale" :connected="state.connected === true" :source-status="state.sourceStatus" :flow-summary="flowsState.summary" :fleet-summary="state.summary" :inert="modalOpen ? true : undefined"></fleet-header>' +
                '<app-nav :view="state.view" :incidents="flowsState.summary.incidentsActive || 0" :flows="(flowsState.summary.degraded || 0) + (flowsState.summary.down || 0)" :fleet-alerts="state.summary.alerts || 0" :inert="modalOpen ? true : undefined" @update:view="setView" @open-command="openCommandPalette"></app-nav>' +
                '<main id="main-content" class="dashboard" tabindex="-1" :aria-busy="(state.view === \'overview\' || state.view === \'flows\' || state.view === \'incidents\') ? (flowsState.refreshing || flowsState.mutating ? \'true\' : \'false\') : (state.refreshing || state.adminSaving ? \'true\' : \'false\')" :inert="modalOpen ? true : undefined">' +
                    '<p class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage }}</p>' +
                    '<ui-banner v-if="state.connected === false" kind="warning">Connexion au serveur interrompue. Reconnexion automatique en cours…</ui-banner>' +
                    '<ui-banner v-if="state.view !== \'flows\' && state.lastError && state.snapshot" kind="error">{{ state.lastError }}</ui-banner>' +
                    '<ui-banner v-if="state.view !== \'flows\' && state.notice" kind="info">{{ state.notice }}</ui-banner>' +
                    '<template v-if="state.view === \'admin\'">' +
                        '<admin-page v-if="state.admin" :admin="state.admin" :source-status="state.sourceStatus" :saving="state.adminSaving" :now="now" @save="saveAdmin" @test-teams="testTeams" @unenroll="unenrollDevice" @open-enroll="openEnroll"></admin-page>' +
                        '<state-panel v-else-if="state.loading" kind="loading" title="Chargement de l’administration" message="Récupération de la configuration…" :busy="true"></state-panel>' +
                        '<state-panel v-else kind="error" title="Configuration indisponible" :message="state.lastError || \'Aucun snapshot n’a été reçu.\'" action-label="Réessayer" @retry="retry"></state-panel>' +
                    '</template>' +
                    '<template v-else-if="state.view === \'overview\'">' +
                        '<overview-page :fleet-summary="state.summary" :flow-summary="flowsState.summary" :incidents="flowsState.incidents" :flows="flowsState.flows" :loading="flowsState.loading || flowsState.refreshing" :now="now" @open-incident="openIncident" @open-view="setView"></overview-page>' +
                    '</template>' +
                    '<template v-else-if="state.view === \'flows\' || state.view === \'incidents\'">' +
                        '<flows-page :state="flowsState" :section="state.view" :selected-flow="selectedFlow" :now="now" @refresh="loadFlows(true)" @retry="loadFlows(false)" @select-incident="openIncident" @show-incidents="showFlowIncidents" @select-flow="selectFlow"></flows-page>' +
                    '</template>' +
                    '<template v-else-if="state.snapshot">' +
                        '<fleet-kpis :summary="state.summary" :loading="state.refreshing"></fleet-kpis>' +
                        '<fleet-activity :transitions="state.recentTransitions" :pending="state.pendingConfirmations" :now="now"></fleet-activity>' +
                        '<filter-bar :query="state.query" :status="state.statusFilter" :source="state.sourceFilter" :sort="state.sortBy" :refreshing="state.refreshing" results-id="fleet-device-results" @update:query="state.query = $event" @update:status="state.statusFilter = $event" @update:source="state.sourceFilter = $event" @update:sort="state.sortBy = $event" @refresh="refresh" @reset="resetFilters"></filter-bar>' +
                        '<p class="results-summary" aria-live="polite" aria-atomic="true">{{ filteredDevices.length }} appareil{{ filteredDevices.length > 1 ? \'s\' : \'\' }} affiché{{ filteredDevices.length > 1 ? \'s\' : \'\' }} sur {{ state.devices.length }}<span v-if="state.refreshing"> — Actualisation…</span></p>' +
                        '<div id="fleet-device-results">' +
                            '<device-list v-if="filteredDevices.length" :devices="pagedDevices" :now="now" :sort="state.sortBy" :refreshing="state.refreshing" @select="openDetail" @update:sort="state.sortBy = $event"></device-list>' +
                            '<pagination-controls v-if="filteredDevices.length" :page="page" :page-size="pageSize" :total="filteredDevices.length" @update:page="page = $event" @update:page-size="pageSize = $event"></pagination-controls>' +
                            '<state-panel v-else-if="state.devices.length" title="Aucun résultat" message="Aucun appareil ne correspond aux critères actuels." action-label="Réinitialiser les filtres" @retry="resetFilters"></state-panel>' +
                            '<state-panel v-else title="Flotte vide" message="Le snapshot ne contient aucun appareil. Utilisez Administration → Connecter un appareil." action-label="Ouvrir l’administration" @retry="setView(\'admin\')"></state-panel>' +
                        '</div>' +
                    '</template>' +
                    '<state-panel v-else-if="state.loading" kind="loading" title="Chargement de la flotte" message="Connexion au flux de supervision…" :busy="true"></state-panel>' +
                    '<state-panel v-else kind="error" title="Données indisponibles" :message="state.lastError || \'Aucun snapshot n’a été reçu.\'" action-label="Réessayer" @retry="retry"></state-panel>' +
                '</main>' +
                '<device-detail v-if="state.selectedDevice" :device="state.selectedDevice" :opener="detailOpener" @close="closeDetail"></device-detail>' +
                '<enroll-wizard v-if="enrollOpen" :opener="enrollOpener" :mqtt="(state.admin && state.admin.mqtt) || {}" @close="closeEnroll" @enroll="enrollDevice"></enroll-wizard>' +
                '<incident-detail v-if="flowsState.selectedIncident" :detail="flowsState.selectedIncident" :opener="incidentOpener" :busy="flowsState.mutating" @close="closeIncident" @note="addIncidentNote" @transition="transitionIncident" @resolve="resolveIncident"></incident-detail>' +
                '<command-palette v-if="commandPaletteOpen" @close="commandPaletteOpen = false" @command="handleCommand"></command-palette>' +
            '</div>'
    };

    var app = Vue.createApp(Root);
    Object.keys(fleet.components).forEach(function (name) {
        app.component(name, fleet.components[name]);
    });
    app.mount('#app');
}(window));
