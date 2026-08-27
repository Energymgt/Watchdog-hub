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
            }
        },
        template:
            '<div><ol v-if="items.length" class="activity-timeline"><li v-for="item in items" :key="item.source + \':\' + item.id"><time :datetime="new Date(item.timestamp).toISOString()" :title="item.timestamp">{{ formatRelative(item.timestamp) }}</time><button v-if="item.navigation" type="button" class="activity-timeline__item" @click="open(item)"><span class="activity-timeline__category">{{ item.category }}</span><strong>{{ item.title }}</strong><span>{{ item.description }}</span></button><div v-else class="activity-timeline__item"><span class="activity-timeline__category">{{ item.category }}</span><strong>{{ item.title }}</strong><span>{{ item.description }}</span></div></li></ol><p v-else class="empty-inline">Aucune activité récente.</p></div>'
    };
}(window));
