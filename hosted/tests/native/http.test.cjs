'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Firestore } = require('@google-cloud/firestore');
const { openFirestoreStore } = require('@dronelink/persistence');
const { withFirestore } = require('../../tools/firestore.cjs');
const { createApp } = require('../../app');
const { TestGoogleStrategy, serve, testConfig } = require('../application/support.cjs');

test('native HTTP composition shares fixed sessions, enforces admission and streams persisted packets', async t => withFirestore(async options => {
    const one = await openFirestoreStore({ ...options, flushIntervalMs: 25 });
    const two = await openFirestoreStore({ ...options, flushIntervalMs: 25 });
    const admin = new Firestore({ projectId: options.projectId, host: options.emulatorHost, ssl: false });
    const config = testConfig({ publicOrigin: 'http://localhost:8003' });
    const app = store => createApp({ config, store, googleStrategyFactory: (opts, verify) => new TestGoogleStrategy(opts, verify) });
    const agent = (await serve(t, app(one)))();
    const secondAgent = (await serve(t, app(two)))();
    try {
        assert.equal((await agent.request('/api/user')).status, 401);
        assert.equal(agent.cookie, '');
        assert.equal((await agent.login()).headers.get('location'), '/access-pending');
        assert.equal((await agent.request('/api/domains')).status, 403);
        const user = await one.users.findByGoogleId('member-google');
        await admin.doc('users/' + user._id).update({ stagingAccess: true });
        await agent.request('/auth/logout');
        const signed = await agent.login();
        assert.equal(signed.headers.get('location'), '/profile');
        assert.match(signed.headers.get('set-cookie'), /__session=.*HttpOnly; SameSite=Lax/);
        const cookie = agent.cookie;
        const cross = await secondAgent.request('/api/user', { headers: { Cookie: cookie } });
        assert.equal(cross.status, 200);
        assert.equal(cross.headers.get('cache-control'), 'private, no-store');
        const sessionsBefore = (await admin.collection('sessions').get()).docs.filter(d => d.data().data.passport);
        const active = sessionsBefore.find(d => !d.data().revoked);
        const fixedExpiry = active.data().expiresAt.toMillis();
        await agent.request('/api/user');
        assert.equal((await active.ref.get()).data().expiresAt.toMillis(), fixedExpiry);
        const created = await agent.request('/api/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Fleet' }) });
        assert.equal(created.status, 201, created.text);
        const domain = created.json().data;
        assert.deepEqual((await one.users.getById(user._id)).domains, [domain._id]);
        assert.equal((await agent.request('/api/domains?page=1')).status, 400);
        const page = (await agent.request('/api/domains?limit=1')).json();
        assert.equal(page.data[0]._id, domain._id);
        const pending = agent.request(`/api/domains/${domain._id}/stream?timeout=1000`);
        const received = await secondAgent.request('/addPacket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packet: 'AQIDBAU=', id: 1, node: 2, channel: 3, param: 4, msgType: 5, domain: domain._id, apiKey: domain.apiKey }) });
        assert.equal(received.status, 202, received.text);
        assert.equal(received.headers.get('set-cookie'), null);
        const live = (await pending).json(); assert.equal(live.data.length, 1); assert.equal(live.data[0].packet, 'AQIDBAU=');
        const history = (await agent.request(`/api/domains/${domain._id}/messages?limit=1`)).json();
        assert.equal(history.data.length, 1); assert.ok(history.cursor);
        assert.equal((await agent.request(`/api/domains/${domain._id}/packet-count`)).json().data.retainedPacketCount, 1);
        const delayed = agent.request(`/api/domains/${domain._id}/stream?cursor=${encodeURIComponent(live.cursor)}&timeout=100`);
        await admin.doc('users/' + user._id).update({ stagingAccess: false });
        assert.equal((await delayed).status, 403);
        assert.equal((await agent.request('/api/user')).status, 403);
        await admin.doc('users/' + user._id).update({ stagingAccess: true });
        const logoutWait = secondAgent.request(`/api/domains/${domain._id}/stream?cursor=${encodeURIComponent(live.cursor)}&timeout=100`, { headers: { Cookie: cookie } });
        await agent.request('/auth/logout');
        assert.equal((await logoutWait).status, 401);
        assert.equal((await secondAgent.request('/api/user', { headers: { Cookie: cookie } })).status, 401);
        assert.equal((await agent.request('/api/send', { method: 'POST' })).status, 401);
        await agent.login();
        const expireWait = agent.request(`/api/domains/${domain._id}/stream?cursor=${encodeURIComponent(live.cursor)}&timeout=100`);
        const currentSession = (await admin.collection('sessions').get()).docs.find(doc => !doc.data().revoked && doc.data().data.passport?.user === user._id);
        await currentSession.ref.update({ expiresAt: new Date(Date.now() - 1) });
        assert.equal((await expireWait).status, 401);
    } finally { await one.close(); await two.close(); await admin.terminate(); }
}));

