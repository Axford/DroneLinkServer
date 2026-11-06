'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { Strategy } = require('passport');
const { Firestore } = require('@google-cloud/firestore');
const { openFirestoreStore } = require('@dronelink/persistence');
const { openAccessOperatorStore } = require('@dronelink/persistence/operator');
const { withFirestore } = require('../../tools/firestore.cjs');
const { createApp } = require('../../app');
const { serve, testConfig } = require('../application/support.cjs');
const parseGoogle = require('passport-google-oauth20/lib/profile/openid').parse;
class GoogleFixture extends Strategy {
    constructor(options, verify) { super(); this.name = 'google'; this.verify = verify; }
    authenticate(req) {
        if (!req.path.endsWith('/callback')) return this.redirect('https://accounts.google.com/test-consent');
        const id = req.query.identity || 'admin';
        const profile = parseGoogle({ sub: id, email: id === 'admin' ? 'damian@axford.me.uk' : id + '@example.test', name: id, email_verified: id === 'unverified' ? false : id === 'missing-claim' ? undefined : true });
        this.verify('provider-access', 'provider-refresh', profile, (error, user) => error ? this.error(error) : this.success(user));
    }
}
async function fixture(t, run, { ready = true } = {}) {
    return withFirestore(async options => {
        const one = await openFirestoreStore({ ...options, flushIntervalMs: 10 }); const two = await openFirestoreStore({ ...options, flushIntervalMs: 10 });
        const operator = await openAccessOperatorStore({ ...options, databaseId: '(default)' }); const db = new Firestore({ projectId: options.projectId, host: options.emulatorHost, ssl: false });
        const config = testConfig({ publicOrigin: 'http://localhost:8003' });
        const factories = [];
        try {
            await one.users.registerVerifiedSignIn({ googleId: 'admin', email: 'damian@axford.me.uk', emailVerified: true, displayName: 'admin' });
            const plan = await operator.previewMigration({ schemaVersion: 1 }); await operator.beginMigration({ expectedSchemaVersion: 0, planDigest: plan.digest, reviewedPlan: plan });
            for (const row of plan.users) await operator.applyUserMigration({ userId: row.userId, sourceRevision: row.sourceDigest, planDigest: plan.digest });
            const person = await one.users.findByGoogleId('admin'); let control = await one.access.getControl();
            await operator.grantSoleAdmin({ userId: person._id, googleId: 'admin', expectedControlRevision: control.revision });
            if (ready) { control = await one.access.getControl(); await operator.activate({ planDigest: plan.digest, expectedControlRevision: control.revision }); }
            for (const store of [one, two]) factories.push(await serve(t, createApp({ config, store, googleStrategyFactory: (opts, verify) => new GoogleFixture(opts, verify) })));
            const agent = async (name, instance = 0) => {
                const raw = factories[instance](); const login = await raw.login(name); assert.equal(login.status, 302, login.text);
                const token = (await raw.request('/api/session')).json().data.csrfToken;
                return { ...raw, request: (url, options = {}) => raw.request(url, options), mutate: (url, body = {}, method = 'POST', headers = {}) => raw.request(url, { method, headers: { Origin: config.publicOrigin, 'Content-Type': 'application/json', 'X-CSRF-Token': token, ...headers }, body: JSON.stringify(body) }), token, raw };
            };
            await run({ one, two, operator, db, agent, factories, plan, config, options });
        } finally { await one.close(); await two.close(); await operator.close(); await db.terminate(); }
    });
}
async function domain(admin, name = 'Fleet') { const result = await admin.mutate('/api/domains', { name }); assert.equal(result.status, 201, result.text); return result.json().data; }
async function current(admin, id) { const result = await admin.request('/api/domains/' + id); assert.equal(result.status, 200, result.text); return result.json().data; }
async function invite(admin, id, person, role) {
    const result = await admin.mutate(`/api/domains/${id}/invitations`, { email: person + '@example.test', role }); assert.equal(result.status, 201, result.text); return result.json().data;
}
async function join(admin, member, id, name, role) { const issued = await invite(admin, id, name, role); const token = new URL(issued.shareUrl).pathname.split('/').at(-1); const result = await member.mutate('/api/invite/' + token); assert.equal(result.status, 200, result.text); return { ...issued, token }; }
const assertSafe = response => { assert.ok(!/"(?:apiKey|inviteToken|tokenHash|googleId|stagingAccess|soleAdmin|domains)":/.test(response.text), response.text); };
test('verified Google claims, maintenance login, session epoch and safe self projection', t => fixture(t, async ({ agent, factories, one, db }) => {
    const anon = factories[0](); assert.equal((await anon.request('/api/user')).status, 401);
    for (const name of ['unverified', 'missing-claim']) assert.equal((await factories[0]().login(name)).status, 403);
    const admin = await agent('admin'); const outsider = await agent('outsider');
    const profile = await outsider.request('/api/user'); assert.equal(profile.status, 200); assertSafe(profile); assert.equal(profile.json().isPlatformAdmin, false);
    assert.deepEqual((await outsider.request('/api/domains')).json().data, []);
    assert.equal((await outsider.mutate('/api/domains', { name: 'Denied' })).status, 403);
    const person = await one.users.findByGoogleId('outsider'); await db.doc('users/' + person._id).update({ stagingAccess: false }); assert.equal((await outsider.request('/api/user')).status, 200);
    await db.doc('_platform/accessControl').update({ sessionEpoch: 2 }); assert.equal((await admin.request('/api/user')).status, 401);
}));
test('maintenance permits sign-in/self/CSRF but rejects domain access and machine ingress', t => fixture(t, async ({ agent, factories }) => {
    const outsider = await agent('outsider'); assert.equal((await outsider.request('/api/user')).status, 200);
    assert.equal((await outsider.request('/api/domains')).status, 503); assert.equal((await factories[0]().request('/addPacket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
}, { ready: false }));
test('Admin/Owner/Editor/Viewer/outsider matrix, safe projections, CSRF and retired destructive paths', t => fixture(t, async ({ agent, one, factories }) => {
    const admin = await agent('admin'); const owner = await agent('owner'); const editor = await agent('editor'); const viewer = await agent('viewer'); const outside = await agent('outside');
    const fleet = await domain(admin);
    for (const [member, name, role] of [[owner, 'owner', 'owner'], [editor, 'editor', 'editor'], [viewer, 'viewer', 'viewer']]) await join(admin, member, fleet._id, name, role);
    const path = '/api/domains/' + fleet._id;
    for (const member of [owner, editor, viewer]) { const result = await member.request(path); assert.equal(result.status, 200); assertSafe(result); assertSafe(await member.request('/api/domains')); assert.equal((await member.request(path + '/members')).status, 200); }
    for (const member of [outside, factories[0]()]) assert.equal((await member.request(path)).status, member === outside ? 403 : 401);
    for (const [member, allowed] of [[admin, true], [owner, true], [editor, true], [viewer, false], [outside, false]]) { const result = await member.request(path + '/key'); assert.equal(result.status, allowed ? 200 : 403); if (!allowed) assertSafe(result); }
    let row = await current(admin, fleet._id);
    assert.equal((await editor.mutate(path, { name: 'Editor rename', revision: row.revision }, 'PUT')).status, 200);
    row = await current(admin, fleet._id);
    for (const member of [viewer, outside]) assert.equal((await member.mutate(path, { name: 'Denied', revision: row.revision }, 'PUT')).status, 403);
    assert.equal((await editor.mutate(path + '/regenerate-key', { revision: row.revision })).status, 403);
    assert.equal((await viewer.mutate(path + '/archive', { revision: row.revision })).status, 403);
    assert.equal((await viewer.request(path + '/invitations')).status, 403);
    assert.equal((await admin.mutate(path, { name: 'Bad', revision: row.revision, isPlatformAdmin: true }, 'PUT')).status, 400);
    assert.equal((await owner.mutate(path, { revision: row.revision }, 'DELETE')).status, 405);
    assert.equal((await owner.mutate(path + '/regenerate-invite')).status, 410);
    for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { 'X-CSRF-Token': '' }]) assert.equal((await admin.mutate(path, { name: 'Forged', revision: row.revision }, 'PUT', headers)).status, 403);
    assert.equal((await admin.mutate(path, { name: 'Stale', revision: 1 }, 'PUT')).status, 409);
    assert.equal((await admin.mutate('/api/send')).status, 501);
    const ownerUser = await one.users.findByGoogleId('owner');
    row = await current(admin, fleet._id); assert.equal((await admin.mutate(path + '/leave', { revision: row.revision })).status, 200);
    // Admin remains unrestricted outside explicit membership.
    assert.equal((await admin.request(path + '/key')).status, 200);
    row = await current(owner, fleet._id); assert.equal((await owner.mutate(path + '/leave', { revision: row.revision })).status, 409);
    assert.equal((await viewer.mutate(path + '/members/' + ownerUser._id, { revision: row.revision, role: 'viewer' }, 'PATCH')).status, 403);
    assert.equal((await admin.mutate(path + '/members/' + ownerUser._id, { revision: row.revision, role: null }, 'PATCH')).status, 400);
    assert.equal((await one.domains.getById(fleet._id)).members[ownerUser._id], 'owner');
}));
test('targeted invite preview requires matching Google identity, consumes once, reissues and archive-invalidates', t => fixture(t, async ({ agent, factories }) => {
    const admin = await agent('admin'); const target = await agent('target'); const wrong = await agent('wrong'); const fleet = await domain(admin); const issued = await invite(admin, fleet._id, 'target', 'editor');
    const token = new URL(issued.shareUrl).pathname.split('/').at(-1); const path = '/api/invite/' + token;
    assert.equal((await factories[0]().request(path)).status, 401); const denial = await wrong.request(path); assert.equal(denial.status, 403); assert.ok(!denial.text.includes(fleet.name));
    assert.equal((await target.request(path)).json().data.role, 'editor'); assert.equal((await target.mutate(path)).status, 200); assert.equal((await target.mutate(path)).status, 409);
    const next = await invite(admin, fleet._id, 'later', 'viewer'); const management = `/api/domains/${fleet._id}/invitations/${next.invitation._id}`;
    const reissued = await admin.mutate(management + '/reissue', { role: 'owner', revision: next.invitation.revision }); assert.equal(reissued.status, 200); assert.notEqual(reissued.json().data.shareUrl, next.shareUrl);
    const later = await agent('later'); assert.equal((await later.mutate('/api/invite/' + new URL(next.shareUrl).pathname.split('/').at(-1))).status, 410);
    let row = await current(admin, fleet._id); assert.equal((await admin.mutate(`/api/domains/${fleet._id}/archive`, { revision: row.revision })).status, 200);
    row = await current(admin, fleet._id); assert.equal((await admin.mutate(`/api/domains/${fleet._id}/restore`, { revision: row.revision })).status, 200);
    assert.equal((await later.mutate('/api/invite/' + new URL(reissued.json().data.shareUrl).pathname.split('/').at(-1))).status, 410);
    await join(admin, later, fleet._id, 'later', 'viewer');
}));
test('archive retains packets and current key, blocks ingress/edits/live wait, and restore does not replay', t => fixture(t, async ({ agent, factories }) => {
    const admin = await agent('admin'); const viewer = await agent('viewer'); const fleet = await domain(admin); await join(admin, viewer, fleet._id, 'viewer', 'viewer'); const path = '/api/domains/' + fleet._id;
    const key = (await admin.request(path + '/key')).json().data.apiKey;
    const packet = { packet: 'AQIDBAU=', id: 1, node: 2, channel: 3, param: 4, msgType: 5, domain: fleet._id, apiKey: key };
    const ingress = body => factories[1]().request('/addPacket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await ingress(packet)).status, 202);
    await new Promise(resolve => setTimeout(resolve, 40));
    let row = await current(admin, fleet._id); await admin.mutate(path + '/archive', { revision: row.revision });
    assert.equal((await ingress(packet)).status, 409); assert.equal((await viewer.request(path + '/stream?timeout=20')).status, 409);
    assert.equal((await viewer.request(path + '/messages')).json().data.length, 1); assert.equal((await viewer.request(path + '/key')).status, 403);
    assert.equal((await admin.request('/api/domains')).json().data.length, 0); assert.equal((await admin.request('/api/domains?status=archived')).json().data.length, 1);
    row = await current(admin, fleet._id); await admin.mutate(path + '/restore', { revision: row.revision });
    assert.equal((await admin.request(path + '/key')).json().data.apiKey, key); assert.equal((await admin.request(path + '/packet-count')).json().data.retainedPacketCount, 1);
    row = await current(admin, fleet._id); const rotated = await admin.mutate(path + '/regenerate-key', { revision: row.revision }); assert.equal(rotated.status, 200);
    assert.equal((await ingress(packet)).status, 401); assert.equal((await ingress({ ...packet, apiKey: rotated.json().data.apiKey })).status, 202);
}));
test('two instances recheck delayed history/key/stream for demotion, removal, logout and expiry', t => fixture(t, async ({ agent, one, two, db }) => {
    const admin = await agent('admin'); const member = await agent('member', 1); const fleet = await domain(admin); await join(admin, member, fleet._id, 'member', 'editor'); const path = '/api/domains/' + fleet._id;
    const person = await one.users.findByGoogleId('member');
    const delayed = member.request(path + '/stream?timeout=100'); await new Promise(resolve => setTimeout(resolve, 25));
    let row = await current(admin, fleet._id); await admin.mutate(path + '/members/' + person._id, { role: 'viewer', revision: row.revision }, 'PATCH');
    assert.equal((await delayed).status, 200); assert.equal((await member.request(path + '/key')).status, 403);
    const originalRead = two.packets.readPage; let release; let reached;
    const waiting = new Promise(resolve => { reached = resolve; }); const gate = new Promise(resolve => { release = resolve; });
    two.packets.readPage = async options => { const result = await originalRead(options); reached(); await gate; return result; };
    const history = member.request(path + '/messages'); await waiting;
    row = await current(admin, fleet._id); await admin.mutate(path + '/members/' + person._id, { revision: row.revision }, 'DELETE'); release(); assert.equal((await history).status, 403); two.packets.readPage = originalRead;
    await join(admin, member, fleet._id, 'member', 'viewer');
    const logoutWait = member.request(path + '/stream?timeout=150'); await new Promise(resolve => setTimeout(resolve, 30)); await member.mutate('/auth/logout'); assert.equal((await logoutWait).status, 401);
    const expiring = await agent('member', 1); const expiryWait = expiring.request(path + '/stream?timeout=150'); await new Promise(resolve => setTimeout(resolve, 30));
    const session = (await db.collection('sessions').get()).docs.find(doc => !doc.data().revoked && doc.data().data.passport?.user?.userId === person._id);
    await session.ref.update({ expiresAt: new Date(Date.now() - 1) }); assert.equal((await expiryWait).status, 401);
}));
test('pre-archive admitted ingress may finish late, while later gates reject and stored history remains readable', t => fixture(t, async ({ agent, one, factories }) => {
    const admin = await agent('admin'); const fleet = await domain(admin); const path = '/api/domains/' + fleet._id;
    const key = (await admin.request(path + '/key')).json().data.apiKey;
    let reached; let release; const atGate = new Promise(resolve => { reached = resolve; }); const pause = new Promise(resolve => { release = resolve; });
    const enqueue = one.packets.enqueue; one.packets.enqueue = async data => { reached(); await pause; return enqueue(data); };
    const received = factories[0]().request('/addPacket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packet: 'AQIDBAU=', id: 1, node: 2, channel: 3, param: 4, msgType: 5, domain: fleet._id, apiKey: key }) });
    await atGate; const row = await current(admin, fleet._id); await admin.mutate(path + '/archive', { revision: row.revision }); release();
    assert.equal((await received).status, 202); one.packets.enqueue = enqueue;
    await new Promise(resolve => setTimeout(resolve, 40)); assert.equal((await admin.request(path + '/messages')).json().data.length, 1);
}));
test('unknown access schemas fail before listening; old session shapes and key-only administration fail closed', t => fixture(t, async ({ agent, one, db, config, factories, options }) => {
    const admin = await agent('admin'); const fleet = await domain(admin); const key = (await admin.request(`/api/domains/${fleet._id}/key`)).json().data.apiKey;
    const machine = await factories[0]().request(`/api/domains/${fleet._id}/members`, { headers: { Authorization: 'Bearer ' + key } }); assert.equal(machine.status, 401); assertSafe(machine);
    const sessions = (await db.collection('sessions').get()).docs.filter(doc => !doc.data().revoked && doc.data().data.passport?.user?.googleId === 'admin');
    const oldData = sessions[0].data().data; oldData.passport.user = (await one.users.findByGoogleId('admin'))._id; await sessions[0].ref.update({ data: oldData });
    assert.equal((await admin.request('/api/user')).status, 401);
    await db.doc('_platform/accessControl').update({ schemaVersion: 99 });
    const { startHosted } = require('../../index'); let constructed = false;
    await assert.rejects(startHosted({ config: { ...config, ...options, databaseId: '(default)' }, appFactory: () => { constructed = true; return createApp({ config, store: one }); } }), { code: 'unavailable' });
    assert.equal(constructed, false);
}));

test('delayed domain list observes epoch revocation; open stream observes archive and query failure leaks no secrets', t => fixture(t, async ({ agent, one, two, db }) => {
    const admin = await agent('admin', 1); const fleet = await domain(admin); const path = '/api/domains/' + fleet._id;
    const read = two.domains.getAccessContext; let release; let reached; const gate = new Promise(resolve => { release = resolve; }); const waiting = new Promise(resolve => { reached = resolve; });
    two.domains.getAccessContext = async (...args) => { const result = await read(...args); reached(); await gate; return result; };
    const response = admin.request('/api/domains'); await waiting;
    await db.doc('_platform/accessControl').update({ sessionEpoch: 2 }); release(); assert.equal((await response).status, 401); two.domains.getAccessContext = read;
    const fresh = await agent('admin'); const stream = fresh.request(path + '/stream?timeout=120'); await new Promise(resolve => setTimeout(resolve, 25));
    const row = await current(fresh, fleet._id); await fresh.mutate(path + '/archive', { revision: row.revision }); assert.equal((await stream).status, 409);
    const original = one.packets.readPage; one.packets.readPage = async () => { throw Object.assign(new Error('private database secret'), { code: 'unavailable' }); };
    const failure = await fresh.request(path + '/messages'); assert.equal(failure.status, 503); assert.ok(!failure.text.includes('private database secret')); one.packets.readPage = original;
    assert.equal((await fresh.request('/auth/logout')).status, 405); assert.equal((await fresh.request('/api/user')).status, 200);
    assert.equal((await fresh.request('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
}));
test('real pinned OAuth strategy validates state and preserves only a bounded invitation return path', t => fixture(t, async ({ one, config }) => {
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    const factory = (options, verify) => {
        const strategy = new GoogleStrategy(options, verify);
        strategy._oauth2.getOAuthAccessToken = (code, params, done) => done(null, 'fixture-access', 'fixture-refresh', {});
        strategy._oauth2.get = (url, token, done) => done(null, JSON.stringify({ sub: 'oauth-user', name: 'OAuth User', email: 'oauth-user@example.test', email_verified: true }));
        return strategy;
    };
    const agents = await serve(t, createApp({ config, store: one, googleStrategyFactory: factory }));
    const raw = agents(); const invitation = '/invite/' + 'A'.repeat(20) + '.' + 'B'.repeat(43);
    assert.equal((await raw.request('/auth/google?returnTo=' + encodeURIComponent('https://evil.example'))).status, 400);
    const start = await raw.request('/auth/google?returnTo=' + encodeURIComponent(invitation));
    const state = new URL(start.headers.get('location')).searchParams.get('state'); assert.ok(state);
    const invalid = await raw.request('/auth/google/callback?code=fixture&state=wrong'); assert.equal(invalid.headers.get('location'), '/public');
    const again = await raw.request('/auth/google?returnTo=' + encodeURIComponent(invitation)); const next = new URL(again.headers.get('location')).searchParams.get('state');
    const callback = await raw.request('/auth/google/callback?code=fixture&state=' + encodeURIComponent(next)); assert.equal(callback.headers.get('location'), invitation);
    assert.equal((await raw.request('/api/user')).json().email, 'oauth-user@example.test');
    assert.equal((await raw.request('/auth/google/callback?code=fixture&state=' + encodeURIComponent(next))).headers.get('location'), '/public');
}));
