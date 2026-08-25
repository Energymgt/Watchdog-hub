(function (global) {
    'use strict';

    var formatters = global.WatchdogHub.formatters;

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.EnrollWizard = {
        name: 'EnrollWizard',
        emits: ['close', 'enroll'],
        props: {
            opener: { type: Object, default: null },
            mqtt: { type: Object, default: function () { return {}; } }
        },
        data: function () {
            return {
                step: 1,
                method: 'mqtt',
                uuid: '',
                name: '',
                copyMessage: ''
            };
        },
        computed: {
            topic: function () {
                var pattern = this.mqtt.topicPattern || 'bacnet/gateway/{uuid}/heartbeat';
                var uuid = this.uuid.trim() || '{uuid}';
                return pattern.replace('{uuid}', uuid).replace('{device_uuid}', uuid);
            },
            snippet: function () {
                return [
                    'Broker : ' + (this.mqtt.host || 'iot.energymgt.io') + ':' + (this.mqtt.port || 1883),
                    'Topic  : ' + this.topic,
                    'QoS    : ' + (this.mqtt.qos || 1),
                    'Retain : ' + (this.mqtt.retain === false ? 'false' : 'true')
                ].join('\n');
            }
        },
        methods: {
            choose: function (method) {
                this.method = method;
                this.step = 2;
            },
            copySnippet: function () {
                var self = this;
                formatters.copyText(this.snippet).then(function (ok) {
                    self.copyMessage = ok ? 'Instructions copiées.' : 'Copie impossible.';
                });
            },
            submit: function () {
                this.$emit('enroll', {
                    uuid: this.uuid.trim(),
                    name: this.name.trim(),
                    method: this.method
                });
            }
        },
        template:
            '<ui-modal :opener="opener" title-id="enroll-title" description-id="enroll-description" @close="$emit(\'close\')">' +
                '<div class="modal__header">' +
                    '<div><p class="eyebrow">Onboarding</p><h2 id="enroll-title">Connecter un appareil</h2></div>' +
                    '<button data-modal-initial-focus class="modal__close" type="button" aria-label="Fermer l’assistant" @click="$emit(\'close\')">×</button>' +
                '</div>' +
                '<p id="enroll-description">Trois chemins, un seul contrat : heartbeat MQTT + inventaire Balena si disponible.</p>' +
                '<ol class="wizard-steps" aria-label="Étapes">' +
                    '<li :aria-current="step === 1 ? \'step\' : undefined">Méthode</li>' +
                    '<li :aria-current="step === 2 ? \'step\' : undefined">Paramètres</li>' +
                '</ol>' +
                '<div v-if="step === 1" class="method-grid">' +
                    '<button class="method-card" type="button" @click="choose(\'balena\')">' +
                        '<strong>Balena Cloud</strong>' +
                        '<span>L’appareil est déjà dans la fleet. Le poll l’ajoutera automatiquement.</span>' +
                    '</button>' +
                    '<button class="method-card" type="button" @click="choose(\'mqtt\')">' +
                        '<strong>Heartbeat MQTT</strong>' +
                        '<span>La gateway publie sur le topic standard. Idéal pour un site déjà câblé.</span>' +
                    '</button>' +
                    '<button class="method-card" type="button" @click="choose(\'manual\')">' +
                        '<strong>Enregistrement manuel</strong>' +
                        '<span>Pré-déclarer un UUID pour le voir dans la flotte avant le premier signal.</span>' +
                    '</button>' +
                '</div>' +
                '<div v-else class="wizard-form">' +
                    '<ui-banner v-if="method === \'balena\'" kind="info">Vérifiez l’intégration Balena dans Administration, puis attendez le prochain poll. Aucun UUID n’est requis ici.</ui-banner>' +
                    '<template v-if="method !== \'balena\'">' +
                        '<ui-field label="UUID appareil" extra-class="admin-field" hint="UUID Balena (32 caractères) ou identifiant stable de la gateway.">' +
                            '<input v-model.trim="uuid" type="text" spellcheck="false" autocomplete="off" placeholder="ex. a1b2c3…">' +
                        '</ui-field>' +
                        '<ui-field label="Nom affiché" extra-class="admin-field" hint="Optionnel. Sinon le nom heartbeat / Balena sera utilisé.">' +
                            '<input v-model.trim="name" type="text" maxlength="80" autocomplete="off" placeholder="Gateway Site A">' +
                        '</ui-field>' +
                    '</template>' +
                    '<pre class="connect-snippet" tabindex="0">{{ snippet }}</pre>' +
                    '<p class="sr-only" aria-live="polite">{{ copyMessage }}</p>' +
                    '<div class="toolbar-actions wizard-actions">' +
                        '<ui-button variant="secondary" @click="step = 1">Retour</ui-button>' +
                        '<ui-button variant="secondary" @click="copySnippet">Copier les instructions</ui-button>' +
                        '<ui-button v-if="method !== \'balena\'" :disabled="uuid.length < 8" @click="submit">Enregistrer</ui-button>' +
                        '<ui-button v-else @click="$emit(\'close\')">Terminé</ui-button>' +
                    '</div>' +
                '</div>' +
            '</ui-modal>'
    };
}(window));
