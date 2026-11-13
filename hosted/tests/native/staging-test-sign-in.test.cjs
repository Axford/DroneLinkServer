'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../app');
const { startHosted } = require('../../index');
const { serve } = require('../application/support.cjs');
const { fixture, domain, current } = require('./support.cjs');

const page = '/auth/staging-test';
const api = '/api/staging-test';

test('staging sign-in uses normal sessions, current roles and auditable one-use handoffs', async t => {
    await fixture(t, async ({ one, db, agent, factories, config }) => {
        const admin = await agent('admin');
        const ordinary = await agent('regular');
        const primary = await domain(admin, 'Staging test access');
        const other = await domain(admin, 'Separate staging Domain');
        const assign = (name, role, revision) => admin.mutate(api + '/memberships', { name, role, revision, domainId: primary._id });
        const issue = async userId => {
            const response = await admin.mutate(api + '/codes', { userId, recipient: 'WB.4 agent' });
            assert.equal(response.status, 200, response.text);
            return response.json().data;
        };
        const redeem = (browser, code, origin = config.publicOrigin) => browser.request(page, {
            method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code })
        });
        const audit = async id => (await admin.request(api + '/codes/' + id)).json().data;

        const form = await (factories[0]()).request(page);
        assert.equal(form.status, 200);
        assert.equal(form.headers.get('referrer-policy'), 'same-origin');
        assert.equal((await admin.request(page + '/admin')).status, 200);
        assert.equal((await ordinary.request(page + '/admin')).status, 403);
        assert.equal((await ordinary.mutate(api + '/codes', { userId: 'staging-test-editor', recipient: 'WB.4' })).status, 403);
        assert.equal((await assign('editor', 'owner', primary.revision)).status, 400);
        const first = await assign('editor', 'editor', primary.revision);
        assert.equal(first.status, 200, first.text);
        const second = await assign('viewer', 'viewer', first.json().data.revision);
        assert.equal(second.status, 200, second.text);
        assert.equal((await admin.mutate('/api/domains/' + primary._id + '/members/staging-test-editor',
            { role: 'owner', revision: second.json().data.revision }, 'PATCH')).status, 403);
        assert.equal((await admin.mutate(api + '/codes', { userId: (await one.users.findByGoogleId('admin'))._id, recipient: 'test' })).status, 400);
        await assert.rejects(one.users.registerVerifiedSignIn({ googleId: 'foreign', email: 'editor@staging-test.invalid', emailVerified: true, displayName: 'Foreign' }), { code: 'validation' });
        const disabled = (await serve(t, createApp({ config, store: one })))();
        assert.equal((await disabled.request(page)).status, 404);

        const issued = await issue('staging-test-editor');
        assert.equal(Date.parse(issued.codeExpiresAt) - Date.parse(issued.issuedAt), 600000);
        const browserA = factories[0]();
        const browserB = factories[1]();
        assert.equal((await redeem(browserA, issued.code, 'https://wrong.example')).status, 403);
        assert.equal((await redeem(browserA, issued.code, 'null')).status, 403);
        const competing = await Promise.all([redeem(browserA, issued.code), redeem(browserB, issued.code)]);
        assert.deepEqual(competing.map(response => response.status).sort(), [303, 410]);
        const browser = competing[0].status === 303 ? browserA : browserB;
        assert.equal((await disabled.request('/api/user', { headers: { Cookie: browser.cookie } })).status, 401);
        const profile = (await browser.request('/api/user')).json();
        assert.equal(profile._id, 'staging-test-editor');
        assert.equal(profile.isPlatformAdmin, false);
        assert.equal((await browser.request('/api/domains/' + other._id)).status, 403);
        assert.deepEqual((await browser.request('/api/domains')).json().data.map(row => row._id), [primary._id]);
        const editor = (await browser.request('/api/domains/' + primary._id)).json().data;
        assert.equal(editor.myRole, 'editor');
        assert.equal(editor.canEdit, true);
        assert.equal(editor.canManageMembers, false);
        const redeemed = await audit(issued._id);
        assert.equal(Date.parse(redeemed.sessionExpiresAt) - Date.parse(redeemed.redeemedAt), 14400000);
        assert.equal(redeemed.recipient, 'WB.4 agent');
        for (const key of ['sessionId', 'code', 'tokenHash']) assert.equal(Object.hasOwn(redeemed, key), false);

        const viewerCode = await issue('staging-test-viewer');
        const viewer = factories[1]();
        assert.equal((await redeem(viewer, viewerCode.code)).status, 303);
        const viewerDomain = (await viewer.request('/api/domains/' + primary._id)).json().data;
        assert.equal(viewerDomain.myRole, 'viewer');
        assert.equal(viewerDomain.canEdit, false);
        const mutate = async (client, path, method, data) => {
            const token = (await client.request('/api/session')).json().data.csrfToken;
            return client.request(path, { method, headers: { Origin: config.publicOrigin, 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(data) });
        };
        const name = { name: 'Staging test access verified', revision: viewerDomain.revision };
        assert.equal((await mutate(viewer, '/api/domains/' + primary._id, 'PUT', name)).status, 403);
        assert.equal((await mutate(browser, '/api/domains/' + primary._id, 'PUT', name)).status, 200);

        const beforeLogout = browser.cookie;
        assert.equal((await mutate(browser, '/auth/logout', 'POST', {})).status, 302);
        assert.equal((await factories[0]().request('/api/user', { headers: { Cookie: beforeLogout } })).status, 401);
        assert.equal((await audit(issued._id)).revocationReason, 'session-ended');
        assert.equal((await admin.mutate(api + '/codes/' + viewerCode._id, {}, 'DELETE')).status, 200);
        assert.equal((await viewer.request('/api/user')).status, 401);
        assert.equal((await audit(viewerCode._id)).revocationReason, 'admin');

        const unused = await issue('staging-test-editor');
        assert.equal((await admin.mutate(api + '/codes/' + unused._id, {}, 'DELETE')).status, 200);
        assert.equal((await redeem(factories[0](), unused.code)).status, 410);
        const expired = await issue('staging-test-editor');
        await db.collection('stagingTestSignIns').doc(expired._id).update({ codeExpiresAt: new Date(0) });
        assert.equal((await redeem(factories[0](), expired.code)).status, 410);

        const fresh = await issue('staging-test-editor');
        const freshBrowser = factories[0]();
        assert.equal((await redeem(freshBrowser, fresh.code)).status, 303);
        const latest = await current(admin, primary._id);
        assert.equal((await assign('editor', 'viewer', latest.revision)).status, 200);
        assert.equal((await freshBrowser.request('/api/domains/' + primary._id)).json().data.canEdit, false);
        const freshAudit = (await db.collection('stagingTestSignIns').doc(fresh._id).get()).data();
        await db.collection('sessions').doc(freshAudit.sessionId).update({ expiresAt: new Date(0) });
        assert.equal((await freshBrowser.request('/api/user')).status, 401);
    }, { stagingTestSignIn: true });
});

test('production target refuses staging sign-in before storage opens', async () => {
    let opened = false;
    await assert.rejects(startHosted({
        config: { projectId: 'dronewright-prod', publicOrigin: 'https://fleet.dronewright.com', stagingTestSignIn: true },
        storeFactory: async () => { opened = true; }
    }), /requires the canonical staging deployment/);
    assert.equal(opened, false);
});
