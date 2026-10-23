'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { openRegistry } = require('../runtime/registry');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME = process.env.QUALIFY_RUNTIME || 'C:\\DEV_local\\watchdog-qualify-runtime';
const DATA = path.resolve(process.env.QUALIFY_DATA || 'C:\\DEV_local\\watchdog-qualify-data\\ui-stack');
const PORT = 18951;
const INGEST_PORT = 18097;
const MOCK_PORT = 18098;
const TOKEN = 'qual-ingest-token';
const MOCK_URL = 'http://127.0.0.1:' + MOCK_PORT + '/hook';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(port, method, pathname, body, headers) {
    return new Promise((resolve, reject) => {
        const payload = body == null ? null : Buffer.from(JSON.stringify(body));
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            method,
            path: pathname,
            headers: Object.assign({ Accept: 'application/json' }, payload ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            } : {}, headers || {}),
            timeout: 15000
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
                resolve({ status: res.statusCode, raw, json });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (payload) req.end(payload);
        else req.end();
    });
}

function prepare() {
    fs.rmSync(DATA, { recursive: true, force: true });
    fs.mkdirSync(DATA, { recursive: true });
    const modules = path.join(RUNTIME, 'node_modules').replace(/\\/g, '/');
    const userDir = DATA.replace(/\\/g, '/');
    fs.writeFileSync(path.join(DATA, 'settings.js'), `'use strict';
module.paths.unshift(${JSON.stringify(modules)});
const bcrypt = require('bcryptjs');
module.exports = {
    uiPort: ${PORT},
    userDir: ${JSON.stringify(userDir)},
    flowFile: 'flows.json',
    credentialSecret: 'qual-encryption-key',
    adminAuth: { type: 'credentials', users: [{ username: 'admin', password: bcrypt.hashSync('qual-pass', 8), permissions: '*' }] },
    editorTheme: { projects: { enabled: false } },
    logging: { console: { level: 'info', metrics: false, audit: false } },
    contextStorage: { default: { module: 'localfilesystem' } },
    functionTimeout: 0
};
`);
    const flow = JSON.parse(fs.readFileSync(path.join(ROOT, 'flows', '04_Watchdog_Hub.json'), 'utf8'));
    const broker = flow.find((node) => node.id === 'c4b9e2d1a8f35090');
    if (broker) {
        broker.broker = '127.0.0.1';
        broker.port = '1';
        broker.autoConnect = false;
    }
    fs.writeFileSync(path.join(DATA, 'flows.json'), JSON.stringify(flow));
    const dest = path.join(DATA, 'uibuilder', 'watchdog-hub', 'src');
    fs.cpSync(path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src'), dest, { recursive: true });
    fs.mkdirSync(path.join(dest, 'vendor'), { recursive: true });
    const vue = path.join(RUNTIME, 'node_modules', 'vue', 'dist', 'vue.global.prod.js');
    if (fs.existsSync(vue)) fs.copyFileSync(vue, path.join(dest, 'vendor', 'vue.global.prod.js'));
    fs.mkdirSync(path.join(DATA, 'nodes', 'lib'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'runtime', 'nodes', 'fleet-transition-outbox.js'), path.join(DATA, 'nodes', 'fleet-transition-outbox.js'));
    fs.copyFileSync(path.join(ROOT, 'runtime', 'nodes', 'fleet-transition-outbox.html'), path.join(DATA, 'nodes', 'fleet-transition-outbox.html'));
    fs.copyFileSync(path.join(ROOT, 'runtime', 'fleet-outbox.js'), path.join(DATA, 'nodes', 'lib', 'fleet-outbox.js'));
}

function childEnv() {
    return Object.assign({}, process.env, {
        PASSWORD: 'qual-pass',
        ENCRYPTION_KEY: 'qual-encryption-key',
        USERNAME: 'admin',
        TEAMS_WEBHOOK_URL: MOCK_URL,
        BALENA_API_TOKEN: '',
        BALENA_APP_IDS: '',
        BALENA_APP_ID: '',
        WATCHDOG_INGEST_TOKEN: TOKEN,
        WATCHDOG_INGEST_BIND: '127.0.0.1',
        WATCHDOG_INGEST_PORT: String(INGEST_PORT),
        WATCHDOG_REGISTRY_PATH: path.join(DATA, 'watchdog-registry.sqlite'),
        WATCHDOG_OUTBOX_PATH: path.join(DATA, 'fleet-transition-outbox.jsonl'),
        NODE_PATH: path.join(RUNTIME, 'node_modules')
    });
}

function spawnLogged(args, logName) {
    const log = fs.createWriteStream(path.join(DATA, logName), { flags: 'a' });
    const child = spawn(process.execPath, args, { cwd: ROOT, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    return child;
}

async function waitOk(port, pathname) {
    const started = Date.now();
    while (Date.now() - started < 90000) {
        try {
            const res = await request(port, 'GET', pathname, null, pathname.startsWith('/v1/') ? { 'X-Watchdog-Token': TOKEN } : {});
            if (res.status === 200) return res;
        } catch { /* pas encore prêt */ }
        await sleep(400);
    }
    throw new Error('indisponible ' + port + pathname);
}

async function transition(uuid, to, signal, direction) {
    return request(INGEST_PORT, 'POST', '/v1/alerts/device-transitions', {
        transitions: [{
            uuid, name: 'Qual ' + uuid, from: 'ok', to, direction: direction || 'down',
            severity: to === 'dead' ? 'critical' : 'high', confirmed: true, signal_id: signal, at: 1000
        }]
    }, { 'X-Watchdog-Token': TOKEN });
}

async function main() {
    prepare();
    const mock = http.createServer((req, res) => {
        const code = mock.fail ? 500 : 202;
        const body = JSON.stringify({ ok: code === 202 });
        res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
    });
    mock.fail = true;
    await new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve));
    const ingest = spawnLogged([path.join(ROOT, 'runtime', 'server.js')], 'ingest.log');
    const nodered = spawnLogged([
        path.join(RUNTIME, 'node_modules', 'node-red', 'red.js'),
        '--userDir', DATA,
        '--settings', path.join(DATA, 'settings.js')
    ], 'nodered.log');
    await waitOk(INGEST_PORT, '/healthz');
    await waitOk(PORT, '/');
    await transition('device-echec', 'dead', 'fleet:device-echec:ok:dead:down:1');
    await sleep(8000);
    mock.fail = false;
    const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'valid', 'meteo-timeout.json'), 'utf8'));
    for (const suffix of ['1', '2']) {
        const event = Object.assign({}, fixture, {
            event_id: suffix === '1' ? '11111111-1111-4111-8111-111111111101' : '11111111-1111-4111-8111-111111111102',
            execution_id: 'ui-' + suffix
        });
        await request(INGEST_PORT, 'POST', '/v1/events', event, { 'X-Watchdog-Token': TOKEN });
    }
    await transition('device-ouverte', 'heartbeat_missing', 'fleet:device-ouverte:ok:heartbeat_missing:down:1');
    await transition('device-close', 'dead', 'fleet:device-close:ok:dead:down:1');
    await transition('device-close', 'ok', 'fleet:device-close:dead:ok:up:2', 'up');
    const listed = await request(INGEST_PORT, 'GET', '/v1/alerts?status=active&limit=20', null, { 'X-Watchdog-Token': TOKEN });
    const failed = (listed.json.alerts || []).find((row) => row.source_id === 'device-echec');
    const registry = openRegistry(path.join(DATA, 'watchdog-registry.sqlite'));
    if (failed) {
        registry.insertAlertDelivery({
            delivery_id: 'delivery-unknown-ui',
            alert_id: failed.alert_id,
            channel: 'teams',
            event_type: 'trigger',
            status: 'unknown',
            attempt: 4,
            error_kind: 'uncertain',
            possible_duplicate: 1,
            http_status: null,
            created_at: '2026-10-23T11:40:00Z',
            finished_at: '2026-10-23T11:40:01Z'
        });
        registry.insertAlertDelivery({
            delivery_id: 'delivery-pending-ui',
            alert_id: failed.alert_id,
            channel: 'teams',
            event_type: 'trigger',
            status: 'pending',
            attempt: 5,
            possible_duplicate: 1,
            created_at: '2026-10-23T11:40:02Z',
            next_attempt_at: '2026-10-24T11:40:02Z'
        });
    }
    registry.close();
    const page = await request(PORT, 'GET', '/watchdog-hub/index.html');
    const summary = await request(INGEST_PORT, 'GET', '/v1/alerts?limit=20', null, { 'X-Watchdog-Token': TOKEN });
    const incidents = await request(INGEST_PORT, 'GET', '/v1/incidents?limit=20', null, { 'X-Watchdog-Token': TOKEN });
    fs.writeFileSync(path.join(DATA, 'ready.json'), JSON.stringify({
        url: 'http://127.0.0.1:' + PORT + '/watchdog-hub/#alerts',
        pageStatus: page.status,
        hasAlertsHeading: page.raw.includes('Alertes'),
        hasToken: page.raw.includes(TOKEN),
        summary: summary.json && summary.json.summary,
        alerts: (summary.json.alerts || []).map((row) => ({
            id: row.alert_id, source: row.source_id, status: row.status, severity: row.severity,
            incident: row.incident_id, delivery: row.latest_delivery && row.latest_delivery.status
        })),
        incidents: (incidents.json.incidents || []).map((row) => ({ id: row.incident_id, state: row.state }))
    }, null, 2));
    process.stdout.write('UI ready http://127.0.0.1:' + PORT + '/watchdog-hub/#alerts\n');
    await new Promise(() => {});
    ingest.unref();
    nodered.unref();
}

main().catch((err) => {
    process.stderr.write(err.stack + '\n');
    process.exit(1);
});
