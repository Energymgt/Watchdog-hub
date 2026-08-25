(function (global) {
    'use strict';

    var fieldSeq = 0;

    /**
     * Champ étiqueté. Le contrôle est fourni via le slot (input, select).
     * Le label enveloppe le contrôle : association accessible sans id manuel.
     * @property {string} label
     * @property {string} [extraClass]
     * @property {string} [hint]
     * @property {string} [error]
     */
    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.UiField = {
        name: 'UiField',
        props: {
            label: { type: String, required: true },
            extraClass: { type: String, default: '' },
            hint: { type: String, default: '' },
            error: { type: String, default: '' }
        },
        data: function () {
            fieldSeq += 1;
            return { hintUid: 'ui-field-hint-' + fieldSeq };
        },
        computed: {
            describedBy: function () {
                if (this.error || this.hint) return this.hintUid;
                return undefined;
            }
        },
        template:
            '<label class="ui-field" :class="extraClass">' +
                '<span class="field-label">{{ label }}</span>' +
                '<span class="ui-field__control">' +
                    '<slot :described-by="describedBy" :invalid="Boolean(error)"></slot>' +
                '</span>' +
                '<span v-if="error" :id="hintUid" class="ui-field__error" role="alert">{{ error }}</span>' +
                '<span v-else-if="hint" :id="hintUid" class="ui-field__hint">{{ hint }}</span>' +
            '</label>'
    };
}(window));
