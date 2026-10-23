'use strict';

/**
 * Redémarrage complet du couple Node-RED + ingest, canal Teams simulé sur 127.0.0.1.
 * Aucun webhook Teams réel.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME = process.env.QUALIFY_RUNTIME || 'C:\\DEV_local\\watchdog-qualify-runtime';
const DATA = path.resolve(process.env.QUALIFY_DATA || 'C:\\DEV_local\\watchdog-qualify-data\\runtime-restart');
const PORT = Number(process.env.QUALIFY_NR_PORT || 18941);
const INGEST_PORT = Number(process.env.QUALIFY_INGEST_PORT || 18095);
const MOCK_PORT = Number(process.env.QUALIFY_MOCK_PORT || 18096);
const TOKEN = 'qual-ingest-token';
const PASSWORD = 'qual-pass';
const SECRET = 'qual-channel-secret-not-real';
const MOCK_URL = 'http://127.0.0.1:' + MOCK_PORT + '/hook';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(port, method, pathname, body, headers, timeoutMs) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined || body === null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            method,
            path: pathname,
            headers: Object.assign({
                Accept: 'application/json'
            }, payload ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length
            } : {}, headers || {}),
            timeout: timeoutMs || 8000
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
                resolve({ status: res.statusCode, raw, json });
            });
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout ' + method + ' ' + pathname));
        });
        req.on('error', reject);
        if (payload) req.end(payload);
        else req.end();
    });
}

function writeSettings() {
    const runtimeModules = path.join(RUNTIME, 'node_modules').replace(/\\/g, '/');
    const userDir = DATA.replace(/\\/g, '/');
    fs.writeFileSync(path.join(DATA, 'settings.js'), `'use strict';
module.paths.unshift(${JSON.stringify(runtimeModules)});
const bcrypt = require('bcryptjs');
module.exports = {
    uiPort: ${PORT},
    userDir: ${JSON.stringify(userDir)},
    flowFile: 'flows.json',
    credentialSecret: 'qual-encryption-key',
    adminAuth: {
        type: 'credentials',
        users: [{ username: 'admin', password: bcrypt.hashSync('qual-pass', 8), permissions: '*' }]
    },
    editorTheme: { projects: { enabled: false } },
    logging: { console: { level: 'info', metrics: false, audit: false } },
    contextStorage: { default: { module: 'localfilesystem' } },
    functionTimeout: 0
};
`);
}

function prepareFlow() {
    const flow = JSON.parse(fs.readFileSync(path.join(ROOT, 'flows', '04_Watchdog_Hub.json'), 'utf8'));
    const broker = flow.find((node) => node.id === 'c4b9e2d1a8f35090');
    if (broker) {
        broker.broker = '127.0.0.1';
        broker.port = '1';
        broker.autoConnect = false;
    }
    fs.writeFileSync(path.join(DATA, 'flows.json'), JSON.stringify(flow));
    const src = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');
    const dest = path.join(DATA, 'uibuilder', 'watchdog-hub', 'src');
    fs.cpSync(src, dest, { recursive: true });
    const vue = path.join(RUNTIME, 'node_modules', 'vue', 'dist', 'vue.global.prod.js');
    fs.mkdirSync(path.join(dest, 'vendor'), { recursive: true });
    if (fs.existsSync(vue)) fs.copyFileSync(vue, path.join(vendorPath(dest), 'vue.global.prod.js'));
    const nodeDest = path.join(DATA, 'nodes');
    fs.mkdirSync(path.join(nodeDest, 'lib'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'runtime', 'nodes', 'fleet-transition-outbox.js'), path.join(nodeDest, 'fleet-transition-outbox.js'));
    fs.copyFileSync(path.join(ROOT, 'runtime', 'nodes', 'fleet-transition-outbox.html'), path.join(nodeDest, 'fleet-transition-outbox.html'));
    fs.copyFileSync(path.join(ROOT, 'runtime', 'fleet-outbox.js'), path.join(nodeDest, 'lib', 'fleet-outbox.js'));
}

function vendorPath(dest) {
    return path.join(dest, 'vendor');
}

function childEnv() {
    return Object.assign({}, process.env, {
        PASSWORD,
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
    const logPath = path.join(DATA, logName);
    const log = fs.createWriteStream(logPath, { flags: 'a' });
    const child = spawn(process.execPath, args, {
        cwd: ROOT,
        env: childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    child.logPath = logPath;
    return child;
}

function stopProcess(child) {
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            try { child.kill(); } catch { /* déjà arrêté */ }
            resolve();
        }, 4000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
        try { child.kill(); } catch { clearTimeout(timer); resolve(); }
    });
}

