(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.CommandPalette = {
        name: 'CommandPalette',
        emits: ['close', 'command'],
        data: function () {
            return {
                query: '',
                opener: null
            };
        },
        computed: {
            commands: function () {
                var query = this.query.trim().toLocaleLowerCase('fr-FR');
                return [
                    { id: 'overview', label: 'Aller à la vue d’ensemble', hint: 'Navigation' },
                    { id: 'incidents', label: 'Rechercher un incident', hint: 'Opérations' },
                    { id: 'flows', label: 'Rechercher un flux', hint: 'Opérations' },
                    { id: 'fleet', label: 'Rechercher une gateway', hint: 'Infrastructure' },
                    { id: 'refresh', label: 'Actualiser les snapshots', hint: 'Système' }
                ].filter(function (command) {
                    return !query || (command.label + ' ' + command.hint)
                        .toLocaleLowerCase('fr-FR').indexOf(query) !== -1;
                });
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
            close: function () {
                this.$emit('close');
            },
            choose: function (command) {
                this.$emit('command', command.id);
                this.close();
            },
            handleKeydown: function (event) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.close();
                }
            }
        },
        template:
            '<div class="command-palette-backdrop" @mousedown.self="close">' +
                '<section class="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">' +
                    '<div class="command-palette__header"><h2 id="command-palette-title">Commandes</h2><button type="button" class="modal__close" aria-label="Fermer les commandes" @click="close">×</button></div>' +
                    '<label class="sr-only" for="command-palette-search">Rechercher une commande</label>' +
                    '<input id="command-palette-search" ref="search" v-model="query" type="search" autocomplete="off" placeholder="Rechercher une commande">' +
                    '<ul v-if="commands.length" class="command-palette__list"><li v-for="command in commands" :key="command.id"><button type="button" @click="choose(command)"><span>{{ command.label }}</span><small>{{ command.hint }}</small></button></li></ul>' +
                    '<p v-else class="empty-inline">Aucune commande correspondante.</p>' +
                '</section>' +
            '</div>'
    };
}(window));
