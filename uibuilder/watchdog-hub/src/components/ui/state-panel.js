(function (global) {
    'use strict';

    /**
     * Panneau d’état plein-zone : chargement, vide, erreur.
     * @property {'empty'|'loading'|'error'} [kind]
     * @property {string} title
     * @property {string} [message]
     * @property {string} [actionLabel]
     * @property {boolean} [busy]
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.StatePanel = {
        name: 'StatePanel',
        emits: ['retry'],
        props: {
            kind: { type: String, default: 'empty' },
            title: { type: String, required: true },
            message: { type: String, default: '' },
            actionLabel: { type: String, default: '' },
            busy: { type: Boolean, default: false }
        },
        computed: {
            role: function () {
                return this.kind === 'error' ? 'alert' : 'status';
            },
            isBusy: function () {
                return this.busy || this.kind === 'loading';
            }
        },
        template:
            '<section class="state-panel" :class="\'state-panel--\' + kind" :role="role" :aria-busy="isBusy ? \'true\' : \'false\'">' +
                '<div v-if="kind === \'loading\'" class="spinner" aria-hidden="true"></div>' +
                '<ui-skeleton v-if="kind === \'loading\'" :lines="3"></ui-skeleton>' +
                '<h2>{{ title }}</h2>' +
                '<p v-if="message">{{ message }}</p>' +
                '<ui-button v-if="actionLabel" @click="$emit(\'retry\')">{{ actionLabel }}</ui-button>' +
            '</section>'
    };
}(window));