async function waitFor(label, fn, timeoutMs) {
    const started = Date.now();
    let last = '';
    while (Date.now() - started < timeoutMs) {
        try {
            if (await fn()) return;
        } catch (err) {
            last = err.message;
        }
        await sleep(400);
    }
    throw new Error(label + ' indisponible' + (last ? ' (' + last + ')' : ''));
}

function logHas(logPath, text) {
    return fs.existsSync(logPath) && fs.readFileSync(logPath, 'utf8').includes(text);
}

function withDb(fn) {
    const db = new DatabaseSync(path.join(DATA, 'watchdog-registry.sqlite'), { readOnly: true });
    try {
        return fn(db);
    } finally {
        db.close();
    }
}

function alertRows() {
    return withDb((db) => db.prepare('SELECT alert_id, status, severity, acknowledged_by, incident_id, source_id FROM alerts ORDER BY opened_at').all());
}

function deliveryRows(alertId) {
    return withDb((db) => db.prepare(
        'SELECT status, attempt, http_status, error_kind, possible_duplicate, event_type FROM alert_deliveries WHERE alert_id = ? ORDER BY created_at, attempt'
    ).all(alertId));
}

function dbContains(needle) {
    const file = path.join(DATA, 'watchdog-registry.sqlite');
    if (!fs.existsSync(file)) return false;
    return fs.readFileSync(file).includes(Buffer.from(needle));
}

function startMock() {
    const state = { mode: 'down', seen: 0, server: null };
    function listen() {
        state.server = http.createServer((req, res) => {
            req.on('error', () => {});
            res.on('error', () => {});
            state.seen += 1;
            if (state.mode === 'hang') return;
            const code = state.mode === 'fail' ? 500 : 202;
            const body = JSON.stringify({ ok: code === 202 });
            res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
            res.end(body);
        });
        state.server.on('clientError', (err, socket) => {
            if (socket && !socket.destroyed) socket.destroy();
        });
        return new Promise((resolve) => state.server.listen(MOCK_PORT, '127.0.0.1', resolve));
    }
    return {
        state,
        listen,
        async setMode(mode) {
            state.mode = mode;
            if (mode === 'down') {
                if (state.server) {
                    await new Promise((resolve) => state.server.close(resolve));
                    state.server = null;
                }
                return;
            }
            if (!state.server) await listen();
        },
        close() {
            if (state.server) state.server.close();
        }
    };
}

async function startRuntime(mock, logSuffix) {
    const ingest = spawnLogged([path.join(ROOT, 'runtime', 'server.js')], 'ingest' + logSuffix + '.log');
    const redJs = path.join(RUNTIME, 'node_modules', 'node-red', 'red.js');
    const nodered = spawnLogged([redJs, '--userDir', DATA, '--settings', path.join(DATA, 'settings.js')], 'nodered' + logSuffix + '.log');
    await waitFor('ingest', async () => (await request(INGEST_PORT, 'GET', '/healthz')).status === 200, 20000);
    await waitFor('node-red', async () => logHas(nodered.logPath, 'Started flows'), 90000);
    return { ingest, nodered };
}

async function postTransition(uuid, to, signal) {
    return request(INGEST_PORT, 'POST', '/v1/alerts/device-transitions', {
        transitions: [{
            uuid,
            name: 'Qual ' + uuid,
            from: 'ok',
            to,
            severity: to === 'dead' ? 'critical' : 'high',
            direction: 'down',
            confirmed: true,
            signal_id: signal,
            at: 1000,
            webhook_url: SECRET
        }]
    }, { 'X-Watchdog-Token': TOKEN }, 20000);
}

