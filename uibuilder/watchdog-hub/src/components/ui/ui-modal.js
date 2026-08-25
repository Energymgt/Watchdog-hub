(function (global) {
    'use strict';

    var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    /**
     * Dialogue modal : piège à focus, Escape, restauration du focus, scroll lock.
     * @property {string} titleId
     * @property {string} [descriptionId]
     * @property {Element|null} [opener]
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.UiModal = {
        name: 'UiModal',
        emits: ['close'],
        props: {
            titleId: { type: String, required: true },
            descriptionId: { type: String, default: '' },
            opener: { type: Object, default: null }
        },
        mounted: function () {
            this.previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            document.addEventListener('keydown', this.handleKeydown);
            this.$nextTick(this.focusInitial);
        },
        beforeUnmount: function () {
            document.body.style.overflow = this.previousOverflow || '';
            document.removeEventListener('keydown', this.handleKeydown);
            if (this.opener && typeof this.opener.focus === 'function') {
                this.opener.focus();
            }
        },
        methods: {
            close: function () {
                this.$emit('close');
            },
            getFocusable: function () {
                var dialog = this.$refs.dialog;
                if (!dialog || typeof dialog.querySelectorAll !== 'function') return [];
                return dialog.querySelectorAll(FOCUSABLE);
            },
            focusInitial: function () {
                var dialog = this.$refs.dialog;
                var initial = dialog && dialog.querySelector('[data-modal-initial-focus]');
                var focusable = this.getFocusable();
                var target = initial || focusable[0];
                if (target && typeof target.focus === 'function') target.focus();
            },
            handleKeydown: function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.close();
                    return;
                }
                if (event.key !== 'Tab') return;
                var focusable = this.getFocusable();
                if (!focusable.length) {
                    event.preventDefault();
                    return;
                }
                var first = focusable[0];
                var last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        },
        template:
            '<div class="modal-backdrop" @mousedown.self="close">' +
                '<section ref="dialog" class="modal" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descriptionId || undefined">' +
                    '<slot></slot>' +
                '</section>' +
            '</div>'
    };
}(window));
