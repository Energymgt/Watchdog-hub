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
            '<nav class="app-nav" aria-label="Sections de l’application">' +
                '<button class="app-nav__item" type="button" :aria-current="view === \'fleet\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'fleet\')">Flotte</button>' +
                '<button class="app-nav__item" type="button" :aria-current="view === \'admin\' ? \'page\' : undefined" @click="$emit(\'update:view\', \'admin\')">Administration</button>' +
            '</nav>'
    };
}(window));
