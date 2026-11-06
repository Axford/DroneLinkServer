'use strict';
// Actual production app, installed native store, real OAuth state/profile parsing, isolated provider responses.
const assert = require('node:assert/strict');
const http = require('node:http'); const path = require('node:path');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { openFirestoreStore } = require('@dronelink/persistence');
const { openAccessOperatorStore } = require('@dronelink/persistence/operator');
const { withFirestore } = require('../../tools/firestore.cjs');
const { createApp } = require('../../app');
async function run() {
    if (!process.env.CLIENT_BUILD_DIR) throw Error('Select an explicit built Client artifact');
    await withFirestore(async options => {
        const store = await openFirestoreStore({ ...options, flushIntervalMs: 10 }); const operator = await openAccessOperatorStore({ ...options, databaseId: '(default)' });
        let app; const server = http.createServer((req, res) => app(req, res)); let browser;
        try {
            for (const name of ['admin', 'viewer']) await store.users.registerVerifiedSignIn({ googleId: name, email: name === 'admin' ? 'damian@axford.me.uk' : name + '@example.test', emailVerified: true, displayName: name });
            const plan = await operator.previewMigration({ schemaVersion: 1 }); await operator.beginMigration({ expectedSchemaVersion: 0, planDigest: plan.digest, reviewedPlan: plan });
            for (const row of plan.users) await operator.applyUserMigration({ userId: row.userId, sourceRevision: row.sourceDigest, planDigest: plan.digest });
            let control = await store.access.getControl(); const admin = await store.users.findByGoogleId('admin');
            await operator.grantSoleAdmin({ userId: admin._id, googleId: 'admin', expectedControlRevision: control.revision }); control = await store.access.getControl(); await operator.activate({ planDigest: plan.digest, expectedControlRevision: control.revision });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
            app = createApp({ config: { publicOrigin: origin, cookieKey: 'isolated-browser-session-secret-32-chars', googleClientID: 'fixture-client', googleClientSecret: 'fixture-secret', clientBuildDir: path.resolve(process.env.CLIENT_BUILD_DIR) }, store, googleStrategyFactory: (options, verify) => {
                const strategy = new GoogleStrategy(options, verify);
                strategy._oauth2.getOAuthAccessToken = (code, params, done) => done(null, code, 'fixture-refresh', {});
                strategy._oauth2.get = (url, token, done) => done(null, JSON.stringify({ sub: token, name: token, email: token === 'admin' ? 'damian@axford.me.uk' : token + '@example.test', email_verified: true }));
                return strategy;
            } });
            browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome', headless: true });
            const ownerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] }); const viewerContext = await browser.newContext();
            const login = async (context, name) => { const start = await context.request.get(origin + '/auth/google', { maxRedirects: 0 }); const state = new URL(start.headers().location).searchParams.get('state'); const result = await context.request.get(origin + '/auth/google/callback?code=' + name + '&state=' + encodeURIComponent(state), { maxRedirects: 0 }); assert.equal(result.status(), 302); };
            await login(ownerContext, 'admin'); await login(viewerContext, 'viewer');
            const ownerPage = await ownerContext.newPage(); const viewerPage = await viewerContext.newPage();
            ownerPage.on('dialog', dialog => dialog.accept());
            await ownerPage.goto(origin + '/private'); await ownerPage.getByRole('button', { name: 'New Domain', exact: true }).click();
            await ownerPage.getByLabel('Domain Name', { exact: true }).fill('Browser Fleet'); await ownerPage.getByRole('button', { name: 'Create Domain', exact: true }).click();
            await ownerPage.getByRole('link', { name: 'Browser Fleet', exact: true }).click();
            const id = ownerPage.url().split('/').at(-1); await ownerPage.getByRole('button', { name: /Collaboration/ }).click();
            await ownerPage.getByLabel('Invitation email').fill('viewer@example.test'); await ownerPage.getByLabel('Invitation role').selectOption('viewer'); await ownerPage.getByRole('button', { name: 'Create invitation' }).click();
            const link = ownerPage.getByLabel('Invitation share link'); await link.waitFor(); const invitationUrl = await link.inputValue();
            await ownerPage.getByRole('button', { name: 'Copy invitation link' }).click(); assert.equal(await ownerPage.evaluate(() => navigator.clipboard.readText()), invitationUrl);
            await viewerPage.goto(invitationUrl); await viewerPage.getByRole('button', { name: 'Accept Invitation' }).click(); await viewerPage.waitForURL('**/private/domain/' + id);
            await viewerPage.getByRole('button', { name: /Collaboration/ }).click(); assert.equal(await viewerPage.getByRole('button', { name: 'Show key' }).count(), 0);
            assert.equal((await viewerContext.request.get(origin + `/api/domains/${id}/key`)).status(), 403);
            await ownerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
            await ownerPage.getByLabel('Role for viewer@example.test').selectOption('editor');
            await viewerPage.evaluate(() => window.dispatchEvent(new Event('focus'))); await viewerPage.getByRole('button', { name: /Collaboration.*editor/ }).click();
            await viewerPage.getByRole('button', { name: 'Show key' }).click(); await viewerPage.getByRole('button', { name: 'Hide key' }).waitFor();
            await ownerPage.getByLabel('Role for viewer@example.test').selectOption('viewer'); await viewerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
            await viewerPage.getByRole('button', { name: /Collaboration.*viewer/ }).waitFor(); assert.equal(await viewerPage.getByRole('button', { name: 'Hide key' }).count(), 0);
            await ownerPage.getByRole('button', { name: 'Archive domain' }).click(); await ownerPage.getByText('Archived domain · Read-only retained history.', { exact: false }).waitFor();
            await viewerPage.reload(); await viewerPage.getByText('Archived domain · Read-only retained history.', { exact: false }).waitFor();
            await ownerPage.getByRole('button', { name: /Collaboration/ }).click(); await ownerPage.getByRole('button', { name: 'Restore domain' }).click();
            await ownerPage.getByRole('button', { name: /Collaboration.*active/ }).waitFor();
            await viewerPage.reload(); assert.equal(await viewerPage.getByText('Archived domain · Read-only retained history.', { exact: false }).count(), 0);
            console.log('PASS: real Chrome + native Server/Client: create, targeted copy/accept, Viewer filtering, Editor key/demotion cleanup, archive/reload/restore');
        } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); await operator.close(); }
    });
}
run().catch(error => { console.error(error); process.exitCode = 1; });
