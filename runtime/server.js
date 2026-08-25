'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { openRegistry } = require('./registry');
const { ingestEvent, publicEventRow, publicAnomalyRow } = require('./ingest');
const { loadHealthContracts, getFlowContract } = require('./health-contracts');
const {
    STATES,
    ALLOWED_TRANSITIONS,
    isKnownState,
    publicIncidentRow,
    publicLinkRow,
    publicHistoryRow
} = require('./incidents');
const { publicActionRow, recordAction } = require('./actions');
const { publicResolutionRow, recordResolution } = require('./resolutions');
const { decorateFlow } = require('./flow-status');

const MAX_BODY_BYTES = 65536;
const SCHEMA = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'contracts', 'watchdog.event.v1.schema.json'), 'utf8')
);

function sendJson(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(json),
        'Cache-Control': 'no-store'
    });
    res.end(json);
}

function parseLimit(url) {
    const raw = url.searchParams.get('limit');
    if (raw === null || raw === '') return 20;
    const n = Number(raw);
    if (!Number.isInteger(n)) return null;
    return n;
}

function parseStatus(url) {
    const raw = url.searchParams.get('status');
    if (raw === null || raw === '') return undefined;
    if (raw === 'open' || raw === 'closed') return raw;
    return null;
}

function parseIncidentState(url) {
    const raw = url.searchParams.get('state');
    if (raw === null || raw === '') return undefined;
    if (isKnownState(raw)) return raw;
    return null;
}

function parseIncidentRoute(pathname) {
    const rest = decodeURIComponent(pathname.slice('/v1/incidents/'.length));
    const parts = rest.split('/').filter(Boolean);
    return {
        incidentId: parts[0] || '',
        sub: parts[1] || null
    };
}

function extractIngestToken(req) {
    const header = req.headers['x-watchdog-token'];
    if (header != null && String(header).trim()) {
        return String(Array.isArray(header) ? header[0] : header).trim();
    }
    const auth = String(req.headers.authorization || '');
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    return match ? match[1].trim() : '';
}

