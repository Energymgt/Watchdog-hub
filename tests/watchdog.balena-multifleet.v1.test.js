'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const flowPath = path.join(__dirname, '..', 'flows', '04_Watchdog_Hub.json');
const nodes = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
const prepareSource = nodes.find((node) => node.name === 'Prepare Balena API').func;
const resolveSource = nodes.find((node) => node.name === 'Resolve Balena fleet').func;
const normalizeSource = nodes.find((node) => node.name === 'Normalize Balena fleet config').func;

function runtime(initial, environment) {
    const state = Object.assign({}, initial);
    return {
        state,
        flow: {
            get(key) { return state[key]; },
            set(key, value) { state[key] = value; }
        },
        env: {
            get(key) { return environment[key]; }
        },
        node: {
            status() {},
            warn() {},
            error() {}
        }
    };
}

function execute(source, msg, context) {
    const fn = new Function('msg', 'flow', 'env', 'node', source);
    return fn(msg, context.flow, context.env, context.node);
}

describe('Polling Balena multi-fleets', () => {
    it('accepte BALENA_APP_IDS, déduplique les références et fusionne les devices', () => {
        const context = runtime({}, {
            BALENA_API_TOKEN: 'test-token',
            BALENA_APP_IDS: '101, fleet-two\n101',
            BALENA_APP_ID: ''
        });
        let msg = execute(prepareSource, { forcePoll: true }, context);

        assert.deepEqual(msg.balenaAppRefs, ['101', 'fleet-two']);
        assert.match(msg.url, /belongs_to__application%20eq%20101/);

        msg.statusCode = 200;
        msg.payload = { d: [{ uuid: 'device-a', device_name: 'A' }] };
        let result = execute(resolveSource, msg, context);
        assert.equal(result[0], null);
        msg = result[1];
        assert.match(msg.url, /app_name%20eq%20'fleet-two'/);

        msg.statusCode = 200;
        msg.payload = { d: [{ uuid: 'device-b', device_name: 'B' }] };
        result = execute(resolveSource, msg, context);

        assert.equal(result[1], null);
        assert.deepEqual(result[0].payload.d.map((device) => device.uuid), ['device-a', 'device-b']);
        assert.deepEqual(result[0].payload.d.map((device) => device._balenaAppRef), ['101', 'fleet-two']);
        assert.equal(context.state.fleetLastError, null);
        assert.ok(context.state.fleetLastPollAt);
    });

    it('retourne les fleets réussies et conserve le dernier inventaire de celles en échec', () => {
        const previous = [
            { uuid: 'device-old', device_name: 'Old', _balenaAppRef: 'fleet-two' }
        ];
        const context = runtime({ fleetBalenaDevices: previous }, {
            BALENA_API_TOKEN: 'test-token',
            BALENA_APP_IDS: '101,fleet-two',
            BALENA_APP_ID: ''
        });
        let msg = execute(prepareSource, { forcePoll: true }, context);

        msg.statusCode = 200;
        msg.payload = { d: [{ uuid: 'device-a', device_name: 'A' }] };
        msg = execute(resolveSource, msg, context)[1];
        msg.statusCode = 503;
        msg.payload = { message: 'unavailable' };
        const result = execute(resolveSource, msg, context);

        assert.deepEqual(result[0].payload.d.map((device) => device.uuid), ['device-a', 'device-old']);
        assert.match(context.state.fleetLastError.message, /fleet-two/);
        assert.ok(context.state.fleetLastPollAt);
    });

    it('conserve BALENA_APP_ID comme repli rétrocompatible', () => {
        const context = runtime({}, {
            BALENA_API_TOKEN: 'test-token',
            BALENA_APP_IDS: '',
            BALENA_APP_ID: 'legacy-fleet'
        });
        const msg = execute(prepareSource, { forcePoll: true }, context);

        assert.deepEqual(msg.balenaAppRefs, ['legacy-fleet']);
    });

    it('conserve la priorité de la configuration Administration sur Portainer', () => {
        const context = runtime({
            fleetAdminConfig: { balenaAppId: 'ui-one\nui-two' }
        }, {
            BALENA_API_TOKEN: 'test-token',
            BALENA_APP_IDS: 'env-fleet',
            BALENA_APP_ID: ''
        });

        execute(normalizeSource, {}, context);
        const msg = execute(prepareSource, { forcePoll: true }, context);

        assert.deepEqual(msg.balenaAppRefs, ['ui-one', 'ui-two']);
        assert.equal(context.state.fleetAdminConfig.balenaAppIds, 'ui-one\nui-two');
    });
});
