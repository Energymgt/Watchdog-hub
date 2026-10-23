(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.DeviceList = {
        name: 'DeviceList',
        emits: ['select', 'update:sort'],
        props: {
            devices: { type: Array, default: function () { return []; } },
            now: { type: Number, default: Date.now },
            sort: { type: String, default: 'severity' },
            refreshing: { type: Boolean, default: false }
        },
        methods: {
            formatDateTime: formatters.formatDateTime,
            formatRelative: function (value) {
                return formatters.formatRelative(value, this.now);
            },
            open: function (device, event) {
                this.$emit('select', device, event.currentTarget);
            },
            ariaSort: function (column) {
                if (this.sort !== column) return 'none';
                return column === 'name' ? 'ascending' : 'descending';
            }
        },
        template:
            '<section aria-label="Liste des appareils" :aria-busy="refreshing ? \'true\' : \'false\'">' +
                '<div class="table-wrap table-wrap--devices">' +
                    '<table>' +
                        '<caption class="sr-only">Identité, état et ancienneté du heartbeat</caption>' +
                        '<thead><tr>' +
                            '<th scope="col" :aria-sort="ariaSort(\'name\')"><button class="sort-button" type="button" @click="$emit(\'update:sort\', \'name\')">Appareil</button></th>' +
                            '<th scope="col" :aria-sort="ariaSort(\'severity\')"><button class="sort-button" type="button" @click="$emit(\'update:sort\', \'severity\')">État</button></th>' +
                            '<th scope="col">Heartbeat</th>' +
                            '<th scope="col">Action</th>' +
                        '</tr></thead>' +
                        '<tbody>' +
                            '<tr v-for="device in devices" :key="device.uuid">' +
                                '<td><span class="device-name">{{ device.name }}</span><span class="device-id" :title="device.uuid">{{ device.uuid }}</span><small v-if="device.enrolled" class="cell-note">Pré-enregistré</small></td>' +
                                '<td><status-badge :state="device.state"></status-badge></td>' +
                                '<td><span :title="formatDateTime(device.lastHeartbeat)">{{ formatRelative(device.lastHeartbeat) }}</span><small class="cell-note">{{ device.heartbeat && device.heartbeat.retained ? \'Retenu\' : (device.hbOk ? \'Actif\' : \'Absent\') }}</small></td>' +
                                '<td><button class="detail-button" type="button" :aria-label="\'Voir le détail de \' + device.name" @click="open(device, $event)">Détail</button></td>' +
                            '</tr>' +
                        '</tbody>' +
                    '</table>' +
                '</div>' +
                '<div class="device-cards">' +
                    '<article v-for="device in devices" :key="device.uuid" class="device-card">' +
                        '<div class="device-card__top"><div><div class="device-name">{{ device.name }}</div><span class="device-id" :title="device.uuid">{{ device.uuid }}</span></div><status-badge :state="device.state"></status-badge></div>' +
                        '<dl class="device-card__facts">' +
                            '<div><dt>Heartbeat</dt><dd :title="formatDateTime(device.lastHeartbeat)">{{ formatRelative(device.lastHeartbeat) }}<small class="cell-note">{{ device.heartbeat && device.heartbeat.retained ? \'Retenu\' : (device.hbOk ? \'Actif\' : \'Absent\') }}</small></dd></div>' +
                        '</dl>' +
                        '<p v-if="device.enrolled" class="pending-inline">Pré-enregistré — en attente du heartbeat</p>' +
                        '<p v-if="device.pendingConfirmation" class="pending-inline">Confirmation {{ device.pendingConfirmation.count }}/{{ device.pendingConfirmation.required }}</p>' +
                        '<button class="detail-button" type="button" :aria-label="\'Voir le détail de \' + device.name" @click="open(device, $event)">Voir le détail</button>' +
                    '</article>' +
                '</div>' +
            '</section>'
    };
}(window));
