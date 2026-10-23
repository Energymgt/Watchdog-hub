'use strict';

const http = require('http');
const path = require('path');

function loadOutbox() {
    try {
        return require('./lib/fleet-outbox');
    } catch {
        return require('../fleet-outbox');
    }
}

function postJson(targetUrl, headers, body, timeoutMs) {
    const payload = Buffer.from(JSON.stringify(body));
    const target = new URL(targetUrl);
    if (target.protocol !== 'http:' || (target.hostname !== '127.0.0.1' && target.hostname !== 'localhost')) {
        return Promise.resolve({ statusCode: 0, json: null, errorKind: 'refused_target' });
    }
    return new Promise((resolve) => {
        const req = http.request({
            hostname: target.hostname,
            port: target.port,
            path: target.pathname,
            method: 'POST',
            headers: Object.assign({}, headers, { 'Content-Length': payload.length }),
            timeout: timeoutMs
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try {
                    json = raw ? JSON.parse(raw) : null;
                } catch {
                    json = null;
                }
                resolve({ statusCode: res.statusCode || 0, json, errorKind: null });
            });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ statusCode: 0, json: null, errorKind: 'timeout' });
        });
        req.on('error', (err) => {
            const code = err && err.code;
            const uncertain = code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE';
            resolve({ statusCode: 0, json: null, errorKind: uncertain ? 'timeout' : 'connect_failed' });
        });
        req.end(payload);
    });
}

module.exports = function (RED) {
    const { openOutbox } = loadOutbox();

    function ingestBase() {
        const port = Number(process.env.WATCHDOG_INGEST_PORT) || 8091;
        return 'http://127.0.0.1:' + port;
    }

    function authHeaders(node) {
        const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
        const token = String(process.env.WATCHDOG_INGEST_TOKEN || '').trim();
        if (token) headers['X-Watchdog-Token'] = token;
        let webhook = '';
        try {
            const cfg = node.context().flow.get('fleetAdminConfig') || {};
            webhook = String(cfg.teamsWebhookUrl || '').trim();
        } catch {
            webhook = '';
        }
        if (!webhook) webhook = String(process.env.TEAMS_WEBHOOK_URL || '').trim();
        return { headers, webhook };
    }

    function FleetTransitionOutbox(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const registryPath = process.env.WATCHDOG_REGISTRY_PATH || '';
        const file = process.env.WATCHDOG_OUTBOX_PATH
            || (registryPath ? path.join(path.dirname(registryPath), 'fleet-transition-outbox.jsonl') : path.join(RED.settings.userDir, 'fleet-transition-outbox.jsonl'));
        const outbox = openOutbox(file);
        let chain = Promise.resolve();
        let closed = false;

        function schedule(work) {
            chain = chain.then(work).catch(() => {
                node.warn('Transmission des transitions Fleet non confirmée');
            });
            return chain;
        }

        function paint() {
            const counts = { pending: 0, sending: 0, uncertain: 0, failed: 0, transmitted: 0 };
            for (const row of outbox.reduce().values()) {
                if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status] += 1;
            }
            const waiting = counts.pending + counts.uncertain + counts.sending;
            node.status({
                fill: counts.failed || counts.uncertain ? 'yellow' : (waiting ? 'blue' : 'green'),
                shape: 'dot',
                text: 'attente ' + waiting + ', échec ' + counts.failed + ', transmis ' + counts.transmitted
            });
        }

        async function dispatch(webhook, headers) {
            if (!webhook) return;
            const secretHeaders = Object.assign({}, headers, { 'X-Watchdog-Channel-Secret': webhook });
            await postJson(ingestBase() + '/v1/alerts/dispatch', secretHeaders, {}, 15000);
        }

        async function drain() {
            if (closed) return;
            const ready = outbox.due(Date.now()).slice(0, 100);
            if (!ready.length) {
                paint();
                return;
            }
            const ids = ready.map((row) => row.signal_id);
            const marked = outbox.markSending(ids);
            if (!marked.length) return;
            const sentIds = marked.map((row) => row.signal_id);
            const { headers, webhook } = authHeaders(node);
            const result = await postJson(ingestBase() + '/v1/alerts/device-transitions', headers, {
                transitions: marked.map((row) => row.transition)
            }, 15000);
            const accepted = result.statusCode >= 200 && result.statusCode < 300 && result.json && result.json.ok === true;
            if (accepted) {
                outbox.markTransmitted(sentIds, result.statusCode);
                await dispatch(webhook, headers);
            } else if (result.errorKind === 'timeout') {
                outbox.markRetry(sentIds, { uncertain: true, error: 'timeout' });
                node.warn('Transmission des transitions Fleet non confirmée');
            } else if (result.statusCode >= 400 && result.statusCode < 500 && result.statusCode !== 429) {
                outbox.markRetry(sentIds, {
                    permanent: true,
                    error: 'http_' + result.statusCode,
                    httpStatus: result.statusCode
                });
                node.warn('Transmission des transitions Fleet non confirmée');
            } else {
                outbox.markRetry(sentIds, {
                    error: result.errorKind || ('http_' + (result.statusCode || 0)),
                    httpStatus: result.statusCode || null
                });
                node.warn('Transmission des transitions Fleet non confirmée');
            }
            paint();
        }

        node.on('input', (msg, send, done) => {
            const transitions = msg && msg.payload && Array.isArray(msg.payload.transitions) ? msg.payload.transitions : [];
            schedule(async () => {
                if (transitions.length) outbox.enqueue(transitions);
                await drain();
            }).then(() => done(), (err) => done(err));
        });

        const timer = setInterval(() => {
            schedule(() => drain());
        }, 2000);
        if (typeof timer.unref === 'function') timer.unref();
        schedule(async () => {
            outbox.reconcileSending();
            await drain();
        });

        node.on('close', function (removed, done) {
            closed = true;
            clearInterval(timer);
            const finish = typeof removed === 'function' ? removed : done;
            if (typeof finish === 'function') finish();
        });
    }

    RED.nodes.registerType('fleet-transition-outbox', FleetTransitionOutbox);
};
