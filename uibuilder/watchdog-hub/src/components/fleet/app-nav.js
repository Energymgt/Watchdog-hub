(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.AppNav = {
        name: 'AppNav',
        emits: ['update:view'],
        props: {
            view: { type: String, default: 'fleet' },
            incidents: { type: Number, default: 0 },
            flows: { type: Number, default: 0 },
            anomalies: { type: Number, default: 0 },
            events: { type: Number, default: 0 },
            fleetAlerts: { type: Number, default: 0 }
        },
        data: function () {
            return { journalOpen: false };
        },
        watch: {
            view: {
                immediate: true,
                handler: function (view) {
                    if (view === 'anomalies' || view === 'events') this.journalOpen = true;
                }
            }
        },
        methods: {
            onJournalToggle: function (event) {
                this.journalOpen = Boolean(event.target && event.target.open);
            }
        },
        template:
            '<nav class="app-nav" aria-label="Navigation principale">' +
                '<p class="app-nav__brand">Watchdog</p>' +
                '<div class="app-nav__group">' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'overview\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'overview\')">Vue d’ensemble</button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'flows\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'flows\')">Flux <span v-if="flows" class="app-nav__count">{{ flows }}</span></button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'fleet\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'fleet\')">Appareils <span v-if="fleetAlerts" class="app-nav__count">{{ fleetAlerts }}</span></button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'incidents\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'incidents\')">Incidents <span v-if="incidents" class="app-nav__count">{{ incidents }}</span></button>' +
                '</div>' +
                '<details class="app-nav__journal" :open="journalOpen" @toggle="onJournalToggle">' +
                    '<summary>Journal</summary>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'anomalies\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'anomalies\')">Anomalies <span v-if="anomalies" class="app-nav__count">{{ anomalies }}</span></button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'events\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'events\')">Événements <span v-if="events" class="app-nav__count">{{ events }}</span></button>' +
                '</details>' +
                '<div class="app-nav__group app-nav__group--admin">' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'admin\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'admin\')">Paramètres</button>' +
                '</div>' +
            '</nav>'
    };
}(window));
