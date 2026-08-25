(function (global) {
    'use strict';

    var ROLES = {
        warning: 'status',
        info: 'status',
        success: 'status',
        error: 'alert'
    };

    /**
     * Bannière d’état globale (connexion, erreur, notice).
     * @property {'warning'|'info'|'error'|'success'} [kind]
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.UiBanner = {
        name: 'UiBanner',
        props: {
            kind: { type: String, default: 'info' }
        },
        computed: {
            normalizedKind: function () {
                return ROLES[this.kind] ? this.kind : 'info';
            },
            role: function () {
                return ROLES[this.normalizedKind];
            }
        },
        template:
            '<div class="ui-banner" :class="\'ui-banner--\' + normalizedKind" :role="role">' +
                '<slot></slot>' +
            '</div>'
    };
}(window));
