(function (global) {
    'use strict';

    var STATE_META = {
        ok: { label: 'Opérationnel', tone: 'ok', rank: 0 },
        cloud_down: { label: 'Cloud indisponible', tone: 'warning', rank: 2 },
        unknown_online: { label: 'Absent de Balena', tone: 'warning', rank: 2 },
        heartbeat_missing: { label: 'Heartbeat absent', tone: 'high', rank: 3 },
        dead: { label: 'Hors service', tone: 'critical', rank: 4 },
        unknown: { label: 'Inconnu', tone: 'unknown', rank: 1 }
    };

    function asText(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback || '—';
        return String(value);
    }

    function asDate(value) {
        if (!value) return null;
        var date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDateTime(value) {
        var date = asDate(value);
        if (!date) return 'Non disponible';
        return new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'medium'
        }).format(date);
    }

    function formatRelative(value, now) {
        var date = asDate(value);
        if (!date) return 'Non disponible';
        var deltaSeconds = Math.round((date.getTime() - (now || Date.now())) / 1000);
        var absolute = Math.abs(deltaSeconds);
        var divisor = 1;
        var unit = 'second';
        if (absolute >= 86400) {
            divisor = 86400;
            unit = 'day';
        } else if (absolute >= 3600) {
            divisor = 3600;
            unit = 'hour';
        } else if (absolute >= 60) {
            divisor = 60;
            unit = 'minute';
        }
        return new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
            .format(Math.round(deltaSeconds / divisor), unit);
    }

    function normalizeState(value) {
        var state = String(value || 'unknown').toLowerCase();
        return STATE_META[state] ? state : 'unknown';
    }

    function stateMeta(value) {
        return STATE_META[normalizeState(value)];
    }

    function booleanLabel(value) {
        if (value === true) return 'Oui';
        if (value === false) return 'Non';
        return 'Inconnu';
    }

    function indicatorLabel(value) {
        var normalized = String(value || 'unknown').toLowerCase();
        if (normalized === 'ok') return 'OK';
        if (normalized === 'error' || normalized === 'critical') return 'Défaut';
        if (normalized === 'warning') return 'Attention';
        return 'Inconnu';
    }

    function indicatorState(value) {
        var normalized = String(value || 'unknown').toLowerCase();
        if (normalized === 'ok') return 'ok';
        if (normalized === 'error' || normalized === 'critical') return 'dead';
        if (normalized === 'warning') return 'cloud_down';
        return 'unknown';
    }

    function graceToMs(grace) {
        if (typeof grace === 'boolean') return 5 * 60 * 1000;
        var raw = grace && typeof grace === 'object'
            ? (grace.staleAfterMs !== undefined
                ? grace.staleAfterMs
                : (grace.ms !== undefined ? grace.ms : (grace.seconds !== undefined ? Number(grace.seconds) * 1000 : grace.duration)))
            : grace;
        var numeric = Number(raw);
        if (!Number.isFinite(numeric) || numeric <= 0) return 5 * 60 * 1000;
        return numeric < 10000 ? numeric * 1000 : numeric;
    }

    function isSnapshotStale(generatedAt, grace, now) {
        var date = asDate(generatedAt);
        if (!date) return false;
        return (now || Date.now()) - date.getTime() > graceToMs(grace);
    }

    function normalizeDevice(device, index) {
        var source = device && typeof device === 'object' ? device : {};
        var uuid = asText(source.uuid || source.id, 'device-' + index);
        var heartbeat = source.heartbeat && typeof source.heartbeat === 'object'
            ? source.heartbeat
            : null;
        return {
            uuid: uuid,
            name: asText(source.name || source.device_name, uuid),
            state: normalizeState(source.state),
            severity: asText(source.severity, stateMeta(source.state).tone),
            detail: asText(source.detail, 'Aucun détail fourni'),
            online: typeof source.online === 'boolean' ? source.online : source.is_online,
            hbOk: typeof source.hbOk === 'boolean' ? source.hbOk : source.heartbeatOk,
            lastConnectivity: source.lastConnectivity || source.last_connectivity_event || null,
            lastHeartbeat: source.lastHeartbeat || source.heartbeatAt
                || (heartbeat && (heartbeat.ts || heartbeat.receivedAt))
                || source.receivedAt || null,
            overallStatus: source.overallStatus || source.overall_status || null,
            heartbeat: heartbeat,
            device: source.device || null,
            health: source.health || null,
            mqtt: source.mqtt || null,
            buffer: source.buffer || null,
            snapshot: source.snapshot || null,
            supervisor: source.supervisor || null,
            gatewayGrace: Boolean(source.gatewayGrace),
            firstSeenAt: source.firstSeenAt || null,
            confirmedState: source.confirmedState || null,
            pendingConfirmation: source.pendingConfirmation || null,
            indicators: source.indicators || {
                bacnet: 'unknown',
                mqtt: 'unknown',
                buffer: 'unknown',
                supervisor: 'unknown'
            },
            recentTransitions: Array.isArray(source.recentTransitions)
                ? source.recentTransitions.slice(0, 10)
                : [],
            enrolled: Boolean(source.enrolled)
        };
    }

    function copyText(value) {
        var text = String(value || '');
        if (!text) return Promise.resolve(false);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function () {
                return true;
            }).catch(function () {
                return copyTextFallback(text);
            });
        }
        return Promise.resolve(copyTextFallback(text));
    }

    function copyTextFallback(text) {
        try {
            var input = document.createElement('textarea');
            input.value = text;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            return true;
        } catch (error) {
            return false;
        }
    }

    global.WatchdogHub = global.WatchdogHub || {};
    global.WatchdogHub.formatters = {
        asText: asText,
        booleanLabel: booleanLabel,
        formatDateTime: formatDateTime,
        formatRelative: formatRelative,
        graceToMs: graceToMs,
        indicatorLabel: indicatorLabel,
        indicatorState: indicatorState,
        isSnapshotStale: isSnapshotStale,
        normalizeDevice: normalizeDevice,
        normalizeState: normalizeState,
        stateMeta: stateMeta,
        copyText: copyText
    };
}(window));