function tokenMatches(provided, expected) {
    const a = Buffer.from(String(provided), 'utf8');
    const b = Buffer.from(String(expected), 'utf8');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
}

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(Object.assign(new Error('payload_too_large'), { code: 'PAYLOAD_TOO_LARGE' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function createIngestServer(registry, options = {}) {
    const contracts = options.contracts || loadHealthContracts();
    const ingestToken = String(
        options.token !== undefined ? options.token : (process.env.WATCHDOG_INGEST_TOKEN || '')
    ).trim();
    return http.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://watchdog.local');
        const method = req.method || 'GET';

        try {
            if (method === 'GET' && url.pathname === '/healthz') {
                sendJson(res, 200, registry.health());
                return;
            }

            if (ingestToken && url.pathname.startsWith('/v1/')) {
                if (!tokenMatches(extractIngestToken(req), ingestToken)) {
                    sendJson(res, 401, { ok: false, error: 'unauthorized' });
                    return;
                }
            }

            if (method === 'GET' && url.pathname === '/v1/events') {
                const limit = parseLimit(url);
                if (limit === null) {
                    sendJson(res, 400, { ok: false, error: 'invalid_limit' });
                    return;
                }
                const rows = registry.listEvents(limit).map(publicEventRow);
                sendJson(res, 200, { ok: true, events: rows });
                return;
            }

            if (method === 'GET' && url.pathname.startsWith('/v1/events/')) {
                const eventId = decodeURIComponent(url.pathname.slice('/v1/events/'.length));
                if (!eventId || eventId.includes('/')) {
                    sendJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }
                const row = registry.getEvent(eventId);
                if (!row) {
                    sendJson(res, 404, { ok: false, error: 'not_found', event_id: eventId });
                    return;
                }
                sendJson(res, 200, { ok: true, event: publicEventRow(row) });
                return;
            }

            if (method === 'GET' && url.pathname === '/v1/anomalies') {
                const limit = parseLimit(url);
                if (limit === null) {
                    sendJson(res, 400, { ok: false, error: 'invalid_limit' });
                    return;
                }
                const status = parseStatus(url);
                if (status === null) {
                    sendJson(res, 400, { ok: false, error: 'invalid_status' });
                    return;
                }
                const rows = registry.listAnomalies({ status, limit }).map(publicAnomalyRow);
                sendJson(res, 200, { ok: true, anomalies: rows });
                return;
            }

            if (method === 'GET' && url.pathname.startsWith('/v1/anomalies/')) {
                const anomalyId = decodeURIComponent(url.pathname.slice('/v1/anomalies/'.length));
                if (!anomalyId || anomalyId.includes('/')) {
                    sendJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }
                const row = registry.getAnomaly(anomalyId);
                if (!row) {
                    sendJson(res, 404, { ok: false, error: 'not_found', anomaly_id: anomalyId });
                    return;
                }
                sendJson(res, 200, { ok: true, anomaly: publicAnomalyRow(row) });
                return;
            }

            if (method === 'GET' && url.pathname === '/v1/flows') {
                sendJson(res, 200, {
                    ok: true,
                    flows: contracts.flows.map((f) => decorateFlow(registry, f)),
                    rules: contracts.rules
                });
                return;
            }

            if (method === 'GET' && url.pathname.startsWith('/v1/flows/')) {
                const flowId = decodeURIComponent(url.pathname.slice('/v1/flows/'.length));
                if (!flowId || flowId.includes('/')) {
                    sendJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }
                const flow = getFlowContract(contracts.flows, flowId);
                if (!flow) {
                    sendJson(res, 404, { ok: false, error: 'not_found', flow_id: flowId });
                    return;
                }
                sendJson(res, 200, { ok: true, flow: decorateFlow(registry, flow) });
                return;
            }

            if (method === 'GET' && url.pathname === '/v1/incidents') {
                const limit = parseLimit(url);
                if (limit === null) {
                    sendJson(res, 400, { ok: false, error: 'invalid_limit' });
                    return;
                }
                const state = parseIncidentState(url);
                if (state === null) {
                    sendJson(res, 400, { ok: false, error: 'invalid_state', allowed: STATES.slice() });
                    return;
                }
                const rows = registry.listIncidents({ state, limit }).map(publicIncidentRow);
                sendJson(res, 200, { ok: true, incidents: rows });
                return;
            }

            if (method === 'GET' && url.pathname.startsWith('/v1/incidents/')) {
                const route = parseIncidentRoute(url.pathname);
                if (!route.incidentId || (route.sub && route.sub !== 'actions' && route.sub !== 'resolutions')) {
                    sendJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }
                const row = registry.getIncident(route.incidentId);
                if (!row) {
                    sendJson(res, 404, { ok: false, error: 'not_found', incident_id: route.incidentId });
                    return;
                }
                const actions = registry.listActions(route.incidentId).map(publicActionRow);
                const resolutions = registry.listResolutions(route.incidentId).map(publicResolutionRow);
                if (route.sub === 'actions') {
                    sendJson(res, 200, { ok: true, actions });
                    return;
                }
                if (route.sub === 'resolutions') {
                    sendJson(res, 200, { ok: true, resolutions });
                    return;
                }
                sendJson(res, 200, {
                    ok: true,
                    incident: publicIncidentRow(row),
                    allowed_transitions: (ALLOWED_TRANSITIONS[row.state] || []).slice(),
                    links: registry.listIncidentLinks(route.incidentId).map(publicLinkRow),
                    history: registry.listIncidentHistory(route.incidentId).map(publicHistoryRow),
                    actions,
                    resolutions
                });
                return;
            }

            if (method === 'POST' && url.pathname.startsWith('/v1/incidents/') && url.pathname.endsWith('/actions')) {
                const route = parseIncidentRoute(url.pathname);
                if (!route.incidentId || route.sub !== 'actions') {
                    sendJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }
                const contentType = String(req.headers['content-type'] || '');
                if (!contentType.toLowerCase().startsWith('application/json')) {
                    sendJson(res, 415, { ok: false, error: 'unsupported_media_type' });
                    return;
                }
                let raw;
                try {
                    raw = await readBody(req, MAX_BODY_BYTES);
                } catch (err) {
                    if (err && err.code === 'PAYLOAD_TOO_LARGE') {
                        sendJson(res, 413, { ok: false, error: 'payload_too_large' });
                        return;
                    }
                    throw err;
                }
                let body;
                try {
                    body = JSON.parse(raw.toString('utf8'));
                } catch {
                    sendJson(res, 400, { ok: false, error: 'invalid_json' });
                    return;
                }
                const row = registry.getIncident(route.incidentId);
                if (!row) {
                    sendJson(res, 404, { ok: false, error: 'not_found', incident_id: route.incidentId });
                    return;
                }
                const recorded = recordAction(registry, row, body);
                if (!recorded.ok) {
                    sendJson(res, recorded.status, {
                        ok: false,
                        error: recorded.error,
                        allowed: recorded.allowed
                    });
                    return;
                }
                sendJson(res, 201, {
                    ok: true,
                    action: publicActionRow(recorded.action),
                    incident: publicIncidentRow(recorded.incident)
                });
                return;
            }

            if (method === 'POST' && url.pathname.startsWith('/v1/incidents/') && url.pathname.endsWith('/resolutions')) {
                const route = parseIncidentRoute(url.pathname);
                if (!route.incidentId || route.sub !== 'resolutions') {
                    sendJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }
                const contentType = String(req.headers['content-type'] || '');
                if (!contentType.toLowerCase().startsWith('application/json')) {
                    sendJson(res, 415, { ok: false, error: 'unsupported_media_type' });
                    return;
                }
                let raw;
                try {
                    raw = await readBody(req, MAX_BODY_BYTES);
                } catch (err) {
                    if (err && err.code === 'PAYLOAD_TOO_LARGE') {
                        sendJson(res, 413, { ok: false, error: 'payload_too_large' });
                        return;
                    }
                    throw err;
                }
                let body;
                try {
                    body = JSON.parse(raw.toString('utf8'));
                } catch {
                    sendJson(res, 400, { ok: false, error: 'invalid_json' });
                    return;
                }
                const row = registry.getIncident(route.incidentId);
                if (!row) {
                    sendJson(res, 404, { ok: false, error: 'not_found', incident_id: route.incidentId });
                    return;
                }
                const recorded = recordResolution(registry, row, body);
                if (!recorded.ok) {
                    sendJson(res, recorded.status, {
                        ok: false,
                        error: recorded.error,
                        from_state: row.state
                    });
                    return;
                }
                sendJson(res, 201, {
                    ok: true,
                    resolution: publicResolutionRow(recorded.resolution),
                    incident: publicIncidentRow(recorded.incident),
                    action: publicActionRow(recorded.action)
                });
                return;
            }

            if (method === 'PATCH' && url.pathname.startsWith('/v1/incidents/')) {
                const route = parseIncidentRoute(url.pathname);
                if (!route.incidentId || route.sub) {
                    sendJson(res, 404, { ok: false, error: 'not_found' });
                    return;
                }
                const contentType = String(req.headers['content-type'] || '');
                if (!contentType.toLowerCase().startsWith('application/json')) {
                    sendJson(res, 415, { ok: false, error: 'unsupported_media_type' });
                    return;
                }
                let raw;
                try {
                    raw = await readBody(req, MAX_BODY_BYTES);
                } catch (err) {
                    if (err && err.code === 'PAYLOAD_TOO_LARGE') {
                        sendJson(res, 413, { ok: false, error: 'payload_too_large' });
                        return;
                    }
                    throw err;
                }
                let body;
                try {
                    body = JSON.parse(raw.toString('utf8'));
                } catch {
                    sendJson(res, 400, { ok: false, error: 'invalid_json' });
                    return;
                }
                const row = registry.getIncident(route.incidentId);
                if (!row) {
                    sendJson(res, 404, { ok: false, error: 'not_found', incident_id: route.incidentId });
                    return;
                }
                const recorded = recordAction(registry, row, {
                    actor: (body && body.actor) || 'operator',
                    to_state: body && body.to_state,
                    comment: (body && (body.comment || body.reason)) || null
                });
                if (!recorded.ok) {
                    sendJson(res, recorded.status === 400 ? 409 : recorded.status, {
                        ok: false,
                        error: recorded.error,
                        from_state: row.state,
                        to_state: body && body.to_state,
                        allowed: STATES.slice()
                    });
                    return;
                }
                sendJson(res, 200, {
                    ok: true,
                    incident: publicIncidentRow(recorded.incident),
                    history: registry.listIncidentHistory(route.incidentId).map(publicHistoryRow),
                    action: publicActionRow(recorded.action)
                });
                return;
            }

            if (method === 'POST' && url.pathname === '/v1/events') {
                const contentType = String(req.headers['content-type'] || '');
                if (!contentType.toLowerCase().startsWith('application/json')) {
                    sendJson(res, 415, { ok: false, error: 'unsupported_media_type' });
                    return;
                }

                let raw;
                try {
                    raw = await readBody(req, MAX_BODY_BYTES);
                } catch (err) {
                    if (err && err.code === 'PAYLOAD_TOO_LARGE') {
                        sendJson(res, 413, { ok: false, error: 'payload_too_large' });
                        return;
                    }
                    throw err;
                }

                let event;
                try {
                    event = JSON.parse(raw.toString('utf8'));
                } catch {
                    sendJson(res, 400, { ok: false, error: 'invalid_json' });
                    return;
                }

                const result = ingestEvent(registry, SCHEMA, event, { contracts });
                if (result.ok) {
                    sendJson(res, result.status, {
                        ok: true,
                        duplicate: result.duplicate,
                        event_id: result.event_id,
                        ingested_at: result.ingested_at
                    });
                    return;
                }
                sendJson(res, result.status, {
                    ok: false,
                    error: result.error,
                    event_id: result.event_id,
                    errors: result.errors
                });
                return;
            }

            sendJson(res, 404, { ok: false, error: 'not_found' });
        } catch {
            sendJson(res, 500, { ok: false, error: 'registry_unavailable' });
        }
    });
}

function listenIngestServer(options = {}) {
    const port = Number(options.port || process.env.WATCHDOG_INGEST_PORT || 8091);
    const dbPath = options.dbPath
        || process.env.WATCHDOG_REGISTRY_PATH
        || path.join(__dirname, '..', 'data', 'watchdog-registry.sqlite');
    const bind = options.host || process.env.WATCHDOG_INGEST_BIND || '127.0.0.1';
    const registry = openRegistry(dbPath);
    const server = createIngestServer(registry, {
        token: options.token !== undefined ? options.token : process.env.WATCHDOG_INGEST_TOKEN
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, bind, () => {
            resolve({ server, registry, port: server.address().port, bind });
        });
    });
}

if (require.main === module) {
    listenIngestServer()
        .then(({ port, bind, registry }) => {
            process.stdout.write(`watchdog ingest listening on ${bind}:${port}\n`);
            process.stdout.write(`registry ${registry.path}\n`);
        })
        .catch((err) => {
            process.stderr.write(`${err.message}\n`);
            process.exit(1);
        });
}

module.exports = {
    MAX_BODY_BYTES,
    createIngestServer,
    listenIngestServer
};
