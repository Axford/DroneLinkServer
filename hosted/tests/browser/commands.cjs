'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const { withFirestore } = require('../../tools/firestore.cjs');

const service = process.env.DRONELINK_HOSTED_ROOT || path.resolve(__dirname, '../..');
const localRequire = createRequire(path.join(service, 'package.json'));
const { createApp } = localRequire('./app');
const { openFirestoreStore } = localRequire('@dronelink/persistence');
const { openAccessOperatorStore, openCommandOperatorStore } = localRequire('@dronelink/persistence/operator');
const { Strategy: GoogleStrategy } = localRequire('passport-google-oauth20');

async function run() {
    assert.ok(process.env.CLIENT_BUILD_DIR, 'Select the Client build explicitly');
    await withFirestore(async options => {
        const config = { ...options, databaseId: '(default)', commandContract: 'm2-a-1', observationEpoch: 'm1-c-1', observationFlushIntervalMs: 20 };
        const store = await openFirestoreStore(config);
        const access = await openAccessOperatorStore(config);
        const operator = await openCommandOperatorStore(config);
        let app, browser;
        const server = http.createServer((req, res) => app(req, res));
        try {
            const emails = { admin: 'damian@axford.me.uk', editor: 'editor@example.test' };
            for (const [id, email] of Object.entries(emails)) {
                await store.users.registerVerifiedSignIn({ googleId: id, email, emailVerified: true, displayName: id });
            }
            const migration = await access.previewMigration({ schemaVersion: 1 });
            await access.beginMigration({ expectedSchemaVersion: 0, planDigest: migration.digest, reviewedPlan: migration });
            for (const row of migration.users) await access.applyUserMigration({ userId: row.userId, sourceRevision: row.sourceDigest, planDigest: migration.digest });
            const admin = await store.users.findByGoogleId('admin');
            const editor = await store.users.findByGoogleId('editor');
            await access.grantSoleAdmin({ userId: admin._id, googleId: 'admin', expectedControlRevision: (await store.access.getControl()).revision });
            await access.activate({ planDigest: migration.digest, expectedControlRevision: (await store.access.getControl()).revision });
            const epoch = (await store.access.getControl()).sessionEpoch;
            const actor = userId => ({ userId, sessionEpoch: epoch, allowedRoles: ['owner', 'editor', 'viewer'], allowPlatformAdmin: true });
            const fleet = await store.domains.createOwned(actor(admin._id), { name: 'Command browser fixture' });
            const tokenHash = require('node:crypto').randomBytes(32).toString('hex');
            const invitation = await store.invitations.issue(actor(admin._id), { domainId: fleet._id, emailCanonical: emails.editor, role: 'editor', tokenHash });
            await store.invitations.accept(actor(editor._id), { invitationId: invitation._id, tokenHash });
            const plan = await operator.preview();
            await operator.prepare({ expectedControlRevision: plan.controlRevision, planDigest: plan.digest });
            await operator.prepareDomain({ domainId: fleet._id });
            await operator.activate({ expectedControlRevision: (await store.access.getControl()).revision });

            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            const origin = `http://127.0.0.1:${server.address().port}`;
            app = createApp({ config: { publicOrigin: origin, observationEpoch: 'm1-c-1', cookieKey: 'isolated-command-browser-fixture-secret',
                googleClientID: 'fixture-client', googleClientSecret: 'fixture-secret', clientBuildDir: path.resolve(process.env.CLIENT_BUILD_DIR) }, store,
                googleStrategyFactory: (opts, verify) => {
                    const strategy = new GoogleStrategy(opts, verify);
                    strategy._oauth2.getOAuthAccessToken = (code, params, done) => done(null, code, 'fixture-refresh', {});
                    strategy._oauth2.get = (url, token, done) => done(null, JSON.stringify({ sub: token, name: token, email: emails[token], email_verified: true }));
                    return strategy;
                }
            });
            const machine = { domain: fleet._id, id: 7, apiKey: fleet.apiKey };
            const post = (route, body) => fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const publish = async value => {
                const packets = Buffer.from([7, 7, 4, 8, 128, value]).toString('base64');
                assert.equal((await post('/addPackets', { ...machine, packets })).status, 202);
            };
            await publish(42);
            browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome', headless: true });
            async function enter(name) {
                const context = await browser.newContext();
                const start = await context.request.get(origin + '/auth/google', { maxRedirects: 0 });
                const state = new URL(start.headers().location).searchParams.get('state');
                const result = await context.request.get(origin + '/auth/google/callback?code=' + name + '&state=' + encodeURIComponent(state), { maxRedirects: 0 });
                assert.equal(result.status(), 302);
                const page = await context.newPage();
                await page.goto(origin + '/private/domain/' + fleet._id);
                await page.locator('.node-selector select option[value="7"]').waitFor({ state: 'attached' });
                await page.locator('.node-selector select').selectOption('7');
                await page.getByRole('button', { name: 'Expand All', exact: true }).click();
                await page.locator('.parameter-row .font-monospace').getByText('42', { exact: true }).waitFor();
                return page;
            }
            const owner = await enter('admin');
            const collaborator = await enter('editor');
            await owner.getByRole('button', { name: 'Domain commands', exact: true }).click();
            await owner.getByRole('textbox', { name: 'Command lifetime seconds' }).fill('60');
            await owner.getByRole('button', { name: 'Save command lifetime' }).click();
            await owner.getByRole('button', { name: 'Save command lifetime' }).waitFor();
            const scope = '/api/domains/' + fleet._id;
            await owner.waitForFunction(async url => (await (await fetch(url)).json()).data.httpLifetimeSeconds === 60, scope + '/command-settings');
            await owner.getByRole('button', { name: 'Close Domain commands' }).click();

            await collaborator.getByRole('button', { name: 'Parameter details: Param 8' }).click();
            await collaborator.getByRole('button', { name: 'Edit parameter value' }).click();
            await collaborator.getByRole('textbox', { name: 'Value 1' }).fill('77');
            const pattern = '**' + scope + '/commands';
            let captured;
            const lost = async route => {
                if (route.request().method() !== 'POST' || captured) return route.continue();
                captured = route.request().postDataJSON();
                const accepted = await route.fetch();
                assert.equal(accepted.status(), 201);
                await route.abort('failed');
            };
            await collaborator.route(pattern, lost);
            await collaborator.getByRole('button', { name: 'Submit write' }).click();
            await collaborator.getByRole('button', { name: 'Retry same request' }).waitFor();
            await collaborator.unroute(pattern, lost);
            await collaborator.getByRole('button', { name: 'Close Parameter details: Param 8' }).click();
            await collaborator.getByRole('button', { name: 'Domain commands', exact: true }).click();

            const current = await store.domains.getById(fleet._id);
            await store.domains.changeMember(actor(admin._id), { domainId: fleet._id, revision: current.revision, userId: editor._id, role: 'viewer' });
            await collaborator.getByRole('button', { name: 'Retry same request' }).click();
            await collaborator.getByRole('button', { name: 'Retry same request' }).waitFor({ state: 'detached' });
            const visibleDomain = await (await collaborator.request.get(origin + scope)).json();
            assert.equal(visibleDomain.data.myRole, 'viewer');
            await collaborator.getByRole('button', { name: 'Check submission' }).click();
            await collaborator.getByText(/Write accepted at/).waitFor();
            assert.equal(await collaborator.getByRole('button', { name: 'Save command lifetime' }).count(), 0);
            assert.equal(await collaborator.getByRole('button', { name: /Cancel Write/ }).count(), 0);
            assert.deepEqual(captured.payload, { values: [77] });
            const poll = await post('/commands/poll', { ...machine, limit: 32 });
            assert.equal(poll.status, 200);
            const { data } = await poll.json();
            assert.deepEqual([...Buffer.from(data.packets, 'base64')], [7, 7, 4, 200, 0, 77]);
            assert.equal((await (await post('/commands/poll', { ...machine, limit: 32 })).json()).data.count, 0);
            await collaborator.getByLabel('Command view').selectOption('history');
            await collaborator.getByText('Write · retrieved', { exact: true }).waitFor();
            await owner.locator('.parameter-row .font-monospace').getByText('42', { exact: true }).waitFor();
            await publish(77);
            await owner.locator('.parameter-row .font-monospace').getByText('77', { exact: true }).waitFor();
            await collaborator.getByRole('button', { name: 'Close Domain commands' }).click();
            await collaborator.getByRole('button', { name: 'Node details' }).click();
            await collaborator.getByText('Command transport: HTTP', { exact: true }).waitFor();
            console.log('PASS: Chrome owner/editor-viewer contexts, canonical write, lost response recovery, role recheck, settings, poll and readback');
        } finally {
            await browser?.close();
            server.closeAllConnections();
            if (server.listening) await new Promise(resolve => server.close(resolve));
            await Promise.all([operator.close(), access.close(), store.close()]);
        }
    });
}
run().catch(error => { console.error(error); process.exitCode = 1; });
