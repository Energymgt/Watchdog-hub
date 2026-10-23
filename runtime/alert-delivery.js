'use strict';

const { uuidV4FromSeed } = require('./anomalies');
const { createTeamsChannel, DEFAULT_TIMEOUT_MS } = require('./channels/teams');

/**
 * File de livraison Teams.
 *
 * Limite connue : le webhook Teams n'offre pas d'idempotence. Si le processus
 * s'arrête après l'émission HTTP et avant l'enregistrement du résultat, la ligne
 * reste `sending`. Au redémarrage elle devient `unknown` et une reprise est
 * planifiée avec `possible_duplicate`. Un doublon externe reste possible.
 * Les reprises 429 / 5xx / échec de connexion suivent le flux historique :
 * 2 reprises, 2 secondes d'intervalle.
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;
const CHANNEL = 'teams';

let cachedWebhook = '';
const inFlight = new Set();

function nowUtc(at) {
    const date = at instanceof Date ? at : new Date(at || Date.now());
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function rememberWebhook(value) {
    const text = String(value || '').trim();
    if (text) cachedWebhook = text;
    return cachedWebhook;
}

function resolveWebhook(explicit) {
    return String(explicit || cachedWebhook || process.env.TEAMS_WEBHOOK_URL || '').trim();
}

function isRetryable(result) {
    if (!result) return false;
    if (result.errorKind === 'timeout' || result.errorKind === 'connect_failed') return true;
    const code = Number(result.statusCode || 0) || 0;
    return code === 429 || code >= 500 || code === 0;
}

function isUncertain(result) {
    return Boolean(result && result.errorKind === 'timeout');
}

function terminalStatus(result) {
    if (result && result.ok) return 'sent';
    if (isUncertain(result)) return 'unknown';
    return 'failed';
}

function noticeFromAlert(alert, delivery) {
    const eventType = delivery.event_type;
    const stateLabel = eventType === 'recovery'
        ? 'OK'
        : (alert.device_state || alert.severity || '');
    const identity = alert.plan === 'flow'
        ? (alert.incident_id || alert.flow_id || alert.alert_id)
        : (alert.source_id || alert.alert_id);
    return {
        eventType,
        severity: alert.severity,
        subject: alert.subject_name || identity,
        value: `${identity} — ${stateLabel} — ${alert.detail || ''}`.trim(),
        at: delivery.created_at
    };
}

function enqueueDelivery(registry, alert, history, eventType, options = {}) {
    const at = options.at || nowUtc();
    const attempt = options.attempt || 1;
    const deliveryId = uuidV4FromSeed(
        `adelivery:${alert.alert_id}:${eventType}:${attempt}:${at}:${options.possibleDuplicate ? 1 : 0}`
    );
    registry.insertAlertDelivery({
        delivery_id: deliveryId,
        alert_id: alert.alert_id,
        history_id: history ? history.history_id : null,
        channel: CHANNEL,
        event_type: eventType,
        status: 'pending',
        attempt,
        possible_duplicate: options.possibleDuplicate ? 1 : 0,
        created_at: at,
        next_attempt_at: options.nextAttemptAt || null
    });
    return deliveryId;
}

function reconcileAbandoned(registry, options = {}) {
    const now = options.now || Date.now();
    const staleMs = Number.isFinite(options.staleMs) ? options.staleMs : (DEFAULT_TIMEOUT_MS + 5000);
    const forceAll = options.forceAll === true;
    let reconciled = 0;
    for (const row of registry.listSendingDeliveries()) {
        if (inFlight.has(row.delivery_id)) continue;
        const started = Date.parse(row.started_at || row.created_at || 0);
        if (!forceAll && Number.isFinite(started) && (now - started) < staleMs) continue;
        const finishedAt = nowUtc(now);
        registry.finishAlertDelivery(row.delivery_id, {
            status: 'unknown',
            error_kind: 'uncertain',
            possible_duplicate: 1,
            finished_at: finishedAt
        });
        reconciled += 1;
        if (Number(row.attempt) < 1 + MAX_RETRIES) {
            const alert = registry.getAlert(row.alert_id);
            if (!alert) continue;
            enqueueDelivery(registry, alert, null, row.event_type, {
                at: finishedAt,
                attempt: Number(row.attempt) + 1,
                possibleDuplicate: true,
                nextAttemptAt: nowUtc(now + RETRY_DELAY_MS)
            });
        }
    }
    return reconciled;
}

async function runDispatch(registry, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const webhookUrl = resolveWebhook(options.webhookUrl);
    if (options.webhookUrl) rememberWebhook(options.webhookUrl);
    reconcileAbandoned(registry, {
        now,
        staleMs: options.staleMs,
        forceAll: options.reconcileAll === true
    });
    const summary = {
        processed: 0,
        sent: 0,
        failed: 0,
        unknown: 0,
        pending: registry.countPendingDeliveries(),
        retries: 0
    };
    if (!webhookUrl) return summary;

    const channel = options.channel || createTeamsChannel({
        transport: options.transport,
        timeoutMs: options.timeoutMs
    });
    const due = registry.listDueDeliveries(nowUtc(now), options.limit || 20);
    for (const row of due) {
        const startedAt = nowUtc(now);
        if (!registry.claimAlertDelivery(row.delivery_id, startedAt)) continue;
        inFlight.add(row.delivery_id);
        summary.processed += 1;
        const alert = registry.getAlert(row.alert_id);
        try {
            let result;
            try {
                result = alert
                    ? await channel.send(noticeFromAlert(alert, row), { webhookUrl })
                    : { ok: false, statusCode: 0, errorKind: 'connect_failed' };
            } catch {
                result = { ok: false, statusCode: 0, errorKind: 'timeout' };
            }
            if (result && result.errorKind === 'channel_unconfigured') {
                registry.finishAlertDelivery(row.delivery_id, {
                    status: 'pending',
                    error_kind: null,
                    possible_duplicate: row.possible_duplicate,
                    finished_at: null
                });
                continue;
            }
            const status = terminalStatus(result);
            const uncertain = isUncertain(result);
            registry.finishAlertDelivery(row.delivery_id, {
                status,
                http_status: result && result.statusCode ? result.statusCode : null,
                error_kind: result && result.ok ? null : (uncertain ? 'uncertain' : (result && result.errorKind) || 'http_status'),
                possible_duplicate: uncertain || row.possible_duplicate ? 1 : 0,
                finished_at: nowUtc()
            });
            if (status === 'sent') summary.sent += 1;
            else if (status === 'unknown') summary.unknown += 1;
            else summary.failed += 1;

            const canRetry = status !== 'sent' && isRetryable(result) && Number(row.attempt) < 1 + MAX_RETRIES;
            if (canRetry && alert) {
                enqueueDelivery(registry, alert, null, row.event_type, {
                    at: nowUtc(),
                    attempt: Number(row.attempt) + 1,
                    possibleDuplicate: uncertain || Number(row.possible_duplicate) === 1,
                    nextAttemptAt: nowUtc(now + RETRY_DELAY_MS)
                });
                summary.retries += 1;
            }
        } finally {
            inFlight.delete(row.delivery_id);
        }
    }
    summary.pending = registry.countPendingDeliveries();
    return summary;
}

function startDeliveryScheduler(registry, options = {}) {
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : RETRY_DELAY_MS;
    const timer = setInterval(() => {
        runDispatch(registry, options).catch(() => {
            /* le résultat reste en base ; pas de journal du canal */
        });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return function stopDeliveryScheduler() {
        clearInterval(timer);
    };
}

module.exports = {
    MAX_RETRIES,
    RETRY_DELAY_MS,
    CHANNEL,
    rememberWebhook,
    resolveWebhook,
    enqueueDelivery,
    reconcileAbandoned,
    runDispatch,
    startDeliveryScheduler
};
