'use strict';
// Actual production app, installed native store, real OAuth state/profile parsing, isolated provider responses.
const assert = require('node:assert/strict');
const http = require('node:http'); const path = require('node:path');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { createRequire } = require('node:module');
const hostedRoot = process.env.DRONELINK_HOSTED_ROOT || path.resolve(__dirname, '../..');
const hostedRequire = createRequire(path.join(hostedRoot, 'package.json'));
const { openFirestoreStore } = hostedRequire('@dronelink/persistence');
const { openAccessOperatorStore } = hostedRequire('@dronelink/persistence/operator');
const { withFirestore } = require('../../tools/firestore.cjs');
const { createApp } = hostedRequire('./app');
const { DRONE_LINK_MSG_TYPE_CHAR: CHAR, DRONE_LINK_MSG_TYPE_FLOAT: FLOAT } = hostedRequire('@dronelink/protocol');
async function run() {
    if (!process.env.CLIENT_BUILD_DIR) throw Error('Select an explicit built Client artifact');
    await withFirestore(async options => {
        const store = await openFirestoreStore({ ...options, flushIntervalMs: 10, observationEpoch: 'm1-c-1', observationFlushIntervalMs: 20 }); const operator = await openAccessOperatorStore({ ...options, databaseId: '(default)' });
        let app; const server = http.createServer((req, res) => app(req, res)); let browser;
        try {
            for (const name of ['admin', 'viewer']) await store.users.registerVerifiedSignIn({ googleId: name, email: name === 'admin' ? 'damian@axford.me.uk' : name + '@example.test', emailVerified: true, displayName: name });
            const plan = await operator.previewMigration({ schemaVersion: 1 }); await operator.beginMigration({ expectedSchemaVersion: 0, planDigest: plan.digest, reviewedPlan: plan });
            for (const row of plan.users) await operator.applyUserMigration({ userId: row.userId, sourceRevision: row.sourceDigest, planDigest: plan.digest });
            let control = await store.access.getControl(); const admin = await store.users.findByGoogleId('admin');
            await operator.grantSoleAdmin({ userId: admin._id, googleId: 'admin', expectedControlRevision: control.revision }); control = await store.access.getControl(); await operator.activate({ planDigest: plan.digest, expectedControlRevision: control.revision });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
            app = createApp({ config: { publicOrigin: origin, observationEpoch: 'm1-c-1', mapboxAccessToken: 'pk.local-operator-fixture', cookieKey: 'isolated-browser-session-secret-32-chars', googleClientID: 'fixture-client', googleClientSecret: 'fixture-secret', clientBuildDir: path.resolve(process.env.CLIENT_BUILD_DIR) }, store, googleStrategyFactory: (options, verify) => {
                const strategy = new GoogleStrategy(options, verify);
                strategy._oauth2.getOAuthAccessToken = (code, params, done) => done(null, code, 'fixture-refresh', {});
                strategy._oauth2.get = (url, token, done) => done(null, JSON.stringify({ sub: token, name: token, email: token === 'admin' ? 'damian@axford.me.uk' : token + '@example.test', email_verified: true }));
                return strategy;
            } });
            browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
            const ownerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] }); const viewerContext = await browser.newContext();
            // Keep real Mapbox rendering/markers while serving an inert local style:
            // no external map service, real token or basemap acceptance is involved.
            for (const context of [ownerContext, viewerContext]) {
                await context.route('https://api.mapbox.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#24303d' } }] }) }));
                await context.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204, body: '' }));
            }
            const login = async (context, name) => { const start = await context.request.get(origin + '/auth/google', { maxRedirects: 0 }); const state = new URL(start.headers().location).searchParams.get('state'); const result = await context.request.get(origin + '/auth/google/callback?code=' + name + '&state=' + encodeURIComponent(state), { maxRedirects: 0 }); assert.equal(result.status(), 302); };
            await login(ownerContext, 'admin'); await login(viewerContext, 'viewer');
            const ownerPage = await ownerContext.newPage(); const viewerPage = await viewerContext.newPage();
            for (const page of [ownerPage, viewerPage]) {
                page.on('pageerror', error => console.error('Browser page error:', error.message));
                page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
            }
            ownerPage.on('dialog', dialog => dialog.accept());
            await ownerPage.goto(origin + '/public');
            await ownerPage.getByRole('link', { name: 'Sign in with Google', exact: true }).waitFor();
            assert.equal(await ownerPage.evaluate(() => getComputedStyle(document.documentElement).fontSize), '14px');
            assert.equal(await ownerPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dw-color-canvas').trim()), '#171b20');
            assert.equal(await ownerPage.getByRole('link', { name: 'Sign in with Google', exact: true }).isVisible(), true);
            await ownerPage.goto(origin + '/private'); await ownerPage.getByRole('button', { name: 'New Domain', exact: true }).click();
            await ownerPage.getByLabel('Domain Name', { exact: true }).fill('Browser Fleet'); await ownerPage.getByRole('button', { name: 'Create Domain', exact: true }).click();
            const fleet = ownerPage.locator('.card').filter({ has: ownerPage.getByRole('link', { name: 'Browser Fleet', exact: true }) });
            const id = (await fleet.getByRole('link', { name: 'Browser Fleet', exact: true }).getAttribute('href')).split('/').at(-1);
            await fleet.getByLabel('Domain totals').getByText('1 user', { exact: true }).waitFor();
            assert.equal(await ownerPage.getByRole('button', { name: 'Domain settings' }).getAttribute('aria-haspopup'), 'dialog'); await ownerPage.getByRole('button', { name: 'Domain settings' }).click();
            await ownerPage.getByLabel('Invitation email').fill('viewer@example.test'); await ownerPage.getByLabel('Invitation role').selectOption('viewer'); await ownerPage.getByRole('button', { name: 'Create invitation' }).click();
            const link = ownerPage.getByLabel('Invitation share link'); await link.waitFor(); const invitationUrl = await link.inputValue();
            await ownerPage.getByRole('button', { name: 'Copy invitation link' }).click(); assert.equal(await ownerPage.evaluate(() => navigator.clipboard.readText()), invitationUrl);
            await ownerPage.getByRole('button', { name: 'Show key' }).click();
            await ownerPage.getByRole('button', { name: 'Hide key' }).waitFor();
            await ownerPage.getByRole('button', { name: 'Close Domain settings' }).click();
            await ownerPage.getByRole('dialog', { name: 'Domain settings' }).waitFor({ state: 'detached' });
            assert.equal(await ownerPage.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Domain settings');
            await ownerPage.getByRole('button', { name: 'Domain settings' }).click();
            assert.equal(await ownerPage.getByRole('button', { name: 'Hide key' }).count(), 0);
            assert.equal(await ownerPage.getByLabel('Invitation share link').count(), 0);
            await viewerPage.goto(invitationUrl); await viewerPage.getByRole('button', { name: 'Accept Invitation' }).click(); await viewerPage.waitForURL('**/private/domain/' + id);
            assert.equal(await viewerPage.getByRole('button', { name: 'Domain settings' }).count(), 0);
            await viewerPage.getByRole('link', { name: 'Home', exact: true }).click();
            await viewerPage.getByRole('button', { name: 'Domain settings' }).click(); assert.equal(await viewerPage.getByRole('button', { name: 'Show key' }).count(), 0);
            assert.equal((await viewerContext.request.get(origin + `/api/domains/${id}/key`)).status(), 403);
            await viewerPage.getByRole('button', { name: 'Close Domain settings', exact: true }).click();
            await ownerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
            await ownerPage.getByLabel('Role for viewer@example.test').selectOption('editor');
            await viewerPage.evaluate(() => window.dispatchEvent(new Event('focus'))); await viewerPage.getByLabel('Domain role and status').getByText('editor', { exact: true }).waitFor(); await viewerPage.getByRole('button', { name: 'Domain settings', exact: true }).click();
            await viewerPage.getByRole('button', { name: 'Show key' }).click(); await viewerPage.getByRole('button', { name: 'Hide key' }).waitFor();
            await ownerPage.getByLabel('Role for viewer@example.test').selectOption('viewer'); await viewerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
            await viewerPage.getByLabel('Domain role and status').getByText('viewer', { exact: true }).waitFor(); assert.equal(await viewerPage.getByRole('button', { name: 'Hide key' }).count(), 0);
            const pageRequests = [];
            for (const page of [ownerPage, viewerPage]) page.on('request', request => pageRequests.push(new URL(request.url()).pathname));
            const keyResponse = await ownerContext.request.get(origin + `/api/domains/${id}/key`); const key = (await keyResponse.json()).data.apiKey;
            const publish = async value => {
                const response = await ownerContext.request.post(origin + '/addPacket', { data: { domain: id, id: 254, apiKey: key, packet: Buffer.from([7,7,1,1,0,value]).toString('base64') } });
                assert.equal(response.status(), 202);
            };
            await ownerPage.screenshot({ path: '/tmp/domain-home-administration.png', fullPage: true });
            for (const page of [ownerPage, viewerPage]) await page.goto(origin + '/private/domain/' + id);
            assert.equal(await ownerPage.getByRole('button', { name: 'Domain settings' }).count(), 0);
            await publish(42);
            const select = async page => {
                await page.locator('.node-selector select option[value="7"]').waitFor({ state: 'attached' });
                await page.locator('.node-selector select').selectOption('7');
                await page.getByRole('button', { name: 'Expand All', exact: true }).click();
            };
            const valueVisible = async (page, value) => page.locator('.parameter-row .font-monospace').getByText(String(value), { exact: true }).waitFor();
            await select(ownerPage); await select(viewerPage);
            await valueVisible(ownerPage, 42); await valueVisible(viewerPage, 42);
            const identityBefore = await (await ownerContext.request.get(origin + `/api/domains/${id}/identities`)).json();
            assert.equal(await viewerPage.getByRole('button', { name: 'Reset node observations' }).count(), 0);
            await ownerPage.getByRole('button', { name: 'Inspector tools' }).click();
            await ownerPage.getByRole('button', { name: 'Reset node observations' }).click();
            await ownerPage.getByRole('button', { name: 'Close Inspector tools' }).click();
            for (const page of [ownerPage, viewerPage]) await page.waitForFunction(() => document.querySelectorAll('.parameter-row').length === 0);
            const identityAfter = await (await ownerContext.request.get(origin + `/api/domains/${id}/identities`)).json(); assert.deepEqual(identityAfter, identityBefore);
            await publish(43);
            // Expansion remains controlled while the node structure rebuilds.
            for (const page of [ownerPage, viewerPage]) {
                await page.getByRole('button', { name: /^(Expand|Collapse) All$/ }).waitFor();
                if (await page.getByRole('button', { name: 'Expand All', exact: true }).count()) await page.getByRole('button', { name: 'Expand All', exact: true }).click();
                await valueVisible(page, 43);
            }
            await viewerPage.reload(); await select(viewerPage); await valueVisible(viewerPage, 43);
            assert.ok(!pageRequests.some(url => /\/(messages|stream)$/.test(url)), 'Current view must not consume packet history');
            const history = await ownerContext.request.get(origin + `/api/domains/${id}/messages`, { headers: { 'X-Observation-Contract': '1' } });
            assert.equal(history.status(), 200); assert.equal((await history.json()).data.length, 2);
            await viewerPage.getByRole('button', { name: 'Inspector tools' }).click();
            await viewerPage.getByText(/Saved failed snapshot writes: 0/).waitFor();
            assert.equal(await viewerPage.getByRole('button', { name: 'Reset node observations' }).count(), 0);
            await viewerPage.getByRole('button', { name: 'Close Inspector tools' }).click();
            console.log('PASS: two Chrome contexts share persisted observations, clear on reset, preserve identity/history, rebuild/reload and exclude Viewer reset');
            const packet = async (channel, param, type, values) => {
                let payload;
                if (type === CHAR) payload = Buffer.from(values);
                else { payload = Buffer.alloc(values.length * 4); values.forEach((value, index) => payload.writeFloatLE(value, index * 4)); }
                const bytes = Buffer.concat([Buffer.from([7, 7, channel, param, (type << 4) | (payload.length - 1)]), payload]);
                const response = await ownerContext.request.post(origin + '/addPacket', { data: { domain: id, id: 254, apiKey: key, packet: bytes.toString('base64') } });
                assert.equal(response.status(), 202);
            };
            const marker = page => page.getByRole('button', { name: /Drone .*Node 7.*Binding 7>/ });
            // Values can precede module type; snapshots and live updates reconstruct alike.
            await packet(2, 10, FLOAT, [-1.8, 51.5, 0]); await packet(2, 5, CHAR, 'Nav');
            for (const page of [ownerPage, viewerPage]) {
                await page.getByRole('button', { name: 'Fit observed positions', exact: true }).click();
                await marker(page).waitFor().catch(async error => {
                    await page.screenshot({ path: '/tmp/m1-d-browser-failure.png', fullPage: true });
                    console.error('Map fixture diagnostics:', await page.evaluate(() => ({ markerCount: document.querySelectorAll('.mapboxgl-marker').length, map: document.querySelector('[aria-label="Observed Drone map"]')?.innerHTML.slice(0, 500), status: Array.from(document.querySelectorAll('[role="status"]')).map(el => el.textContent), options: Array.from(document.querySelectorAll('.node-selector option')).map(el => el.textContent) })));
                    throw error;
                });
            }
            await packet(4, 8, FLOAT, [-1.9, 51.6, 0]); await packet(4, 5, CHAR, 'NMEA');
            for (const page of [ownerPage, viewerPage]) {
                await page.locator('.mapboxgl-marker[title*="Binding 7>4.8"]').waitFor({ state: 'attached' });
                await page.getByRole('button', { name: 'Fit observed positions', exact: true }).click();
                await page.getByRole('button', { name: /Binding 7>4.8.*priority 3/ }).waitFor();
            }
            await packet(9, 5, CHAR, 'NMEA'); await packet(9, 8, FLOAT, [-2, 52, 0]);
            await packet(2, 10, FLOAT, [-2.1, 52.1, 0]);
            for (const page of [ownerPage, viewerPage]) {
                await page.getByText('Channel 9', { exact: true }).click();
                await page.locator('.channel-card').filter({ has: page.getByText('Channel 9', { exact: true }) }).locator('.font-monospace').getByText('-2, 52, 0', { exact: true }).waitFor();
                await page.getByRole('button', { name: /Binding 7>4.8.*priority 3/ }).waitFor();
                assert.equal(await marker(page).count(), 1);
                await page.getByRole('button', { name: 'Fit observed positions', exact: true }).click();
                await marker(page).click();
                await page.getByRole('button', { name: 'Node details' }).click();
                await page.getByText(/Drone: .*Singleton master: Node 7/).waitFor();
                await page.getByRole('button', { name: 'Close Node details' }).click();
                await page.getByRole('button', { name: 'Map source bindings', exact: true }).click();
                await page.getByRole('cell', { name: /7>4.8/ }).waitFor();
                await page.getByRole('button', { name: 'Close Map source bindings' }).click();
            }
            // Reconnect keeps the saved map while update requests fail, then catches up.
            await viewerPage.route('**/observations/updates?**', route => route.abort('failed'));
            await packet(4, 8, FLOAT, [-1.95, 51.65, 0]);
            await viewerPage.getByText('Shared updates: retrying', { exact: true }).waitFor({ timeout: 35000 });
            assert.equal(await marker(viewerPage).count(), 1);
            await viewerPage.unroute('**/observations/updates?**');
            await packet(4, 8, FLOAT, [-1.96, 51.66, 0]);
            await viewerPage.getByText('Shared updates: ready', { exact: true }).waitFor({ timeout: 35000 });
            await viewerPage.reload(); await viewerPage.getByRole('button', { name: 'Fit observed positions', exact: true }).click(); await marker(viewerPage).click();
            await viewerPage.getByRole('button', { name: 'Node details' }).click();
            await viewerPage.getByText(/Drone: .*Singleton master: Node 7/).waitFor();
            await viewerPage.getByRole('button', { name: 'Close Node details' }).click();
            assert.equal(await viewerPage.getByRole('button', { name: 'Reset node observations' }).count(), 0);
            await ownerPage.screenshot({ path: '/tmp/m1-d-operator.png', fullPage: true });
            // Domain switch removes markers and selection, even for the same browser session.
            await ownerPage.goto(origin + '/private'); await ownerPage.getByRole('button', { name: 'New Domain', exact: true }).click();
            await ownerPage.getByLabel('Domain Name', { exact: true }).fill('Empty Operator Domain');
            await ownerPage.getByRole('button', { name: 'Create Domain', exact: true }).click();
            await ownerPage.getByRole('link', { name: 'Empty Operator Domain', exact: true }).click();
            await ownerPage.getByText('No nodes discovered', { exact: true }).waitFor(); assert.equal(await marker(ownerPage).count(), 0);
            await ownerPage.goto(origin + '/private/domain/' + id); await ownerPage.getByRole('button', { name: 'Fit observed positions', exact: true }).click(); await marker(ownerPage).click();
            await ownerPage.getByRole('button', { name: 'Inspector tools' }).click();
            await ownerPage.getByRole('button', { name: 'Reset node observations' }).click();
            await ownerPage.getByRole('button', { name: 'Close Inspector tools' }).click();
            for (const page of [ownerPage, viewerPage]) await page.waitForFunction(() => document.querySelectorAll('.mapboxgl-marker').length === 0);
            console.log('PASS: real Mapbox markers with inert style; Nav/NMEA precedence, provenance, carried identity, two-context updates, retry/reconnect, reload, Domain isolation and reset removal');

            await ownerPage.getByRole('link', { name: 'Home', exact: true }).click();
            const adminCard = ownerPage.locator('.card').filter({ has: ownerPage.getByRole('link', { name: 'Browser Fleet', exact: true }) });
            await adminCard.getByRole('button', { name: 'Domain settings' }).click();
            await ownerPage.getByRole('dialog', { name: 'Domain settings' }).getByRole('button', { name: 'Archive domain' }).click();
            await adminCard.waitFor({ state: 'detached' });
            await viewerPage.reload(); await viewerPage.getByText('Archived domain · Read-only retained history.', { exact: false }).waitFor();
            await ownerPage.getByRole('tab', { name: 'Archived domains', exact: true }).click();
            await adminCard.getByRole('button', { name: 'Domain settings' }).click();
            await ownerPage.getByRole('dialog', { name: 'Domain settings' }).getByRole('button', { name: 'Restore domain' }).click();
            await adminCard.waitFor({ state: 'detached' });
            await ownerPage.getByRole('tab', { name: 'Active domains', exact: true }).click();
            await adminCard.getByRole('link', { name: 'Browser Fleet', exact: true }).click();
            await viewerPage.reload(); assert.equal(await viewerPage.getByText('Archived domain · Read-only retained history.', { exact: false }).count(), 0);
            // Responsive surfaces use the same typography, retain account navigation and avoid horizontal overflow.
            await ownerPage.setViewportSize({ width: 390, height: 844 });
            await ownerPage.locator('.sidebar-container.collapsed').waitFor();
            assert.equal(await ownerPage.getByRole('button', { name: 'Expand navigation' }).count(), 0);
            assert.equal(await ownerPage.getByLabel('Workspace navigation').evaluate(element => Math.round(element.getBoundingClientRect().width)), 56);
            await ownerPage.locator('[data-panel-group][data-panel-group-direction="vertical"]').waitFor();
            assert.equal(await ownerPage.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth), true);
            assert.equal(await ownerPage.locator('.inspector-panel').evaluate(element => getComputedStyle(element).fontSize), '14px');
            await ownerPage.screenshot({ path: '/tmp/dw-mobile-operations.png', fullPage: true });
            await ownerPage.getByRole('link', { name: 'Home', exact: true }).click();
            await ownerPage.getByRole('button', { name: 'New Domain', exact: true }).waitFor();
            assert.equal(await ownerPage.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth), true);
            await ownerPage.getByRole('button', { name: 'New Domain', exact: true }).click();
            const createDialog = ownerPage.getByRole('dialog', { name: 'Create Domain' });
            await createDialog.waitFor();
            assert.equal(await createDialog.evaluate(element => getComputedStyle(element).fontSize), '14px');
            await ownerPage.getByRole('button', { name: 'Close Create Domain' }).click();
            await ownerPage.screenshot({ path: '/tmp/dw-mobile-home.png', fullPage: true });
            await ownerPage.setViewportSize({ width: 1280, height: 900 });
            console.log('PASS: shared 14px tokens, modal focus/secret cleanup and narrow Home/operations rail/layout');
            console.log('PASS: real Chrome + native Server/Client: create, targeted copy/accept, Viewer filtering, Editor key/demotion cleanup, archive/reload/restore');
        } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); await operator.close(); }
    });
}
run().catch(error => { console.error(error); process.exitCode = 1; });
