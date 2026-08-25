(function (global) {
    'use strict';

    /**
     * Pagination clavier / lecteur d’écran.
     * @property {number} page
     * @property {number} pageSize
     * @property {number} total
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.PaginationControls = {
        name: 'PaginationControls',
        emits: ['update:page', 'update:page-size'],
        props: {
            page: { type: Number, required: true },
            pageSize: { type: Number, required: true },
            total: { type: Number, required: true }
        },
        computed: {
            safePageSize: function () {
                var size = Number(this.pageSize);
                return Number.isFinite(size) && size > 0 ? size : 50;
            },
            safeTotal: function () {
                var total = Number(this.total);
                return Number.isFinite(total) && total > 0 ? total : 0;
            },
            pageCount: function () {
                return Math.max(1, Math.ceil(this.safeTotal / this.safePageSize));
            },
            firstItem: function () {
                return this.safeTotal ? ((this.page - 1) * this.safePageSize) + 1 : 0;
            },
            lastItem: function () {
                return Math.min(this.safeTotal, this.page * this.safePageSize);
            }
        },
        template:
            '<nav class="pagination" aria-label="Pagination des appareils">' +
                '<p>{{ firstItem }}–{{ lastItem }} sur {{ safeTotal }}</p>' +
                '<label><span>Par page</span><select :value="safePageSize" @change="$emit(\'update:page-size\', Number($event.target.value))"><option :value="25">25</option><option :value="50">50</option><option :value="100">100</option></select></label>' +
                '<div class="pagination__buttons">' +
                    '<ui-button variant="secondary" :disabled="page <= 1" aria-label="Page précédente" @click="$emit(\'update:page\', page - 1)">Précédent</ui-button>' +
                    '<span aria-live="polite" aria-atomic="true">Page {{ page }} sur {{ pageCount }}</span>' +
                    '<ui-button variant="secondary" :disabled="page >= pageCount" aria-label="Page suivante" @click="$emit(\'update:page\', page + 1)">Suivant</ui-button>' +
                '</div>' +
            '</nav>'
    };
}(window));
