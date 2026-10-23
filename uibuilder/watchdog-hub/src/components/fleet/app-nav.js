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
            fleetAlerts: { type: Number, default: 0 },
            alertCount: { type: Number, default: 0 }
        },
        template:
            '<nav class="app-nav" aria-label="Navigation principale">' +
                '<p class="app-nav__brand">Watchdog</p>' +
                '<div class="app-nav__group app-nav__section">' +
                    '<p class="app-nav__heading">Supervision</p>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'overview\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'overview\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Vue d’ensemble</span></button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'flows\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'flows\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Flux métier</span> <span v-if="flows" class="app-nav__count nav-counter nav-counter--alert">{{ flows }}</span></button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'fleet\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'fleet\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Appareils</span> <span v-if="fleetAlerts" class="app-nav__count nav-counter nav-counter--alert">{{ fleetAlerts }}</span></button>' +
                '</div>' +
                '<div class="app-nav__group app-nav__section">' +
                    '<p class="app-nav__heading">Notifications</p>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'alerts\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'alerts\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Alertes</span> <span v-if="alertCount" class="app-nav__count nav-counter nav-counter--alert">{{ alertCount }}</span></button>' +
                '</div>' +
                '<div class="app-nav__group app-nav__section">' +
                    '<p class="app-nav__label" id="app-nav-problems">Problèmes</p>' +
                    '<div class="app-nav__sub" role="group" aria-labelledby="app-nav-problems">' +
                        '<button class="app-nav__item" type="button" :aria-current="view === \'incidents\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'incidents\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Incidents</span> <span v-if="incidents" class="app-nav__count nav-counter nav-counter--alert">{{ incidents }}</span></button>' +
                        '<button class="app-nav__item" type="button" :aria-current="view === \'anomalies\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'anomalies\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Anomalies</span> <span v-if="anomalies" class="app-nav__count app-nav__count--warning nav-counter nav-counter--warning">{{ anomalies }}</span></button>' +
                        '<button class="app-nav__item" type="button" :aria-current="view === \'events\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'events\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Événements</span> <span v-if="events" class="app-nav__count app-nav__count--volume nav-counter nav-counter--volume">{{ events }}</span></button>' +
                    '</div>' +
                '</div>' +
                '<div class="app-nav__group app-nav__group--admin app-nav__section app-nav__section--footer">' +
                    '<p class="app-nav__heading">Système</p>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'admin\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'admin\')"><span class="app-nav__item-label"><span class="app-nav__dot"></span>Configuration</span></button>' +
                '</div>' +
            '</nav>'
    };
}(window));
