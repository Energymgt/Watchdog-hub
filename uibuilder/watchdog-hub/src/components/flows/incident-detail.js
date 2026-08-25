(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.flowsFormatters;
    var common = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.IncidentDetail = {
        name: 'IncidentDetail',
        emits: ['close', 'note', 'transition', 'resolve'],
        props: {
            detail: { type: Object, required: true },
            opener: { type: Object, default: null },
            busy: { type: Boolean, default: false }
        },
        data: function () {
            return {
                actor: '',
                noteComment: '',
                transitionTarget: '',
                transitionComment: '',
                resolutionComment: ''
            };
        },
        computed: {
            incident: function () {
                return this.detail.incident || {};
            },
            stateMeta: function () {
                return formatters.incidentStateMeta(this.incident.state);
            },
            regularTransitions: function () {
                return (this.detail.allowedTransitions || []).filter(function (state) {
                    return state !== 'RESOLU';
                });
            },
            canResolve: function () {
                return (this.detail.allowedTransitions || []).indexOf('RESOLU') !== -1;
            }
        },
        watch: {
            'incident.incident_id': function () {
                this.noteComment = '';
                this.transitionTarget = '';
                this.transitionComment = '';
                this.resolutionComment = '';
            }
        },
        methods: {
            formatDateTime: common.formatDateTime,
            incidentMeta: formatters.incidentStateMeta,
            close: function () {
                this.$emit('close');
            },
            submitNote: function () {
                if (!this.actor.trim() || !this.noteComment.trim()) return;
                this.$emit('note', {
                    incident_id: this.incident.incident_id,
                    actor: this.actor.trim(),
                    kind: 'note',
                    comment: this.noteComment.trim()
                });
                this.noteComment = '';
            },
            submitTransition: function () {
                if (!this.actor.trim() || !this.transitionTarget) return;
                this.$emit('transition', {
                    incident_id: this.incident.incident_id,
                    actor: this.actor.trim(),
                    to_state: this.transitionTarget,
                    comment: this.transitionComment.trim()
                });
                this.transitionTarget = '';
                this.transitionComment = '';
            },
            submitResolution: function () {
                if (!this.actor.trim() || !this.resolutionComment.trim()) return;
                this.$emit('resolve', {
                    incident_id: this.incident.incident_id,
                    actor: this.actor.trim(),
                    comment: this.resolutionComment.trim()
                });
                this.resolutionComment = '';
            }
        },
        template:
            '<ui-modal :opener="opener" title-id="incident-detail-title" description-id="incident-detail-description" @close="close">' +
                '<div class="modal__header">' +
                    '<div><p class="eyebrow">Gestion d’incident</p><h2 id="incident-detail-title">{{ incident.flow_id }}</h2></div>' +
                    '<button data-modal-initial-focus class="modal__close" type="button" aria-label="Fermer le détail" @click="close">×</button>' +
                '</div>' +
                '<p id="incident-detail-description" class="incident-id">{{ incident.incident_id }}</p>' +
                '<span class="status-badge" :class="\'status-badge--\' + stateMeta.tone">{{ stateMeta.label }}</span>' +
                '<dl class="detail-grid">' +
                    '<dt>Signature</dt><dd>{{ incident.error_signature || \'Non disponible\' }}</dd>' +
                    '<dt>Clause</dt><dd>{{ incident.clause_id || \'Non disponible\' }}</dd>' +
                    '<dt>Clé de corrélation</dt><dd>{{ incident.correlation_key || \'Non disponible\' }}</dd>' +
                    '<dt>Ouvert le</dt><dd>{{ formatDateTime(incident.opened_at) }}</dd>' +
                    '<dt>Fermé le</dt><dd>{{ formatDateTime(incident.closed_at) }}</dd>' +
                '</dl>' +
                '<ui-field label="Opérateur" hint="Obligatoire pour chaque action" extra-class="incident-actor">' +
                    '<template #default="slotProps"><input v-model.trim="actor" type="text" maxlength="64" autocomplete="name" :aria-describedby="slotProps.describedBy" placeholder="Nom ou identifiant"></template>' +
                '</ui-field>' +
                '<div class="incident-actions-grid">' +
                    '<form class="incident-action-card" @submit.prevent="submitNote">' +
                        '<h3>Ajouter une note</h3>' +
                        '<ui-field label="Commentaire"><template #default="slotProps"><textarea v-model="noteComment" maxlength="2000" rows="3" :aria-describedby="slotProps.describedBy"></textarea></template></ui-field>' +
                        '<ui-button type="submit" :disabled="!actor.trim() || !noteComment.trim()" :loading="busy">Enregistrer la note</ui-button>' +
                    '</form>' +
                    '<form v-if="regularTransitions.length" class="incident-action-card" @submit.prevent="submitTransition">' +
                        '<h3>Changer l’état</h3>' +
                        '<ui-field label="Nouvel état"><template #default="slotProps"><select v-model="transitionTarget" :aria-describedby="slotProps.describedBy"><option value="">Sélectionner</option><option v-for="target in regularTransitions" :key="target" :value="target">{{ incidentMeta(target).label }}</option></select></template></ui-field>' +
                        '<ui-field label="Commentaire facultatif"><template #default="slotProps"><textarea v-model="transitionComment" maxlength="2000" rows="2" :aria-describedby="slotProps.describedBy"></textarea></template></ui-field>' +
                        '<ui-button type="submit" :disabled="!actor.trim() || !transitionTarget" :loading="busy">Appliquer la transition</ui-button>' +
                    '</form>' +
                    '<form v-if="canResolve" class="incident-action-card incident-action-card--resolution" @submit.prevent="submitResolution">' +
                        '<h3>Résoudre l’incident</h3>' +
                        '<ui-field label="Résolution" hint="Décrivez la correction et sa validation"><template #default="slotProps"><textarea v-model="resolutionComment" maxlength="2000" rows="3" :aria-describedby="slotProps.describedBy"></textarea></template></ui-field>' +
                        '<ui-button type="submit" :disabled="!actor.trim() || !resolutionComment.trim()" :loading="busy">Enregistrer la résolution</ui-button>' +
                    '</form>' +
                '</div>' +
                '<section class="transition-history" aria-labelledby="incident-history-title">' +
                    '<h3 id="incident-history-title">Historique</h3>' +
                    '<ol v-if="detail.history.length"><li v-for="item in detail.history" :key="item.history_id"><time>{{ formatDateTime(item.changed_at) }}</time> - {{ incidentMeta(item.from_state).label }} vers {{ incidentMeta(item.to_state).label }} par {{ item.actor }}<span v-if="item.reason"> : {{ item.reason }}</span></li></ol>' +
                    '<p v-else class="empty-inline">Aucune transition enregistrée.</p>' +
                '</section>' +
                '<section class="transition-history" aria-labelledby="incident-actions-title">' +
                    '<h3 id="incident-actions-title">Journal opérateur</h3>' +
                    '<ol v-if="detail.actions.length"><li v-for="item in detail.actions" :key="item.action_id"><time>{{ formatDateTime(item.created_at) }}</time> - {{ item.actor }} : {{ item.comment || item.kind }}</li></ol>' +
                    '<p v-else class="empty-inline">Aucune action opérateur.</p>' +
                '</section>' +
                '<section v-if="detail.links.length" class="transition-history" aria-labelledby="incident-links-title">' +
                    '<h3 id="incident-links-title">Éléments liés</h3>' +
                    '<ul><li v-for="item in detail.links" :key="item.target_kind + item.target_id"><strong>{{ item.target_kind }}</strong> : <code>{{ item.target_id }}</code></li></ul>' +
                '</section>' +
            '</ui-modal>'
    };
}(window));
