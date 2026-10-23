'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { openOutbox, delayMs, RETRY_CAP_MS } = require('../runtime/fleet-outbox');

function tempFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-outbox-'));
    return { dir, file: path.join(dir, 'fleet-transition-outbox.jsonl') };
}

function transition(id) {
    return {
        uuid: 'device-1',
        name: 'Banc',
        from: 'ok',
        to: 'dead',
        severity: 'critical',
        detail: 'hors service',
        direction: 'down',
        at: 1000,
        signal_id: id,
        confirmed: true,
        webhook_url: 'https://secret.example/hook',
        headers: { 'X-Watchdog-Channel-Secret': 'super-secret' }
    };
}

test('enregistre la transition avant toute reprise et ignore le secret', () => {
    const { dir, file } = tempFile();
    try {
        const first = openOutbox(file);
        const created = first.enqueue([transition('sig-1')]);
        assert.equal(created.length, 1);
        assert.equal(created[0].status, 'pending');
        const raw = fs.readFileSync(file, 'utf8');
        assert.equal(raw.includes('secret.example'), false);
        assert.equal(raw.includes('super-secret'), false);
        const second = openOutbox(file);
        assert.equal(second.enqueue([transition('sig-1')]).length, 0);
        assert.equal(second.reduce().size, 1);
        assert.equal(second.reduce().get('sig-1').status, 'pending');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('qualifie sending comme incertain au réouverture et ne transmet qu’après confirmation', () => {
    const { dir, file } = tempFile();
    try {
        const outbox = openOutbox(file);
        outbox.enqueue([transition('sig-2')]);
        assert.equal(outbox.markSending(['sig-2']).length, 1);
        assert.equal(outbox.reduce().get('sig-2').status, 'sending');
        const reopened = openOutbox(file);
        assert.equal(reopened.reconcileSending(), 1);
        assert.equal(reopened.reduce().get('sig-2').status, 'uncertain');
        assert.equal(reopened.reduce().get('sig-2').last_error, 'interrupted');
        assert.equal(reopened.due(Date.now()).length, 1);
        reopened.markTransmitted(['sig-2'], 202);
        assert.equal(reopened.reduce().get('sig-2').status, 'transmitted');
        assert.equal(reopened.due(Date.now()).length, 0);
        assert.equal(reopened.enqueue([transition('sig-2')]).length, 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('borne le délai de reprise et laisse une erreur permanente visible', () => {
    const { dir, file } = tempFile();
    try {
        assert.equal(delayMs(1), 2000);
        assert.equal(delayMs(20), RETRY_CAP_MS);
        const outbox = openOutbox(file);
        outbox.enqueue([transition('sig-3')], Date.parse('2026-10-23T10:00:00Z'));
        outbox.markSending(['sig-3'], Date.parse('2026-10-23T10:00:00Z'));
        outbox.markRetry(['sig-3'], { error: 'connect_failed' }, Date.parse('2026-10-23T10:00:00Z'));
        const row = outbox.reduce().get('sig-3');
        assert.equal(row.status, 'pending');
        assert.equal(row.last_error, 'connect_failed');
        assert.equal(outbox.due(Date.parse('2026-10-23T10:00:01Z')).length, 0);
        assert.equal(outbox.due(Date.parse('2026-10-23T10:00:02Z')).length, 1);
        outbox.markSending(['sig-3'], Date.parse('2026-10-23T10:00:02Z'));
        outbox.markRetry(['sig-3'], { permanent: true, error: 'http_400', httpStatus: 400 }, Date.parse('2026-10-23T10:00:02Z'));
        assert.equal(outbox.reduce().get('sig-3').status, 'failed');
        assert.equal(outbox.reduce().get('sig-3').last_http_status, 400);
        assert.equal(outbox.due(Date.parse('2026-10-23T12:00:00Z')).length, 0);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('ignore une dernière ligne déchirée et conserve l’état précédent', () => {
    const { dir, file } = tempFile();
    try {
        const outbox = openOutbox(file);
        outbox.enqueue([transition('sig-4')]);
        fs.appendFileSync(file, '{"signal_id":"sig-4","status":"transmi');
        const reopened = openOutbox(file);
        assert.equal(reopened.readAll().includes(null), true);
        assert.equal(reopened.reduce().get('sig-4').status, 'pending');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
