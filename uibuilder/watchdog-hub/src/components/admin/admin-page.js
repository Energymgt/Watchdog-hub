(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    function emptyForm() {
        return {
            fleetName: 'Watchdog Hub',
            balenaAppId: '',
            balenaToken: '',
            teamsWebhookUrl: '',
            mqttHost: 'iot.energymgt.io',
            mqttPort: 1883,
            mqttTopicPattern: 'bacnet/gateway/{uuid}/heartbeat',
            heartbeatTtlDays: 30,
            offlineGraceMinutes: 5,
            firstSeenGraceMinutes: 5,
            confirmsRequired: 2,
            pollIntervalMs: 120000
        };
    }

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.AdminPage = {
        name: 'AdminPage',
        emits: ['save', 'test-teams', 'unenroll', 'open-enroll'],
        props: {
            admin: { type: Object, default: null },
            sourceStatus: { type: Object, default: function () { return {}; } },
            saving: { type: Boolean, default: false },
            notice: { type: String, default: '' },
            error: { type: String, default: '' },
            now: { type: Number, default: Date.now }
        },
        data: function () {
            return { form: emptyForm(), dirty: false };
        },
        watch: {
            admin: {
                deep: true,
                handler: function () {
                    if (!this.dirty) this.hydrate();
                }
            }
        },
        mounted: function () {
            this.hydrate();
        },
        computed: {
            balena: function () {
                return (this.admin && this.admin.balena) || {};
            },
            teams: function () {
                return (this.admin && this.admin.teams) || {};
            },
            mqtt: function () {
                return (this.admin && this.admin.mqtt) || {};
            },
            enrolled: function () {
                return (this.admin && Array.isArray(this.admin.enrolled)) ? this.admin.enrolled : [];
            },
            balenaTone: function () {
                return this.balena.configured ? 'ok' : 'unknown';
            },
            teamsTone: function () {
                if (!this.teams.configured) return 'unknown';
                return this.sourceStatus.teams && this.sourceStatus.teams.lastError ? 'heartbeat_missing' : 'ok';
            },
            teamsStatusLabel: function () {
                if (!this.teams.configured) return 'À configurer';
                return this.sourceStatus.teams && this.sourceStatus.teams.lastError ? 'Erreur' : 'Connecté';
            },
            mqttTone: function () {
                return this.sourceStatus.mqtt && this.sourceStatus.mqtt.ok ? 'ok' : 'heartbeat_missing';
            },
            validationErrors: function () {
                var errors = {};
                if (!this.form.fleetName.trim()) errors.fleetName = 'Le nom de la flotte est obligatoire.';
                if (Number(this.form.mqttPort) < 1 || Number(this.form.mqttPort) > 65535) errors.mqttPort = 'Le port doit être compris entre 1 et 65535.';
                if (Number(this.form.offlineGraceMinutes) < 1 || Number(this.form.offlineGraceMinutes) > 60) errors.offlineGraceMinutes = 'Valeur comprise entre 1 et 60 minutes.';
                if (Number(this.form.firstSeenGraceMinutes) < 1 || Number(this.form.firstSeenGraceMinutes) > 60) errors.firstSeenGraceMinutes = 'Valeur comprise entre 1 et 60 minutes.';
                if (Number(this.form.confirmsRequired) < 1 || Number(this.form.confirmsRequired) > 5) errors.confirmsRequired = 'Valeur comprise entre 1 et 5.';
                if (Number(this.form.heartbeatTtlDays) < 1 || Number(this.form.heartbeatTtlDays) > 365) errors.heartbeatTtlDays = 'Valeur comprise entre 1 et 365 jours.';
                return errors;
            }
        },
        methods: {
            formatDateTime: formatters.formatDateTime,
            markDirty: function () {
                this.dirty = true;
            },
            hydrate: function () {
                var next = emptyForm();
                var admin = this.admin || {};
                var settings = admin.settings || {};
                next.fleetName = admin.fleetName || next.fleetName;
                next.balenaAppId = (admin.balena && admin.balena.appId) || '';
                next.mqttHost = (admin.mqtt && admin.mqtt.host) || next.mqttHost;
                next.mqttPort = (admin.mqtt && admin.mqtt.port) || next.mqttPort;
                next.mqttTopicPattern = (admin.mqtt && admin.mqtt.topicPattern) || next.mqttTopicPattern;
                next.heartbeatTtlDays = settings.heartbeatTtlDays || next.heartbeatTtlDays;
                next.offlineGraceMinutes = settings.offlineGraceMinutes || next.offlineGraceMinutes;
                next.firstSeenGraceMinutes = settings.firstSeenGraceMinutes || next.firstSeenGraceMinutes;
                next.confirmsRequired = settings.confirmsRequired || next.confirmsRequired;
                next.pollIntervalMs = settings.pollIntervalMs || next.pollIntervalMs;
                this.form = next;
                this.dirty = false;
            },
            save: function () {
                if (this.saving || Object.keys(this.validationErrors).length) return;
                this.dirty = false;
                this.$emit('save', {
                    fleetName: this.form.fleetName,
                    balenaAppId: this.form.balenaAppId,
                    balenaToken: this.form.balenaToken,
                    teamsWebhookUrl: this.form.teamsWebhookUrl,
                    mqttHost: this.form.mqttHost,
                    mqttPort: Number(this.form.mqttPort),
                    mqttTopicPattern: this.form.mqttTopicPattern,
                    heartbeatTtlDays: Number(this.form.heartbeatTtlDays),
                    offlineGraceMinutes: Number(this.form.offlineGraceMinutes),
                    firstSeenGraceMinutes: Number(this.form.firstSeenGraceMinutes),
                    confirmsRequired: Number(this.form.confirmsRequired),
                    pollIntervalMs: Number(this.form.pollIntervalMs)
                });
                this.form.balenaToken = '';
                this.form.teamsWebhookUrl = '';
            },
            confirmUnenroll: function (item) {
                var label = item && item.name ? item.name : (item && item.uuid ? item.uuid : 'cet appareil');
                if (global.confirm && !global.confirm('Retirer ' + label + ' de la flotte pré-enregistrée ?')) return;
                this.$emit('unenroll', item.uuid);
            }
        },
        template:
            '<section class="admin-page" aria-labelledby="admin-title">' +
                '<div class="admin-hero">' +
                    '<div>' +
                        '<p class="eyebrow">Console</p>' +
                        '<h2 id="admin-title">Administration</h2>' +
                        '<p class="admin-lead">Connectez les sources, enrôlez une gateway, ajustez les seuils déjà documentés. Les secrets ne sont jamais renvoyés en clair.</p>' +
                    '</div>' +
                    '<ui-button @click="$emit(\'open-enroll\', $event)">Connecter un appareil</ui-button>' +
                '</div>' +
                '<ui-banner kind="warning">Cette vue configure les intégrations et paramètres Fleet. Les variables Portainer restent le repli si un champ UI est vide.</ui-banner>' +
                '<ui-banner v-if="notice" kind="success">{{ notice }}</ui-banner>' +
                '<ui-banner v-if="error" kind="error">Configuration non enregistrée : {{ error }}</ui-banner>' +
                '<div class="integration-grid">' +
                    '<article class="integration-card">' +
                        '<div class="integration-card__head">' +
                            '<h3>Balena Cloud</h3>' +
                            '<status-badge :state="balenaTone" :label="balena.configured ? \'Connecté\' : \'À configurer\'"></status-badge>' +
                        '</div>' +
                        '<p>Inventaire devices et statut online. Token <code>device:read</code>.</p>' +
                        '<ui-field label="Fleets / App IDs" extra-class="admin-field" hint="Un ID numérique, slug ou UUID par ligne. Les virgules sont aussi acceptées.">' +
                            '<textarea :value="form.balenaAppId" rows="4" spellcheck="false" autocomplete="off" @input="markDirty(); form.balenaAppId = $event.target.value"></textarea>' +
                        '</ui-field>' +
                        '<ui-field label="Token API" extra-class="admin-field" :hint="balena.tokenSet ? (\'Enregistré \' + (balena.tokenHint || \'\') + \' — source \' + (balena.source || \'ui\') + \'. Laisser vide pour conserver.\') : \'Coller un nouveau token. Laisser vide conserve la valeur actuelle.\'">' +
                            '<input :value="form.balenaToken" type="password" autocomplete="new-password" placeholder="••••" @input="markDirty(); form.balenaToken = $event.target.value">' +
                        '</ui-field>' +
                    '</article>' +
                    '<article class="integration-card">' +
                        '<div class="integration-card__head">' +
                            '<h3>MQTT heartbeat</h3>' +
                            '<status-badge :state="mqttTone" :label="mqttTone === \'ok\' ? \'Réception OK\' : \'En attente\'"></status-badge>' +
                        '</div>' +
                        '<p>L’abonnement reste celui du nœud Node-RED. Ces champs servent à l’onboarding (instructions copiables).</p>' +
                        '<ui-field label="Broker affiché" extra-class="admin-field">' +
                            '<input :value="form.mqttHost" spellcheck="false" autocomplete="off" @input="markDirty(); form.mqttHost = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-field label="Port" extra-class="admin-field" :error="validationErrors.mqttPort">' +
                            '<input :value="form.mqttPort" type="number" min="1" max="65535" :aria-invalid="Boolean(validationErrors.mqttPort)" @input="markDirty(); form.mqttPort = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-field label="Topic" extra-class="admin-field" hint="Utilisez {uuid} comme variable.">' +
                            '<input :value="form.mqttTopicPattern" spellcheck="false" autocomplete="off" @input="markDirty(); form.mqttTopicPattern = $event.target.value">' +
                        '</ui-field>' +
                    '</article>' +
                    '<article class="integration-card">' +
                        '<div class="integration-card__head">' +
                            '<h3>Microsoft Teams</h3>' +
                            '<status-badge :state="teamsTone" :label="teamsStatusLabel"></status-badge>' +
                        '</div>' +
                        '<p>Webhook Workflows. Les alertes suivent toujours la règle anti-flap existante.</p>' +
                        '<ui-field label="URL webhook" extra-class="admin-field" :hint="teams.configured ? \'Laisser vide pour conserver l’URL actuelle.\' : \'URL HTTPS logic.azure.com\'">' +
                            '<input :value="form.teamsWebhookUrl" type="password" autocomplete="new-password" placeholder="https://…" @input="markDirty(); form.teamsWebhookUrl = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-button variant="secondary" :disabled="!teams.configured && !form.teamsWebhookUrl" @click="$emit(\'test-teams\')">Tester l’intégration</ui-button>' +
                    '</article>' +
                '</div>' +
                '<article class="integration-card">' +
                    '<div class="integration-card__head"><h3>Identité et seuils</h3></div>' +
                    '<p>Valeurs actuelles du flow (grâce 5 min, 2 polls, TTL 30 j). Les modifier ici ne change pas la machine d’états, seulement les constantes.</p>' +
                    '<div class="admin-settings">' +
                        '<ui-field label="Nom de la flotte" extra-class="admin-field" :error="validationErrors.fleetName">' +
                            '<input :value="form.fleetName" maxlength="80" required :aria-invalid="Boolean(validationErrors.fleetName)" @input="markDirty(); form.fleetName = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-field label="Grâce heartbeat (min)" extra-class="admin-field" :error="validationErrors.offlineGraceMinutes">' +
                            '<input :value="form.offlineGraceMinutes" type="number" min="1" max="60" :aria-invalid="Boolean(validationErrors.offlineGraceMinutes)" @input="markDirty(); form.offlineGraceMinutes = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-field label="Grâce nouvel appareil (min)" extra-class="admin-field" :error="validationErrors.firstSeenGraceMinutes">' +
                            '<input :value="form.firstSeenGraceMinutes" type="number" min="1" max="60" :aria-invalid="Boolean(validationErrors.firstSeenGraceMinutes)" @input="markDirty(); form.firstSeenGraceMinutes = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-field label="Polls avant alerte Teams" extra-class="admin-field" :error="validationErrors.confirmsRequired">' +
                            '<input :value="form.confirmsRequired" type="number" min="1" max="5" :aria-invalid="Boolean(validationErrors.confirmsRequired)" @input="markDirty(); form.confirmsRequired = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-field label="Rétention heartbeats (j)" extra-class="admin-field" :error="validationErrors.heartbeatTtlDays">' +
                            '<input :value="form.heartbeatTtlDays" type="number" min="1" max="365" :aria-invalid="Boolean(validationErrors.heartbeatTtlDays)" @input="markDirty(); form.heartbeatTtlDays = $event.target.value">' +
                        '</ui-field>' +
                        '<ui-field label="Intervalle poll Balena" extra-class="admin-field" hint="Le tick Node-RED est 2 min. Un intervalle plus long est respecté ; plus court ne descend pas sous le tick.">' +
                            '<select :value="form.pollIntervalMs" @change="markDirty(); form.pollIntervalMs = Number($event.target.value)">' +
                                '<option :value="60000">1 minute (plancher = tick)</option>' +
                                '<option :value="120000">2 minutes</option>' +
                                '<option :value="300000">5 minutes</option>' +
                                '<option :value="600000">10 minutes</option>' +
                            '</select>' +
                        '</ui-field>' +
                    '</div>' +
                    '<div class="toolbar-actions">' +
                        '<ui-button variant="secondary" :disabled="!dirty" @click="hydrate">Annuler</ui-button>' +
                        '<ui-button :loading="saving" :disabled="saving || !dirty || Object.keys(validationErrors).length > 0" @click="save">{{ saving ? \'Enregistrement…\' : \'Enregistrer\' }}</ui-button>' +
                    '</div>' +
                '</article>' +
                '<article class="integration-card">' +
                    '<div class="integration-card__head">' +
                        '<h3>Appareils pré-enregistrés</h3>' +
                        '<span class="activity-count">{{ enrolled.length }}</span>' +
                    '</div>' +
                    '<p v-if="!enrolled.length" class="empty-inline">Aucun enregistrement manuel. Les devices Balena et les heartbeats MQTT apparaissent tout seuls.</p>' +
                    '<div v-else class="table-wrap">' +
                        '<table>' +
                            '<caption class="sr-only">Inventaire manuel</caption>' +
                            '<thead><tr><th scope="col">Nom</th><th scope="col">UUID</th><th scope="col">Enregistré</th><th scope="col">Action</th></tr></thead>' +
                            '<tbody>' +
                                '<tr v-for="item in enrolled" :key="item.uuid">' +
                                    '<td>{{ item.name }}</td>' +
                                    '<td><code class="device-id">{{ item.uuid }}</code></td>' +
                                    '<td>{{ formatDateTime(item.enrolledAt) }}</td>' +
                                    '<td><button class="detail-button" type="button" @click="confirmUnenroll(item)">Retirer</button></td>' +
                                '</tr>' +
                            '</tbody>' +
                        '</table>' +
                    '</div>' +
                '</article>' +
            '</section>'
    };
}(window));
