(function (global) {
    'use strict';

    var FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.CommandPalette = {
        name: 'CommandPalette',
        emits: ['close', 'command'],
        props: {
            items: { type: Array, default: function () { return []; } }
        },
        data: function () {
            return {
                query: '',
                opener: null,
                activeIndex: 0
            };
        },
        computed: {
            commands: function () {
                return [
                    { id: 'overview', label: 'Overview', hint: 'Navigation' },
                    { id: 'incidents', label: 'Incidents', hint: 'Navigation' },
                    { id: 'flows', label: 'Flows', hint: 'Navigation' },
                    { id: 'anomalies', label: 'Anomalies', hint: 'Navigation' },
                    { id: 'events', label: 'Events', hint: 'Navigation' },
                    { id: 'fleet', label: 'Fleet', hint: 'Navigation' },
                    { id: 'admin', label: 'Configuration', hint: 'Navigation' }
                ];
            },
            results: function () {
                return global.WatchdogHub.commandPaletteSelector.searchItems(this.items, this.query, 15);
            },
            visibleItems: function () {
                return this.query.trim() ? this.results : this.commands;
            }
        },
        watch: {
            query: function () {
                this.activeIndex = 0;
            }
        },
        mounted: function () {
            this.opener = document.activeElement;
            document.addEventListener('keydown', this.handleKeydown);
            this.$nextTick(function () {
                if (this.$refs.search) this.$refs.search.focus();
            });
        },
        beforeUnmount: function () {
            document.removeEventListener('keydown', this.handleKeydown);
            if (this.opener && typeof this.opener.focus === 'function') this.opener.focus();
        },
        methods: {
            focusable: function () {
                return this.$el.querySelectorAll(FOCUSABLE);
            },
            close: function () {
                this.$emit('close');
            },
            choose: function (command) {
                this.$emit('command', command.type
                    ? { kind: 'result', item: command }
                    : { kind: 'navigate', view: command.id });
                this.close();
            },
            handleKeydown: function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.close();
                    return;
                }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    var delta = event.key === 'ArrowDown' ? 1 : -1;
                    var length = this.visibleItems.length;
                    if (length) this.activeIndex = (this.activeIndex + delta + length) % length;
                    return;
                }
                if (event.key === 'Tab') {
                    var focusable = this.focusable();
                    if (!focusable.length) return;
                    var first = focusable[0];
                    var last = focusable[focusable.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
                    return;
                }
                if (event.key === 'Enter' && this.visibleItems.length) {
                    event.preventDefault();
                    this.choose(this.visibleItems[this.activeIndex]);
                }
            }
        },
        template:
            '<div class="command-palette-backdrop" @mousedown.self="close">' +
                '<section class="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">' +
                    '<div class="command-palette__header"><h2 id="command-palette-title">Command Center Navigation</h2><button type="button" class="modal__close" aria-label="Fermer les commandes" @click="close">×</button></div>' +
                    '<label class="sr-only" for="command-palette-search">Rechercher une commande</label>' +
                    '<input id="command-palette-search" ref="search" v-model="query" type="search" autocomplete="off" placeholder="Rechercher un flux, incident, device..." aria-controls="command-palette-results" :aria-activedescendant="visibleItems.length ? \'command-palette-item-\' + activeIndex : undefined">' +
                    '<p class="command-palette__scope">Résultats locaux dans les données chargées</p>' +
                    '<p class="command-palette__group">{{ query.trim() ? \'Résultats\' : \'Navigation\' }}</p>' +
                    '<ul v-if="visibleItems.length" id="command-palette-results" class="command-palette__list" role="listbox"><li v-for="(command, index) in visibleItems" :key="command.type ? command.type + \':\' + command.id : command.id"><button :id="\'command-palette-item-\' + index" type="button" role="option" :aria-selected="index === activeIndex ? \'true\' : \'false\'" :class="{ \'is-active\': index === activeIndex }" @mouseenter="activeIndex = index" @click="choose(command)"><span><b v-if="command.type" class="command-palette__type">{{ command.type }}</b>{{ command.title || command.label }}<small v-if="command.subtitle">{{ command.subtitle }}</small></span><small>{{ command.status || command.hint }}</small></button></li></ul>' +
                    '<p v-else class="empty-inline">Aucun résultat.</p>' +
                '</section>' +
            '</div>'
    };
}(window));
