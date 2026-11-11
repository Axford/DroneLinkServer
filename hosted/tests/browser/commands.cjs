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

function verifiedPersistence(root, version, expectedProvenance) {
    const fs = require('node:fs');
    const crypto = require('node:crypto');
    const from = createRequire(path.join(root, 'package.json'));
    const installed = path.dirname(from.resolve('@dronelink/persistence'));
    const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
    const provenanceBytes = fs.readFileSync(path.join(installed, 'provenance.json'));
    assert.equal(digest(provenanceBytes), expectedProvenance);
    const provenance = JSON.parse(provenanceBytes);
    assert.equal(provenance.version, version);
    for (const [file, hash] of Object.entries(provenance.files)) {
        if (file === 'package-lock.json') continue;
        assert.equal(digest(fs.readFileSync(path.join(installed, file))), hash);
    }
    return from('@dronelink/persistence');
}

async function run() {
    assert.ok(process.env.CLIENT_BUILD_DIR, 'Select the Client build explicitly');
    await withFirestore(async options => {
        const config = { ...options, databaseId: '(default)', commandContract: 'm2-a-1', observationEpoch: 'm1-c-1', observationFlushIntervalMs: 20 };
        let store, access, operator;
        let app, browser, nodeProbe;
        const server = http.createServer((req, res) => app(req, res));
        try {
            store = await openFirestoreStore(config);
            access = await openAccessOperatorStore(config);
            operator = await openCommandOperatorStore(config);
            if (process.env.DRONELINK_NODE_DIR) nodeProbe = await require('./command-node.cjs').buildNode(process.env.DRONELINK_NODE_DIR);
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
            await owner.locator('.parameter-row .font-monospace').getByText('42', { exact: true }).waitFor();
            if (nodeProbe) {
                await owner.getByRole('button', { name: 'Domain commands', exact: true }).click();
                await owner.getByRole('textbox', { name: 'Query channel' }).fill('4');
                await owner.getByRole('textbox', { name: 'Query parameter' }).fill('8');
                await owner.getByRole('button', { name: 'Query addressed name' }).click();
                await owner.getByText(/Name query accepted at/).waitFor();
                await owner.getByRole('button', { name: 'Close Domain commands' }).click();
                assert.deepEqual(await nodeProbe.poll({ origin, ...machine }),
                    { writes: 1, queries: 1, names: 1, value: 77, uploads: 2, failures: 0 });
                const detail = owner.getByRole('button', { name: 'Parameter details: Fixture' });
                await detail.waitFor();
                const valueFacet = async () => (await store.observations.readSnapshot(actor(admin._id), { domainId: fleet._id })).channels[0].params[8].value;
                const beforeQuery = await valueFacet();
                await detail.click();
                await owner.getByRole('button', { name: 'Query value', exact: true }).click();
                await owner.getByText(/Value query accepted at/).waitFor();
                assert.deepEqual(await nodeProbe.poll({ origin, ...machine, initialValue: 77 }),
                    { writes: 0, queries: 1, names: 0, value: 77, uploads: 1, failures: 0 });
                let afterQuery = await valueFacet();
                for (let i = 0; i < 80 && afterQuery.lastReceivedAt <= beforeQuery.lastReceivedAt; i++) {
                    await new Promise(resolve => setTimeout(resolve, 25));
                    afterQuery = await valueFacet();
                }
                assert.ok(afterQuery.lastReceivedAt > beforeQuery.lastReceivedAt);
                assert.equal(afterQuery.payload, beforeQuery.payload);
                assert.deepEqual(afterQuery.valueLastChangedAt, beforeQuery.valueLastChangedAt);
                await owner.getByRole('button', { name: 'Close Parameter details: Fixture' }).click();
            } else {
                const poll = await post('/commands/poll', { ...machine, limit: 32 });
                assert.equal(poll.status, 200);
                const { data } = await poll.json();
                assert.deepEqual([...Buffer.from(data.packets, 'base64')], [7, 7, 4, 200, 0, 77]);
                await owner.locator('.parameter-row .font-monospace').getByText('42', { exact: true }).waitFor();
                await publish(77);
            }
            assert.equal((await (await post('/commands/poll', { ...machine, limit: 32 })).json()).data.count, 0);
            await collaborator.getByLabel('Command view').selectOption('history');
            await collaborator.getByText('Write · retrieved', { exact: true }).waitFor();
            await owner.locator('.parameter-row .font-monospace').getByText('77', { exact: true }).waitFor();
            await collaborator.getByRole('button', { name: 'Close Domain commands' }).click();
            await collaborator.getByRole('button', { name: 'Node details' }).click();
            await collaborator.getByText('Command transport: HTTP', { exact: true }).waitFor();
            console.log('PASS: Chrome command workflow, role recheck, settings and distinct observed values');
            const serviceMode = process.env.DRONELINK_HOSTED_ROOT ? 'installed hosted app' : 'source hosted app';
            if (nodeProbe) console.log('PASS: CloudTelemetry host and production channel dequeue with fixture target, write/readback and explicit value/NAME queries through ' + serviceMode);
            else console.log('PASS: HTTP packet bytes and simulated publication through ' + serviceMode);
            if (process.env.DRONELINK_LEGACY_ROOT) {
                const crypto = require('node:crypto');
                const previous = verifiedPersistence(process.env.DRONELINK_LEGACY_ROOT, '0.5.0',
                    '707dcfbc1b6ccdda807906d4917d2513b0e753ddeaea22f4c64be3f8e057a513');
                const legacy = await previous.openFirestoreStore({ ...options, observationEpoch: 'm1-c-1' });
                let oldM2;
                try {
                    if (process.env.DRONELINK_PRE_CLEANUP_ROOT) {
                        const firstM2 = verifiedPersistence(process.env.DRONELINK_PRE_CLEANUP_ROOT, '0.7.0',
                            '34b831bcf967b3c29fd3f513c42d5924640233f5eeee7adfaec62f4ee7ded965');
                        oldM2 = await firstM2.openFirestoreStore(config);
                        assert.equal((await oldM2.access.getControl()).schemaVersion, 2);
                    }
                    const writer = actor(admin._id);
                    await assert.rejects(legacy.access.getControl(), { code: 'unavailable' });
                    const second = await store.domains.createOwned(writer, { name: 'Second recovery Domain' });
                    const domainId = fleet._id;
                    await store.telemetry.admit({ domainId: second._id, credential: { kind: 'domain', secret: second.apiKey },
                        nodeAddress: 7, forwarderAddress: 7, receivedAt: new Date() });
                    const submit = async domainId => {
                        const { submissionId } = await store.commands.prepare(writer, { domainId });
                        const result = await store.commands.submit(writer, { domainId, submissionId,
                            operation: 'query-value', target: { nodeAddress: 7, channel: 4, param: 9 } });
                        return result.command;
                    };
                    const pending = [await submit(domainId), await submit(second._id)];
                    const before = await store.observations.readSnapshot(writer, { domainId });
                    const revision = async () => (await store.access.getControl()).revision;
                    await operator.disable({ expectedControlRevision: await revision() });
                    await assert.rejects(store.commands.prepare(writer, { domainId }), { code: 'unavailable' });
                    assert.equal((await post('/commands/poll', { ...machine, limit: 32 })).status, 503);
                    for (const command of pending) assert.equal((await store.commands.get(writer, { domainId: command.domainId, commandId: command.id })).state, 'pending');
                    await operator.beginRecovery({ expectedControlRevision: await revision() });
                    if (oldM2) {
                        await assert.rejects(oldM2.access.getControl(), { code: 'unavailable' });
                        await assert.rejects(oldM2.telemetry.admit({ domainId, credential: { kind: 'domain', secret: fleet.apiKey },
                            nodeAddress: 7, forwarderAddress: 7, receivedAt: new Date() }), { code: 'unavailable' });
                    }
                    await operator.recoverDomain({ domainId });
                    assert.equal((await operator.purgeRecoveryMetadata({ domainId })).complete, true);
                    await assert.rejects(operator.finishRecovery({ expectedControlRevision: await revision() }), { code: 'conflict' });
                    await operator.recoverDomain({ domainId: second._id });
                    assert.equal((await operator.purgeRecoveryMetadata({ domainId: second._id })).complete, true);
                    await operator.finishRecovery({ expectedControlRevision: await revision() });
                    assert.equal((await legacy.access.getControl()).schemaVersion, 1);
                    const after = await legacy.observations.readSnapshot(writer, { domainId });
                    assert.deepEqual(after.nodes, before.nodes);
                    assert.deepEqual(after.channels, before.channels);
                    for (const command of pending) {
                        const retired = await store.commands.get(writer, { domainId: command.domainId, commandId: command.id });
                        assert.equal(retired.reason, 'writer-downgrade');
                    }
                    assert.equal((await store.access.getControl()).sessionEpoch, epoch);
                    const admission = await legacy.telemetry.admit({ domainId, credential: { kind: 'domain', secret: fleet.apiKey },
                        nodeAddress: 7, forwarderAddress: 7, receivedAt: new Date(), receiptId: crypto.randomUUID() });
                    await legacy.observations.enqueue({ ticket: admission.observationTicket, packet: Buffer.from([7, 7, 4, 8, 128, 78]) });
                    let visible;
                    for (let i = 0; i < 80; i++) {
                        visible = await legacy.observations.readSnapshot(writer, { domainId });
                        if (visible.channels[0].params[8].value.payload === 'Tg==') break;
                        await new Promise(resolve => setTimeout(resolve, 25));
                    }
                    assert.equal(visible.channels[0].params[8].value.payload, 'Tg==');
                    console.log('PASS: two-Domain recovery, exact 0.5.0 snapshots and a post-recovery legacy write');
                    if (oldM2) console.log('PASS: the dedicated recovery fence rejected installed 0.7.0 reads and ingress');
                } finally { await Promise.all([legacy.close(), oldM2?.close()]); }
            }
        } finally {
            const browserCleanup = await Promise.allSettled([browser?.close(), nodeProbe?.close()]);
            server.closeAllConnections();
            const serverClose = server.listening ? new Promise(resolve => server.close(resolve)) : undefined;
            const serviceCleanup = await Promise.allSettled([serverClose, operator?.close(), access?.close(), store?.close()]);
            const failures = [...browserCleanup, ...serviceCleanup].filter(result => result.status === 'rejected');
            if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Command fixture cleanup failed');
        }
    });
}
run().catch(error => { console.error(error); process.exitCode = 1; });
