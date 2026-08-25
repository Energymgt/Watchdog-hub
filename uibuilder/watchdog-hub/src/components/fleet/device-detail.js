(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.DeviceDetail = {
        name: 'DeviceDetail',
        emits: ['close'],
        props: {
            device: { type: Object, required: true },
            opener: { type: Object, default: null }
        },
        data: function () {
            return { copyMessage: '', copied: false };
        },
        beforeUnmount: function () {
            global.clearTimeout(this.copyTimer);
        },
        computed: {
            copyButtonLabel: function () {
                return this.copied ? 'Copié' : 'Copier';
            }
        },
        methods: {
            booleanLabel: formatters.booleanLabel,
            formatDateTime: formatters.formatDateTime,
            indicatorLabel: formatters.indicatorLabel,
            isoDate: function (value) {
                var date = new Date(value);
                return Number.isNaN(date.getTime()) ? '' : date.toISOString();
            },
            announceCopy: function (ok) {
                var self = this;
                this.copyMessage = ok
                    ? 'UUID copié dans le presse-papiers.'
                    : 'Copie impossible.';
                this.copied = ok;
                global.clearTimeout(this.copyTimer);
                this.copyTimer = global.setTimeout(function () {
                    self.copyMessage = '';
                    self.copied = false;
                }, 2000);
            },
            copyUuidFallback: function (uuid) {
                var input = document.createElement('textarea');
                input.value = uuid;
                input.setAttribute('readonly', '');
                input.style.position = 'fixed';
                input.style.opacity = '0';
                document.body.appendChild(input);
                input.select();
                try {
                    document.execCommand('copy');
                    this.announceCopy(true);
                } catch (error) {
                    this.announceCopy(false);
                }
                document.body.removeChild(input);
            },
            copyUuid: function () {
                var uuid = this.device.uuid;
                var self = this;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(uuid).then(function () {
                        self.announceCopy(true);
                    }).catch(function () {
                        self.copyUuidFallback(uuid);
                    });
                    return;
                }
                this.copyUuidFallback(uuid);
            },
            valueOrUnknown: function (value) {
                return value === null || value === undefined || value === ''
                    ? 'Non disponible'
                    : String(value);
            },
            close: function () {
                this.$emit('close');
            }
        },
        template:
            '<ui-modal :opener="opener" title-id="device-detail-title" description-id="device-detail-description" @close="close">' +
                    '<div class="modal__header">' +
                        '<div><p class="eyebrow">Détail appareil</p><h2 id="device-detail-title">{{ device.name }}</h2></div>' +
                        '<button data-modal-initial-focus class="modal__close" type="button" aria-label="Fermer le détail" @click="close">×</button>' +
                    '</div>' +
                    '<p id="device-detail-description">{{ device.detail }}</p>' +
                    '<p class="sr-only" aria-live="polite">{{ copyMessage }}</p>' +
                    '<status-badge :state="device.state"></status-badge>' +
                    '<div v-if="device.pendingConfirmation" class="pending-panel detail-pending" role="status">' +
                        '<strong>État en attente de confirmation</strong> — {{ device.pendingConfirmation.count }}/{{ device.pendingConfirmation.required }} poll(s)' +
                        '<span v-if="device.pendingConfirmation.firstSeenGraceActive">, grâce nouvel appareil active jusqu’à {{ formatDateTime(device.pendingConfirmation.firstSeenGraceUntil) }}</span>' +
                    '</div>' +
                        '<ui-banner v-if="device.gatewayGrace" kind="info">La gateway est dans sa période de grâce de démarrage.</ui-banner>' +
                    '<dl class="detail-grid">' +
                        '<dt>UUID</dt><dd><code>{{ device.uuid }}</code> <button class="copy-button" type="button" :aria-label="copyMessage || \'Copier l’UUID\'" @click="copyUuid">{{ copyButtonLabel }}</button></dd>' +
                        '<dt>Connexion Balena</dt><dd>{{ booleanLabel(device.online) }}</dd>' +
                        '<dt>Heartbeat valide</dt><dd>{{ booleanLabel(device.hbOk) }}</dd>' +
                        '<dt>Dernière connexion</dt><dd>{{ formatDateTime(device.lastConnectivity) }}</dd>' +
                        '<dt>Dernier heartbeat</dt><dd>{{ formatDateTime(device.lastHeartbeat) }}</dd>' +
                        '<dt>Heartbeat retained</dt><dd>{{ device.heartbeat ? booleanLabel(device.heartbeat.retained) : \'Non disponible\' }}</dd>' +
                        '<dt>Horodatage fiable</dt><dd>{{ device.heartbeat ? booleanLabel(device.heartbeat.timestampTrusted) : \'Non disponible\' }}</dd>' +
                        '<dt>État confirmé</dt><dd>{{ device.confirmedState || \'Non disponible\' }}</dd>' +
                        '<dt>Statut global source</dt><dd>{{ device.overallStatus || \'Non disponible\' }}</dd>' +
                        '<dt>Sévérité</dt><dd>{{ device.severity }}</dd>' +
                        '<dt>Santé BACnet</dt><dd>{{ indicatorLabel(device.indicators.bacnet) }}<span v-if="device.health && device.health.status"> — {{ device.health.status }}</span></dd>' +
                        '<dt>MQTT gateway</dt><dd>{{ indicatorLabel(device.indicators.mqtt) }}<span v-if="device.mqtt && device.mqtt.lastError"> — {{ device.mqtt.lastError }}</span></dd>' +
                        '<dt>Buffer</dt><dd>{{ indicatorLabel(device.indicators.buffer) }}<span v-if="device.buffer"> — {{ valueOrUnknown(device.buffer.pending) }} en attente<span v-if="device.buffer.lastError"> — {{ device.buffer.lastError }}</span></span></dd>' +
                        '<dt>Équipements BACnet</dt><dd>{{ device.snapshot ? valueOrUnknown(device.snapshot.count) : \'Non disponible\' }}<span v-if="device.snapshot && device.snapshot.empty"> — snapshot vide</span></dd>' +
                        '<dt>Supervisor</dt><dd>{{ indicatorLabel(device.indicators.supervisor) }}<span v-if="device.supervisor && device.supervisor.unhealthy && device.supervisor.unhealthy.length"> — {{ device.supervisor.unhealthy.join(\', \') }}</span></dd>' +
                        '<dt>Application gateway</dt><dd>{{ device.device ? valueOrUnknown(device.device.app || device.device.application) : \'Non disponible\' }}</dd>' +
                        '<dt>Hôte gateway</dt><dd>{{ device.device ? valueOrUnknown(device.device.host || device.device.hostname) : \'Non disponible\' }}</dd>' +
                    '</dl>' +
                    '<section v-if="device.recentTransitions.length" class="transition-history" aria-labelledby="transition-title">' +
                        '<h3 id="transition-title">Transitions récentes</h3>' +
                        '<ol><li v-for="transition in device.recentTransitions" :key="transition.at + transition.to"><time :datetime="isoDate(transition.at)">{{ formatDateTime(transition.at) }}</time> — {{ transition.detail }}</li></ol>' +
                    '</section>' +
            '</ui-modal>'
    };
}(window));
