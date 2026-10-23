(function (global) {
    'use strict';

    global.WatchdogHub.components = global.WatchdogHub.components || {};
    global.WatchdogHub.components.ActivityTimeline = {
        name: 'ActivityTimeline',
        emits: ['open'],
        props: {
            items: { type: Array, default: function () { return []; } },
            now: { type: Number, default: Date.now }
        },
        methods: {
            formatRelative: function (value) {
                return global.WatchdogHub.formatters.formatRelative(value, this.now);
            },
            open: function (item) {
                if (item.navigation) this.$emit('open', item);
            },
            categoryLabel: function (category) {
                if (category === 'EVENT') return 'Événement';
                if (category === 'INCIDENT') return 'Incident';
                if (category === 'ANOMALY') return 'Anomalie';
                if (category === 'FLEET') return 'Appareil';
                return category || 'Activité';
            },
            categoryClass: function (category) {
                return 'activity-timeline__category--' + String(category || 'other').toLowerCase();
            },
            displayTitle: function (item) {
                if (!item) return '';
                if (item.title === 'ANOMALY OPENED') return 'Anomalie ouverte';
                if (item.title === 'ANOMALY CLOSED') return 'Anomalie fermée';
                if (item.title === 'Transition flotte') return 'Transition d’appareil';
                return item.title;
            }
        },
        template:
            '<div><ol v-if="items.length" class="activity-timeline"><li v-for="item in items" :key="item.source + \':\' + item.id" :class="categoryClass(item.category)"><time :datetime="new Date(item.timestamp).toISOString()" :title="item.timestamp">{{ formatRelative(item.timestamp) }}</time><button v-if="item.navigation" type="button" class="activity-timeline__item" @click="open(item)"><span class="activity-timeline__category" :class="categoryClass(item.category)">{{ categoryLabel(item.category) }}</span><strong>{{ displayTitle(item) }}</strong><span>{{ item.description }}</span></button><div v-else class="activity-timeline__item"><span class="activity-timeline__category" :class="categoryClass(item.category)">{{ categoryLabel(item.category) }}</span><strong>{{ displayTitle(item) }}</strong><span>{{ item.description }}</span></div></li></ol><p v-else class="empty-inline">Aucune activité récente.</p></div>'
    };
}(window));
