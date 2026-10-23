'use strict';

/**
 * Sonde isolée : une transition Fleet confirmée survit-elle à l'arrêt de l'ingest ?
 * N'utilise ni webhook Teams réel, ni broker MQTT de production, ni volume partagé.
 * Le seuil d'anti-flap n'est pas modifié : la grâce est seulement déjà écoulée
 * pour un appareil synthétique, et la confirmation reste à deux polls.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME = process.env.QUALIFY_RUNTIME || 'C:\\DEV_local\\watchdog-qualify-runtime';
const MODE = process.argv[2] || 'replay';
const DATA = path.resolve(process.env.QUALIFY_DATA || path.join(
    'C:\\DEV_local\\watchdog-qualify-data',
    MODE === 'hold' ? 'fleet-hold' : 'fleet-replay'
));
const PORT = Number(process.env.QUALIFY_NR_PORT || 18931);
const INGEST_PORT = Number(process.env.QUALIFY_INGEST_PORT || 18093);
const TOKEN = 'qual-ingest-token';
const PASSWORD = 'qual-pass';
const UUID = 'qual-device-001';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(port, method, pathname, body, headers) {
    return new Promise((resolve, reject) => {
        const payload = body ? Buffer.from(JSON.stringify(body)) : null;
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
            timeout: 8000
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
    const source = `'use strict';
const path = require('path');
module.paths.unshift(${JSON.stringify(runtimeModules)});
const bcrypt = require('bcryptjs');
module.exports = {
    uiPort: ${PORT},
    userDir: ${JSON.stringify(userDir)},
    flowFile: 'flows.json',
    credentialSecret: process.env.ENCRYPTION_KEY || 'qual-encryption-key',
    adminAuth: {
        type: 'credentials',
        users: [{
            username: 'admin',
            password: bcrypt.hashSync(process.env.PASSWORD || 'qual-pass', 8),
            permissions: '*'
        }]
    },
    editorTheme: { projects: { enabled: false } },
    logging: { console: { level: 'info', metrics: false, audit: false } },
    contextStorage: { default: { module: 'localfilesystem' } },
    functionTimeout: 0,
    exportGlobalContextKeys: false
};
`;
    fs.writeFileSync(path.join(DATA, 'settings.js'), source);
}

function installHarness(flow) {
    const broker = flow.find((node) => node.id === 'c4b9e2d1a8f35090');
    if (broker) {
        broker.broker = '127.0.0.1';
        broker.port = '1';
        broker.autoConnect = false;
    }
    flow.push({
        id: 'q710000000000002',
        type: 'function',
        z: 'c4b9e2d1a8f35001',
        name: 'Qual seed grace elapsed',
        func: `const now = Date.now();
const uuid = ${JSON.stringify(UUID)};
const started = Number(flow.get('fleetStartedAt') || 0);
if (!started || (now - started) < 6 * 60 * 1000) flow.set('fleetStartedAt', now - 10 * 60 * 1000);
const seen = flow.get('fleetFirstSeenAt') || {};
if (!seen[uuid] || (now - Number(seen[uuid])) < 6 * 60 * 1000) {
    seen[uuid] = now - 10 * 60 * 1000;
    flow.set('fleetFirstSeenAt', seen);
}
return msg;`,
        outputs: 1,
        libs: [],
        x: 220,
        y: 40,
        wires: [['c4b9e2d1a8f35005']]
    });
    flow.push({
        id: 'q710000000000001',
        type: 'inject',
        z: 'c4b9e2d1a8f35001',
        name: 'Qual poll device',
        props: [
            { p: 'payload' },
            { p: 'topic', vt: 'str' }
        ],
        repeat: '',
        crontab: '',
        once: false,
        onceDelay: '0.1',
        topic: 'fleet_poll',
        payload: JSON.stringify({ d: [{ uuid: UUID, device_name: 'Qual Device', is_online: false }] }),
        payloadType: 'json',
        x: 80,
        y: 40,
        wires: [['q710000000000002']]
    });
}

function copyUi() {
    const src = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');
    const dest = path.join(DATA, 'uibuilder', 'watchdog-hub', 'src');
    fs.cpSync(src, dest, { recursive: true });
    const vue = path.join(RUNTIME, 'node_modules', 'vue', 'dist', 'vue.global.prod.js');
    const vendor = path.join(dest, 'vendor');
    fs.mkdirSync(vendor, { recursive: true });
    if (fs.existsSync(vue)) fs.copyFileSync(vue, path.join(vendor, 'vue.global.prod.js'));
    const nodeDest = path.join(DATA, 'nodes');
    fs.mkdirSync(path.join(nodeDest, 'lib'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'runtime', 'nodes', 'fleet-transition-outbox.js'), path.join(nodeDest, 'fleet-transition-outbox.js'));
    fs.copyFileSync(path.join(ROOT, 'runtime', 'nodes', 'fleet-transition-outbox.html'), path.join(nodeDest, 'fleet-transition-outbox.html'));
    fs.copyFileSync(path.join(ROOT, 'runtime', 'fleet-outbox.js'), path.join(nodeDest, 'lib', 'fleet-outbox.js'));
}

function childEnv(extra) {
    return Object.assign({}, process.env, {
        PASSWORD,
        ENCRYPTION_KEY: 'qual-encryption-key',
        USERNAME: 'admin',
        TEAMS_WEBHOOK_URL: '',
        BALENA_API_TOKEN: '',
        BALENA_APP_IDS: '',
        BALENA_APP_ID: '',
        WATCHDOG_INGEST_TOKEN: TOKEN,
        WATCHDOG_INGEST_BIND: '127.0.0.1',
        WATCHDOG_INGEST_PORT: String(INGEST_PORT),
        WATCHDOG_REGISTRY_PATH: path.join(DATA, 'watchdog-registry.sqlite'),
        WATCHDOG_OUTBOX_PATH: path.join(DATA, 'fleet-transition-outbox.jsonl'),
        NODE_PATH: path.join(RUNTIME, 'node_modules')
    }, extra || {});
}

function spawnLogged(command, args, logName) {
    const logPath = path.join(DATA, logName);
    const log = fs.createWriteStream(logPath, { flags: 'a' });
    const child = spawn(command, args, {
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

async function waitFor(label, fn, timeoutMs) {
    const started = Date.now();
    let last = '';
    while (Date.now() - started < timeoutMs) {
        try {
            if (await fn()) return;
        } catch (err) {
            last = err.message;
        }
        await sleep(500);
    }
    throw new Error(label + ' indisponible' + (last ? ' (' + last + ')' : ''));
}

function logContains(logPath, text) {
    if (!fs.existsSync(logPath)) return false;
    return fs.readFileSync(logPath, 'utf8').includes(text);
}

function alertCount() {
    const dbPath = path.join(DATA, 'watchdog-registry.sqlite');
    if (!fs.existsSync(dbPath)) return { alerts: 0, deliveries: 0 };
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
        const alerts = db.prepare('SELECT COUNT(*) AS n FROM alerts').get();
        const deliveries = db.prepare('SELECT COUNT(*) AS n FROM alert_deliveries').get();
        return { alerts: alerts.n, deliveries: deliveries.n };
    } catch (err) {
        return { alerts: null, deliveries: null, error: err.message };
    } finally {
        db.close();
    }
}

function outboxSnapshot() {
    const file = path.join(DATA, 'fleet-transition-outbox.jsonl');
    if (!fs.existsSync(file)) return { exists: false, lines: 0, statuses: {} };
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const statuses = {};
    for (const line of lines) {
        try {
            const row = JSON.parse(line);
            const status = row.status || 'unknown';
            statuses[status] = (statuses[status] || 0) + 1;
        } catch {
            statuses.torn = (statuses.torn || 0) + 1;
        }
    }
    return { exists: true, lines: lines.length, statuses };
}

function contextMentionsDevice() {
    const root = path.join(DATA, 'context');
    if (!fs.existsSync(root)) return false;
    const stack = [root];
    while (stack.length) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(full);
            else if (fs.readFileSync(full, 'utf8').includes(UUID)) return true;
        }
    }
    return false;
}

async function login() {
    const response = await request(PORT, 'POST', '/auth/token', {
        client_id: 'node-red-admin',
        grant_type: 'password',
        scope: '*',
        username: 'admin',
        password: PASSWORD
    });
    if (!response.json || !response.json.access_token) {
        throw new Error('auth Node-RED HTTP ' + response.status);
    }
    return response.json.access_token;
}

async function injectPoll(token) {
    return request(PORT, 'POST', '/inject/q710000000000001', {}, {
        Authorization: 'Bearer ' + token,
        'Node-RED-API-Version': 'v2'
    });
}

function stopProcess(child) {
    if (!child || child.exitCode !== null || child.killed) return Promise.resolve();
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            try {
                child.kill();
            } catch {
                /* déjà arrêté */
            }
            resolve();
        }, 4000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
        try {
            child.kill();
        } catch {
            clearTimeout(timer);
            resolve();
        }
    });
}

