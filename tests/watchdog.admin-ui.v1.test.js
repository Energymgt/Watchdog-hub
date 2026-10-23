'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'uibuilder', 'watchdog-hub', 'src');

function read(relative) {
    return fs.readFileSync(path.join(UI_ROOT, relative), 'utf8');
}

describe('Administration UI', () => {
    it('conserve la route admin, les composants et les actions existantes', () => {
        const app = read('app.js');
        const admin = read('components/admin/admin-page.js');
        const wizard = read('components/admin/enroll-wizard.js');
        const client = read('services/uibuilder-client.js');
        const router = read('utils/hash-router.js');

        assert.match(router, /admin: true/);
        assert.match(app, /<admin-page/);
        assert.match(app, /<enroll-wizard/);
        assert.match(client, /send\('fleet_admin_save', data\)/);
        assert.match(client, /send\('fleet_device_enroll', data\)/);
        assert.match(client, /send\('fleet_device_unenroll', \{ uuid: uuid \}\)/);
        assert.match(client, /send\('fleet_teams_test'\)/);
        assert.match(admin, /fleetName: this\.form\.fleetName/);
        assert.match(admin, /Fleets \/ App IDs/);
        assert.match(admin, /<textarea :value="form\.balenaAppId"/);
        assert.match(wizard, /uuid: this\.uuid\.trim\(\)/);
    });

    it('prévoit validation, états de sauvegarde, confirmation et accessibilité', () => {
        const admin = read('components/admin/admin-page.js');
        const wizard = read('components/admin/enroll-wizard.js');

        assert.match(admin, /validationErrors/);
        assert.match(admin, /saving \|\| !dirty/);
        assert.match(admin, /Configuration non enregistrée/);
        assert.match(admin, /confirmUnenroll/);
        assert.match(admin, /global\.confirm/);
        assert.match(admin, /aria-invalid/);
        assert.match(wizard, /title-id="enroll-title"/);
        assert.match(wizard, /data-modal-initial-focus/);
    });

    it('ne contient aucun secret réel ni journalisation sensible', () => {
        const sources = [
            read('components/admin/admin-page.js'),
            read('components/admin/enroll-wizard.js')
        ].join('\n');

        assert.doesNotMatch(sources, /console\.log/);
        assert.doesNotMatch(sources, /secretValueForTest|passwordValueForTest/i);
        assert.match(sources, /type="password"/);
        assert.match(sources, /tokenSet/);
    });

    it('protège le statut Teams et met Fleet au premier plan', () => {
        const admin = read('components/admin/admin-page.js');
        const app = read('app.js');
        const css = read('index.css');

        assert.doesNotMatch(admin, /urlHint/);
        assert.match(admin, /teamsStatusLabel/);
        assert.match(admin, /'À configurer'/);
        assert.match(admin, /'Erreur'/);
        assert.match(admin, /'Connecté'/);
        assert.match(app, /Appareils à surveiller/);
        assert.ok(app.indexOf('Appareils à surveiller') < app.indexOf('<fleet-activity'));
        assert.match(css, /\.dashboard[\s\S]*overflow-x: hidden/);
        assert.match(css, /\.integration-card__head \.status-badge[\s\S]*text-overflow: ellipsis/);
    });

    it('reste syntaxiquement valide sans dépendance nouvelle', () => {
        assert.doesNotThrow(() => new vm.Script(read('components/admin/admin-page.js')));
        assert.doesNotThrow(() => new vm.Script(read('components/admin/enroll-wizard.js')));
        const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        assert.equal(packageJson.dependencies && packageJson.dependencies['vee-validate'], undefined);
    });
});
