'use strict';

const http = require('http');
const https = require('https');

/**
 * Canal Teams. Le webhook n'est jamais journalisé ni renvoyé.
 * La livraison est au mieux une fois : un timeout après émission peut avoir été accepté
 * par Teams. L'appelant trace alors un résultat `unknown` et une reprise `possible_duplicate`.
 */

const DEFAULT_TIMEOUT_MS = 120000;

function parisTime(ts) {
    try {
        return new Date(ts).toLocaleString('fr-CH', { timeZone: 'Europe/Paris' });
    } catch {
        return new Date(ts).toISOString();
    }
}

function titleFor(eventType, severity) {
    if (eventType === 'recovery') return '[RECOVERY] HUB Watchdog Hub';
    if (severity === 'critical') return '[CRITIQUE] HUB Watchdog Hub';
    return '[ALERTE] HUB Watchdog Hub';
}

function colorFor(eventType, severity) {
    if (eventType === 'recovery') return 'good';
    if (severity === 'critical') return 'attention';
    return 'warning';
}

/**
 * Même gabarit Adaptive Card que la carte flotte historique, pour une seule alerte.
 * @param {{ eventType: string, severity: string, subject: string, value: string, at: string|number }} notice
 */
function buildTeamsCard(notice) {
    const eventType = notice.eventType === 'recovery' ? 'recovery' : notice.eventType;
    const severity = notice.severity === 'critical' ? 'critical' : 'high';
    return {
        type: 'message',
        attachments: [{
            contentType: 'application/vnd.microsoft.teams.card.adaptive',
            contentUrl: null,
            content: {
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                type: 'AdaptiveCard',
                version: '1.4',
                body: [
                    {
                        type: 'TextBlock',
                        size: 'Large',
                        weight: 'Bolder',
                        text: titleFor(eventType, severity),
                        wrap: true,
                        color: colorFor(eventType, severity)
                    },
                    {
                        type: 'FactSet',
                        facts: [
                            { title: 'Source', value: 'HUB de supervision' },
                            { title: 'Quand', value: parisTime(notice.at || Date.now()) },
                            { title: String(notice.subject || 'Alerte'), value: String(notice.value || '') }
                        ]
                    }
                ]
            }
        }]
    };
}

function classifyTransportError(err) {
    const code = err && err.code;
    if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
        return 'timeout';
    }
    return 'connect_failed';
}

function defaultTeamsTransport(request) {
    const timeoutMs = Number(request.timeoutMs) > 0 ? Number(request.timeoutMs) : DEFAULT_TIMEOUT_MS;
    return new Promise((resolve) => {
        let target;
        try {
            target = new URL(String(request.url || ''));
        } catch {
            resolve({ ok: false, statusCode: 0, errorKind: 'connect_failed' });
            return;
        }
        if (target.protocol !== 'https:' && target.protocol !== 'http:') {
            resolve({ ok: false, statusCode: 0, errorKind: 'connect_failed' });
            return;
        }
        const lib = target.protocol === 'https:' ? https : http;
        const payload = Buffer.from(JSON.stringify(request.body || {}));
        const req = lib.request({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || undefined,
            path: `${target.pathname}${target.search}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            },
            timeout: timeoutMs
        }, (res) => {
            res.resume();
            res.on('end', () => {
                const statusCode = Number(res.statusCode || 0) || 0;
                if (statusCode >= 200 && statusCode < 300) {
                    resolve({ ok: true, statusCode });
                    return;
                }
                resolve({ ok: false, statusCode, errorKind: 'http_status' });
            });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, statusCode: 0, errorKind: 'timeout' });
        });
        req.on('error', (err) => {
            resolve({ ok: false, statusCode: 0, errorKind: classifyTransportError(err) });
        });
        req.write(payload);
        req.end();
    });
}

/**
 * Interface interne du canal. `webhookUrl` reste hors du message persisté.
 */
function createTeamsChannel(options = {}) {
    const transport = options.transport || defaultTeamsTransport;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    return {
        name: 'teams',
        send(notice, context = {}) {
            const webhookUrl = String(context.webhookUrl || '').trim();
            if (!webhookUrl) {
                return Promise.resolve({ ok: false, statusCode: 0, errorKind: 'channel_unconfigured' });
            }
            return transport({
                url: webhookUrl,
                body: buildTeamsCard(notice),
                timeoutMs
            });
        }
    };
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    buildTeamsCard,
    createTeamsChannel,
    defaultTeamsTransport
};
