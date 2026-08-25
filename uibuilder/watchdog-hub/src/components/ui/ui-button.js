(function (global) {
    'use strict';

    /**
     * Bouton d’action réutilisable.
     * Attributs ARIA et class du parent sont hérités par le <button> racine.
     * @property {'primary'|'secondary'|'ghost'} [variant]
     * @property {'button'|'submit'} [type]
     * @property {boolean} [disabled]
     * @property {boolean} [loading]
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.UiButton = {
        name: 'UiButton',
        emits: ['click'],
        props: {
            variant: { type: String, default: 'primary' },
            type: { type: String, default: 'button' },
            disabled: { type: Boolean, default: false },
            loading: { type: Boolean, default: false }
        },
        computed: {
            isDisabled: function () {
                return this.disabled || this.loading;
            },
            variantClass: function () {
                if (this.variant === 'secondary') return 'button--secondary';
                if (this.variant === 'ghost') return 'button--ghost';
                return '';
            }
        },
        methods: {
            onClick: function (event) {
                if (this.isDisabled) {
                    event.preventDefault();
                    return;
                }
                this.$emit('click', event);
            }
        },
        template:
            '<button class="button" :class="[variantClass, { \'button--loading\': loading }]" :type="type" :disabled="isDisabled" :aria-busy="loading ? \'true\' : \'false\'" @click="onClick">' +
                '<span v-if="loading" class="button__spinner" aria-hidden="true"></span>' +
                '<span class="button__label"><slot></slot></span>' +
            '</button>'
    };
}(window));