async function main() {
    fs.rmSync(DATA, { recursive: true, force: true });
    fs.mkdirSync(DATA, { recursive: true });
    const flow = JSON.parse(fs.readFileSync(path.join(ROOT, 'flows', '04_Watchdog_Hub.json'), 'utf8'));
    installHarness(flow);
    fs.writeFileSync(path.join(DATA, 'flows.json'), JSON.stringify(flow));
    writeSettings();
    copyUi();

    const redJs = path.join(RUNTIME, 'node_modules', 'node-red', 'red.js');
    if (!fs.existsSync(redJs)) throw new Error('Node-RED absent: ' + redJs);

    let ingest = spawnLogged(process.execPath, [path.join(ROOT, 'runtime', 'server.js')], 'ingest.log');
    let nodered = spawnLogged(process.execPath, [redJs, '--userDir', DATA, '--settings', path.join(DATA, 'settings.js')], 'nodered.log');

    const report = {
        mode: MODE,
        started: new Date().toISOString(),
        ports: { nodeRed: PORT, ingest: INGEST_PORT },
        data: DATA
    };
    try {
        await waitFor('ingest', async () => {
            const health = await request(INGEST_PORT, 'GET', '/healthz');
            return health.status === 200;
        }, 20000);
        await waitFor('node-red', async () => logContains(nodered.logPath, 'Started flows'), 90000);
        const token = await login();
        await stopProcess(ingest);
        ingest = null;
        await sleep(500);
        const first = await injectPoll(token);
        await sleep(800);
        const second = await injectPoll(token);
        await sleep(1500);
        report.inject = { first: first.status, second: second.status };
        report.afterFailure = {
            warned: logContains(nodered.logPath, 'Transmission des transitions Fleet non confirmée'),
            counts: alertCount(),
            outbox: outboxSnapshot(),
            contextHasDevice: contextMentionsDevice()
        };
        if (MODE === 'hold') {
            await stopProcess(nodered);
            nodered = null;
            report.afterNodeRedStopWhileIngestDown = {
                counts: alertCount(),
                outbox: outboxSnapshot()
            };
            nodered = spawnLogged(process.execPath, [redJs, '--userDir', DATA, '--settings', path.join(DATA, 'settings.js')], 'nodered-restart.log');
            await waitFor('node-red repris', async () => logContains(nodered.logPath, 'Started flows'), 90000);
            await sleep(4000);
            report.whileIngestStillDown = {
                counts: alertCount(),
                outbox: outboxSnapshot()
            };
        }
        ingest = spawnLogged(process.execPath, [path.join(ROOT, 'runtime', 'server.js')], 'ingest-restart.log');
        await waitFor('ingest repris', async () => (await request(INGEST_PORT, 'GET', '/healthz')).status === 200, 20000);
        await sleep(15000);
        report.afterIngestRestart = {
            counts: alertCount(),
            outbox: outboxSnapshot(),
            api: await request(INGEST_PORT, 'GET', '/v1/alerts?limit=20', null, { 'X-Watchdog-Token': TOKEN }).then((res) => ({
                status: res.status,
                open: res.json && res.json.summary ? res.json.summary.open : null,
                alerts: res.json && Array.isArray(res.json.alerts) ? res.json.alerts.length : null
            }))
        };
        await stopProcess(nodered);
        nodered = null;
        report.contextAfterNodeRedStop = contextMentionsDevice();
        nodered = spawnLogged(process.execPath, [redJs, '--userDir', DATA, '--settings', path.join(DATA, 'settings.js')], 'nodered-restart.log');
        await waitFor('node-red repris', async () => logContains(nodered.logPath, 'Started flows'), 90000);
        await sleep(12000);
        report.afterNodeRedRestart = {
            counts: alertCount(),
            outbox: outboxSnapshot(),
            contextHasDevice: contextMentionsDevice(),
            api: await request(INGEST_PORT, 'GET', '/v1/alerts?limit=20', null, { 'X-Watchdog-Token': TOKEN }).then((res) => ({
                status: res.status,
                alerts: res.json && Array.isArray(res.json.alerts) ? res.json.alerts.length : null
            }))
        };
    } finally {
        await stopProcess(nodered);
        await stopProcess(ingest);
    }
    const out = path.join(DATA, 'report.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((err) => {
    process.stderr.write(err.stack + '\n');
    process.exit(1);
});
