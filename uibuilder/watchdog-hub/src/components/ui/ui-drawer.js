(function (global) {
    'use strict';

    var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.UiDrawer = {
        name: 'UiDrawer',
        emits: ['close'],
        props: {
            titleId: { type: String, required: true },
            descriptionId: { type: String, default: '' },
            opener: { type: Object, default: null }
        },
        mounted: function () {
            document.addEventListener('keydown', this.handleKeydown);
            this.$nextTick(this.focusInitial);
        },
        beforeUnmount: function () {
            document.removeEventListener('keydown', this.handleKeydown);
            if (this.opener && typeof this.opener.focus === 'function') this.opener.focus();
        },
        methods: {
            close: function () { this.$emit('close'); },
            focusable: function () {
                return this.$refs.drawer ? this.$refs.drawer.querySelectorAll(FOCUSABLE) : [];
            },
            focusInitial: function () {
                var target = this.$refs.drawer && this.$refs.drawer.querySelector('[data-drawer-initial-focus]');
                if (target) target.focus();
            },
            handleKeydown: function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.close();
                    return;
                }
                if (event.key !== 'Tab') return;
                var items = this.focusable();
                if (!items.length) return;
                if (event.shiftKey && document.activeElement === items[0]) {
                    event.preventDefault();
                    items[items.length - 1].focus();
                } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
                    event.preventDefault();
                    items[0].focus();
                }
            }
        },
        template:
            '<aside ref="drawer" class="side-drawer" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descriptionId || undefined"><slot></slot></aside>'
    };
}(window));
