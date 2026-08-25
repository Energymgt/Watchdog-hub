(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.AppNav = {
        name: 'AppNav',
        emits: ['update:view'],
        props: {
            view: { type: String, default: 'fleet' }
        },
        template:
            '<nav class="app-nav" aria-label="Navigation principale">' +
                '<div class="app-nav__group"><span class="app-nav__label">Opérations</span>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'overview\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'overview\')">Vue d’ensemble</button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'incidents\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'incidents\')">Incidents</button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'flows\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'flows\')">Flux</button>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'fleet\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'fleet\')">Flotte</button>' +
                '</div>' +
                '<div class="app-nav__group app-nav__group--admin"><span class="app-nav__label">Administration</span>' +
                    '<button class="app-nav__item" type="button" :aria-current="view === \'admin\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'admin\')">Configuration</button>' +
                '</div>' +
            '</nav>'
    };
}(window));
