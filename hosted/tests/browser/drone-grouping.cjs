'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const crypto = require('node:crypto');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');

const service = process.env.DRONELINK_HOSTED_ROOT || path.resolve(__dirname, '../..');
const localRequire = createRequire(path.join(service, 'package.json'));
const { createApp } = localRequire('./app');
const { openFirestoreStore } = localRequire('@dronelink/persistence');
const { openAccessOperatorStore } = localRequire('@dronelink/persistence/operator');
const { Strategy: GoogleStrategy } = localRequire('passport-google-oauth20');
const { withFirestore } = require('../../tools/firestore.cjs');

async function run() {
    assert.ok(process.env.CLIENT_BUILD_DIR, 'Select the Client build explicitly');
    const screenshots = process.env.DRONELINK_GROUPING_SCREENSHOTS;
    if (screenshots) await mkdir(screenshots, { recursive: true });
    await withFirestore(async options => {
        const config = { ...options, databaseId: '(default)', observationEpoch: 'm1-c-1', observationFlushIntervalMs: 20 };
        const store = await openFirestoreStore(config);
        const access = await openAccessOperatorStore(config);
        let app, browser;
        const server = http.createServer((req, res) => app(req, res));
        try {
            const emails = { admin: 'damian@axford.me.uk', editor: 'editor@example.test', viewer: 'viewer@example.test' };
            const people = {};
            for (const [id, email] of Object.entries(emails)) {
                people[id] = await store.users.registerVerifiedSignIn({ googleId: id, email, emailVerified: true, displayName: id });
            }
            const migration = await access.previewMigration({ schemaVersion: 1 });
            await access.beginMigration({ expectedSchemaVersion: 0, planDigest: migration.digest, reviewedPlan: migration });
            for (const row of migration.users) await access.applyUserMigration({ userId: row.userId, sourceRevision: row.sourceDigest, planDigest: migration.digest });
            await access.grantSoleAdmin({ userId: people.admin._id, googleId: 'admin', expectedControlRevision: (await store.access.getControl()).revision });
            await access.activate({ planDigest: migration.digest, expectedControlRevision: (await store.access.getControl()).revision });
            const sessionEpoch = (await store.access.getControl()).sessionEpoch;
            const actor = name => ({ userId: people[name]._id, sessionEpoch, allowedRoles: ['owner', 'editor', 'viewer'], allowPlatformAdmin: true });
            const fleet = await store.domains.createOwned(actor('admin'), { name: 'Harbour Trials' });
            for (const role of ['editor', 'viewer']) {
                const tokenHash = crypto.randomBytes(32).toString('hex');
                const invitation = await store.invitations.issue(actor('admin'), { domainId: fleet._id, emailCanonical: emails[role], role, tokenHash });
                await store.invitations.accept(actor(role), { invitationId: invitation._id, tokenHash });
            }

            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            const origin = `http://127.0.0.1:${server.address().port}`;
            const route = '/private/domain/' + fleet._id;
            const api = '/api/domains/' + fleet._id;
            app = createApp({ config: {
                publicOrigin: origin, observationEpoch: 'm1-c-1', cookieKey: 'isolated-grouping-browser-fixture-secret',
                googleClientID: 'fixture-client', googleClientSecret: 'fixture-secret', clientBuildDir: path.resolve(process.env.CLIENT_BUILD_DIR)
            }, store, googleStrategyFactory: (opts, verify) => {
                const strategy = new GoogleStrategy(opts, verify);
                strategy._oauth2.getOAuthAccessToken = (code, params, done) => done(null, code, 'fixture-refresh', {});
                strategy._oauth2.get = (url, token, done) => done(null, JSON.stringify({
                    sub: token, name: token, email: emails[token], email_verified: true
                }));
                return strategy;
            } });
            async function publish(node, name) {
                const bytes = Buffer.from(name);
                const packets = Buffer.concat([Buffer.from([node, node, 1, 8, 64 | (bytes.length - 1)]), bytes]);
                for (let attempt = 0; attempt < 5; attempt++) {
                    const response = await fetch(origin + '/addPackets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domain: fleet._id, apiKey: fleet.apiKey, id: node, packets: packets.toString('base64') }) });
                    assert.equal(response.status, 202, await response.text());
                    for (let check = 0; check < 10; check++) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        const snapshot = await store.observations.readSnapshot(actor('admin'), { domainId: fleet._id });
                        if (snapshot.channels.some(row => row.nodeAddress === node && row.params['8']?.value?.payload === bytes.toString('base64'))) return;
                    }
                }
                assert.fail('Fixture publication did not reach observations for node ' + node);
            }
            await publish(7, 'Pelagic');
            await publish(8, 'GPS Pod');
            await publish(9, 'Deck Relay');

            browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome', headless: true });
            async function enter(name) {
                const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 });
                const start = await context.request.get(origin + '/auth/google', { maxRedirects: 0 });
                const state = new URL(start.headers().location).searchParams.get('state');
                const result = await context.request.get(origin + '/auth/google/callback?code=' + name + '&state=' + encodeURIComponent(state), { maxRedirects: 0 });
                assert.equal(result.status(), 302);
                const page = await context.newPage();
                page.setDefaultTimeout(12000);
                await page.goto(origin + route);
                return page;
            }
            const screenshot = async (page, name) => {
                if (screenshots) await page.screenshot({ path: path.join(screenshots, name + '.png'), animations: 'disabled' });
            };
            const editor = await enter('editor');
            const viewer = await enter('viewer');
            const initial = (await (await editor.request.get(origin + api + '/identities')).json()).data;
            const [pelagic, gps] = initial.nodes.map(node => node.droneId);
            const open = (page, name) => page.getByRole('button', { name, exact: true }).click();
            const panel = (dialog, title) => dialog.getByRole('heading', { name: title, exact: true }).locator('..');
            const group = (dialog, title) => dialog.getByRole('heading', { name: title, exact: true }).locator('../..');
            const confirm = dialog => dialog.getByText('Drone grouping saved.', { exact: true }).waitFor();

            await viewer.getByRole('button', { name: /^Inspect node 7:/ }).click();
            await open(viewer, 'Node details');
            const details = viewer.getByRole('dialog', { name: 'Node details' });
            await details.locator('dd').filter({ hasText: /^Pelagic · Node 7$/ }).first().waitFor();

            await open(editor, 'Manage Drones');
            const manage = editor.getByRole('dialog', { name: 'Manage Drones' });
            await group(manage, 'GPS Pod · Node 8').getByRole('button', { name: 'Move nodes' }).click();
            await manage.getByRole('checkbox', { name: /GPS Pod/ }).check();
            await manage.getByLabel('Destination Drone').selectOption(pelagic);
            await panel(manage, 'Source after move').getByText('Empty · identity retained in history').waitFor();
            await screenshot(editor, '01-grouping-preview');
            await manage.getByRole('button', { name: 'Move nodes', exact: true }).click();
            await confirm(manage);
            await group(manage, 'Pelagic · Node 7').getByRole('button', { name: 'Change master' }).click();
            await manage.getByLabel('Master', { exact: true }).selectOption('8');
            await screenshot(editor, '02-select-master');
            await manage.getByRole('button', { name: 'Save master' }).click();
            await confirm(manage);

            await details.locator('dd').filter({ hasText: /^GPS Pod · Node 8$/ }).waitFor();
            await details.getByText('Pelagic · Node 7, GPS Pod · Node 8', { exact: true }).waitFor();
            await screenshot(viewer, '03-inspector-membership');
            await open(viewer, 'Close Node details');
            await open(viewer, 'Drones');
            const readOnly = viewer.getByRole('dialog', { name: 'Drones' });
            await group(readOnly, 'GPS Pod · Node 8').getByText('Pelagic · Node 7').waitFor();
            assert.equal(await readOnly.getByRole('button', { name: 'Move nodes' }).count(), 0);
            await open(viewer, 'Close Drones');
            await viewer.goto(origin + '/private');
            await viewer.getByLabel('Domain totals').getByText('2 Drones', { exact: true }).waitFor();
            await viewer.getByLabel('Domain totals').getByText('3 nodes', { exact: true }).waitFor();

            await group(manage, 'GPS Pod · Node 8').getByRole('button', { name: 'Change master' }).click();
            await manage.getByLabel('Master', { exact: true }).selectOption('7');
            await store.telemetry.setDroneMaster(actor('admin'), {
                domainId: fleet._id, droneId: pelagic, expectedRevision: 2, masterAddress: 7
            });
            await manage.getByRole('button', { name: 'Save master' }).click();
            await manage.getByRole('alert').filter({ hasText: /grouping changed/ }).waitFor();

            await group(manage, 'Pelagic · Node 7').getByRole('button', { name: 'Move nodes' }).click();
            await manage.getByRole('checkbox', { name: /GPS Pod/ }).check();
            await manage.getByLabel('Destination Drone').selectOption('restore:' + gps);
            await manage.getByText('Previous composition of the Drone being restored', { exact: true }).waitFor();
            await screenshot(editor, '04-restore-former-drone');
            await manage.getByRole('button', { name: 'Move and restore' }).click();
            await confirm(manage);
            const restored = (await (await editor.request.get(origin + api + '/identities')).json()).data;
            assert.equal(restored.nodes.find(row => row.address === 8).droneId, gps);
            assert.equal(restored.drones.length, 3);

            const latest = await store.domains.getById(fleet._id);
            await store.domains.archive(actor('admin'), { domainId: fleet._id, revision: latest.revision });
            await viewer.goto(origin + route);
            await open(viewer, 'Drones');
            await readOnly.getByRole('button', { name: 'Grouping history' }).click();
            await readOnly.getByText(/Change 4 ·/).waitFor();
            await readOnly.getByText('Before: Node 7 (master), Node 8', { exact: true }).first().waitFor();
            assert.equal(await readOnly.getByRole('button', { name: 'Change master' }).count(), 0);
            console.log('Chrome passed grouping, master change, second-session Inspector and Home counts, stale edit recovery, restoration and archived history.');
        } finally {
            await browser?.close();
            await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
            await store.close();
            await access.close();
        }
    });
}
run().catch(error => { console.error(error); process.exitCode = 1; });
