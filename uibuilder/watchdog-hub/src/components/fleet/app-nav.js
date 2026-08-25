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
            fleetAlerts: { type: Number, default: 0 }
        },
        template:
            '<nav class="app-nav" aria-label="Navigation principale">' +
                '<p class="app-nav__brand">Watchdog Hub</p>' +
                '<div class="app-nav__group">' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'overview\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'overview\')">Overview</button>' +
                '</div>' +
                '<div class="app-nav__group">' +
                    '<span class="app-nav__label">Opérations</span>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'incidents\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'incidents\')">Incidents <span v-if="incidents" class="app-nav__count">{{ incidents }}</span></button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'flows\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'flows\')">Flux <span v-if="flows" class="app-nav__count">{{ flows }}</span></button>' +
                    '<button class="app-nav__item app-nav__item--unavailable" type="button" disabled title="Non exposé par le pont UIbuilder">Anomalies</button>' +
                    '<button class="app-nav__item app-nav__item--unavailable" type="button" disabled title="Non exposé par le pont UIbuilder">Événements</button>' +
                '</div>' +
                '<div class="app-nav__group">' +
                    '<span class="app-nav__label">Infrastructure</span>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'fleet\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'fleet\')">Flotte <span v-if="fleetAlerts" class="app-nav__count">{{ fleetAlerts }}</span></button>' +
                '</div>' +
                '<div class="app-nav__group app-nav__group--admin">' +
                    '<span class="app-nav__label">Administration</span>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'admin\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'admin\')">Configuration</button>' +
                '</div>' +
            '</nav>'
    };
}(window));