test('native HTTP management keeps membership atomic and old credentials cannot access deleted domains', async t => withFirestore(async options => {
    const store = await openFirestoreStore({ ...options, flushIntervalMs: 10 });
    const admin = new Firestore({ projectId: options.projectId, host: options.emulatorHost, ssl: false });
    const config = testConfig({ publicOrigin: 'http://localhost:8003' });
    const agents = await serve(t, createApp({ config, store, googleStrategyFactory: (opts, verify) => new TestGoogleStrategy(opts, verify) }));
    const member = agents(), outsider = agents();
    const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
        for (const [agent, name] of [[member, 'member'], [outsider, 'outsider']]) {
            await agent.login(name);
            const user = await store.users.findByGoogleId(name + '-google');
            await admin.doc('users/' + user._id).update({ stagingAccess: true });
            await agent.request('/auth/logout'); await agent.login(name);
        }
        const created = await member.request('/api/domains', json({ name: 'Managed' })); assert.equal(created.status, 201);
        const domain = created.json().data;
        assert.equal((await outsider.request(`/api/domains/${domain._id}`)).status, 403);
        const preview = await agents().request('/api/invite/' + domain.inviteToken);
        assert.equal(preview.json().data.domainName, 'Managed');
        const rotated = (await member.request(`/api/domains/${domain._id}/regenerate-invite`, { method: 'POST' })).json().data;
        assert.equal((await outsider.request('/api/invite/' + domain.inviteToken, { method: 'POST' })).status, 404);
        assert.equal((await outsider.request('/api/invite/' + rotated.inviteToken, { method: 'POST' })).status, 200);
        const outsideUser = await store.users.findByGoogleId('outsider-google');
        assert.deepEqual(outsideUser.domains, [domain._id]);
        const key = (await member.request(`/api/domains/${domain._id}/regenerate-key`, { method: 'POST' })).json().data.apiKey;
        const packet = { packet: 'AQIDBAU=', id: 1, node: 2, channel: 3, param: 4, msgType: 5, domain: domain._id, apiKey: domain.apiKey };
        assert.equal((await agents().request('/addPacket', json(packet))).status, 401);
        assert.equal((await agents().request('/addPacket', json({ ...packet, apiKey: key }))).status, 202);
        const renamed = await member.request(`/api/domains/${domain._id}`, { ...json({ name: 'Renamed' }), method: 'PUT' });
        assert.equal(renamed.json().data.name, 'Renamed');
        assert.equal((await member.request('/api/send', json({ addr: [1], msgType: 0, values: [1] }))).status, 501);
        await new Promise(resolve => setTimeout(resolve, 40));
        assert.equal((await member.request(`/api/domains/${domain._id}`, { method: 'DELETE' })).status, 200);
        assert.deepEqual((await store.users.getById(outsideUser._id)).domains, []);
        assert.equal((await agents().request('/addPacket', json({ ...packet, apiKey: key }))).status, 404);
        assert.equal((await outsider.request(`/api/domains/${domain._id}/messages`)).status, 404);
        assert.equal(await store.packets.countRetained(domain._id), 1);
    } finally { await store.close(); await admin.terminate(); }
}));