async function main() {
    fs.rmSync(DATA, { recursive: true, force: true });
    fs.mkdirSync(DATA, { recursive: true });
    writeSettings();
    prepareFlow();
    const mock = startMock();
    const report = { data: DATA };
    let runtime = null;
    try {
        await mock.setMode('down');
        runtime = await startRuntime(mock, '-a');
        const posted = await postTransition('device-a', 'dead', 'fleet:device-a:ok:dead:down:1');
        report.scenarioA = { post: posted.status, before: alertRows() };
        const alertA = report.scenarioA.before[0].alert_id;
        report.scenarioA.deliveriesBeforeStop = deliveryRows(alertA);
        await stopProcess(runtime.nodered);
        await stopProcess(runtime.ingest);
        runtime = null;
        report.scenarioA.afterStop = { alerts: alertRows(), deliveries: deliveryRows(alertA) };
        await mock.setMode('ok');
        runtime = await startRuntime(mock, '-a2');
        await waitFor('livraison A', async () => deliveryRows(alertA).some((row) => row.status === 'sent'), 20000);
        report.scenarioA.afterRestart = { alerts: alertRows(), deliveries: deliveryRows(alertA) };

        await mock.setMode('hang');
        const seenBefore = mock.state.seen;
        const pendingPost = postTransition('device-b', 'heartbeat_missing', 'fleet:device-b:ok:heartbeat_missing:down:1').catch(() => null);
        await waitFor('mock suspendu', async () => mock.state.seen > seenBefore, 15000);
        await stopProcess(runtime.nodered);
        await stopProcess(runtime.ingest);
        runtime = null;
        await pendingPost;
        const alertB = alertRows().find((row) => row.source_id === 'device-b');
        report.scenarioB = { afterKill: { alert: alertB, deliveries: alertB ? deliveryRows(alertB.alert_id) : [] } };
        await mock.setMode('ok');
        runtime = await startRuntime(mock, '-b');
        await waitFor('reprise B', async () => {
            const rows = deliveryRows(alertB.alert_id);
            return rows.some((row) => row.status === 'unknown') && rows.some((row) => row.status === 'sent' || row.status === 'pending');
        }, 20000);
        report.scenarioB.afterRestart = { alerts: alertRows(), deliveries: deliveryRows(alertB.alert_id) };

        const ack = await request(INGEST_PORT, 'POST', '/v1/alerts/' + encodeURIComponent(alertB.alert_id) + '/ack', {
            actor: 'ada'
        }, { 'X-Watchdog-Token': TOKEN });
        const replay = await postTransition('device-b', 'heartbeat_missing', 'fleet:device-b:ok:heartbeat_missing:down:1');
        const aggravation = await postTransition('device-b', 'dead', 'fleet:device-b:heartbeat_missing:dead:down:2');
        report.scenarioC = {
            ack: ack.status,
            replay: replay.json && replay.json.results ? replay.json.results[0] : null,
            aggravation: aggravation.json && aggravation.json.results ? aggravation.json.results[0] : null,
            alerts: alertRows(),
            deliveries: deliveryRows(alertB.alert_id)
        };

        const noToken = await request(INGEST_PORT, 'GET', '/v1/alerts');
        const badToken = await request(INGEST_PORT, 'GET', '/v1/alerts', null, { 'X-Watchdog-Token': 'nope' });
        const badJson = await request(INGEST_PORT, 'POST', '/v1/alerts/device-transitions', '{', { 'X-Watchdog-Token': TOKEN });
        const health = await request(INGEST_PORT, 'GET', '/healthz');
        const dispatch = await request(INGEST_PORT, 'POST', '/v1/alerts/dispatch', {
            webhook_url: SECRET
        }, {
            'X-Watchdog-Token': TOKEN,
            'X-Watchdog-Channel-Secret': SECRET
        });
        const logs = ['ingest-a.log', 'ingest-a2.log', 'ingest-b.log', 'nodered-a.log', 'nodered-a2.log', 'nodered-b.log']
            .map((name) => path.join(DATA, name))
            .filter((file) => fs.existsSync(file))
            .map((file) => fs.readFileSync(file, 'utf8'))
            .join('\n');
        report.auth = {
            health: health.status,
            noToken: noToken.status,
            badToken: badToken.status,
            badJson: badJson.status,
            dispatch: dispatch.status,
            responseLeaksSecret: JSON.stringify(dispatch.json || {}).includes(SECRET) || (replay.raw || '').includes(SECRET),
            dbLeaksSecret: dbContains(SECRET),
            logsLeakSecret: logs.includes(SECRET)
        };
    } finally {
        if (runtime) {
            await stopProcess(runtime.nodered);
            await stopProcess(runtime.ingest);
        }
        mock.close();
    }
    fs.writeFileSync(path.join(DATA, 'report.json'), JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((err) => {
    process.stderr.write(err.stack + '\n');
    process.exit(1);
});
