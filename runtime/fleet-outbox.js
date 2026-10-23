'use strict';

const fs = require('fs');
const path = require('path');

const RETRY_BASE_MS = 2000;
const RETRY_CAP_MS = 30000;

function nowIso(at) {
    const date = at instanceof Date ? at : new Date(typeof at === 'number' ? at : Date.now());
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function delayMs(attempt) {
    const n = Math.max(1, Number(attempt) || 1);
    return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * (2 ** Math.min(n - 1, 8)));
}

function signalIdOf(transition) {
    if (!transition || typeof transition !== 'object') return '';
    const given = String(transition.signal_id || '').trim();
    if (/^[A-Za-z0-9:._|-]{1,200}$/.test(given)) return given;
    const uuid = String(transition.uuid || '').trim();
    const to = String(transition.to || '').trim();
    if (!uuid || !to) return '';
    return [
        'fleet',
        uuid,
        String(transition.from || ''),
        to,
        String(transition.direction || ''),
        String(transition.at || '')
    ].join(':');
}

function openOutbox(filePath) {
    const file = path.resolve(filePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    function append(record) {
        const line = JSON.stringify(record) + '\n';
        const fd = fs.openSync(file, 'a');
        try {
            fs.writeSync(fd, line);
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
    }

    function readAll() {
        if (!fs.existsSync(file)) return [];
        const rows = [];
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
            if (!line) continue;
            try {
                rows.push(JSON.parse(line));
            } catch {
                rows.push(null);
            }
        }
        return rows;
    }

    function reduce(rows) {
        const byId = new Map();
        for (const row of rows || readAll()) {
            if (!row || !row.signal_id) continue;
            byId.set(row.signal_id, row);
        }
        return byId;
    }

    function publicTransition(transition, signalId) {
        return {
            uuid: transition.uuid,
            name: transition.name || '',
            from: transition.from || '',
            to: transition.to,
            severity: transition.severity || '',
            detail: transition.detail || '',
            direction: transition.direction || '',
            at: transition.at == null ? null : transition.at,
            signal_id: signalId,
            confirmed: true
        };
    }

    function enqueue(transitions, at) {
        const stamp = nowIso(at);
        const current = reduce();
        const created = [];
        for (const transition of transitions || []) {
            const signalId = signalIdOf(transition);
            if (!signalId) continue;
            const existing = current.get(signalId);
            if (existing && existing.status !== 'failed') continue;
            const record = {
                signal_id: signalId,
                status: 'pending',
                attempt: 0,
                transition: publicTransition(transition, signalId),
                queued_at: stamp,
                updated_at: stamp,
                next_attempt_at: stamp,
                last_error: null,
                last_http_status: null
            };
            append(record);
            current.set(signalId, record);
            created.push(record);
        }
        return created;
    }

    function reconcileSending(at) {
        const stamp = nowIso(at);
        let count = 0;
        for (const row of reduce().values()) {
            if (row.status !== 'sending') continue;
            append(Object.assign({}, row, {
                status: 'uncertain',
                updated_at: stamp,
                last_error: 'interrupted',
                next_attempt_at: stamp
            }));
            count += 1;
        }
        return count;
    }

    function due(at) {
        const now = at instanceof Date ? at.getTime() : (typeof at === 'number' ? at : Date.now());
        const ready = [];
        for (const row of reduce().values()) {
            if (row.status !== 'pending' && row.status !== 'uncertain') continue;
            const when = Date.parse(row.next_attempt_at || 0);
            if (!Number.isFinite(when) || when <= now) ready.push(row);
        }
        return ready;
    }

    function markSending(signalIds, at) {
        const stamp = nowIso(at);
        const current = reduce();
        const marked = [];
        for (const signalId of signalIds) {
            const row = current.get(signalId);
            if (!row || (row.status !== 'pending' && row.status !== 'uncertain')) continue;
            const next = Object.assign({}, row, {
                status: 'sending',
                attempt: Number(row.attempt || 0) + 1,
                updated_at: stamp,
                next_attempt_at: null
            });
            append(next);
            marked.push(next);
        }
        return marked;
    }

    function markTransmitted(signalIds, httpStatus, at) {
        const stamp = nowIso(at);
        const current = reduce();
        for (const signalId of signalIds) {
            const row = current.get(signalId);
            if (!row) continue;
            append(Object.assign({}, row, {
                status: 'transmitted',
                updated_at: stamp,
                last_http_status: httpStatus || null,
                last_error: null,
                next_attempt_at: null
            }));
        }
    }

    function markRetry(signalIds, info, at) {
        const when = typeof at === 'number' ? at : Date.now();
        const stamp = nowIso(when);
        const current = reduce();
        for (const signalId of signalIds) {
            const row = current.get(signalId);
            if (!row) continue;
            const attempt = Number(row.attempt || 1);
            const permanent = Boolean(info && info.permanent);
            const uncertain = Boolean(info && info.uncertain);
            append(Object.assign({}, row, {
                status: permanent ? 'failed' : (uncertain ? 'uncertain' : 'pending'),
                updated_at: stamp,
                last_error: info && info.error ? String(info.error).slice(0, 80) : null,
                last_http_status: info && Number.isInteger(info.httpStatus) ? info.httpStatus : null,
                next_attempt_at: permanent ? null : nowIso(when + delayMs(attempt))
            }));
        }
    }

    return {
        file,
        enqueue,
        reconcileSending,
        due,
        markSending,
        markRetry,
        markTransmitted,
        reduce,
        readAll
    };
}

module.exports = {
    openOutbox,
    signalIdOf,
    delayMs,
    nowIso,
    RETRY_BASE_MS,
    RETRY_CAP_MS
};
