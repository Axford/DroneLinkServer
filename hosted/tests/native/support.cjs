'use strict';
const assert = require('node:assert/strict');
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
async function fixture(t, run, { ready = true, observations = false } = {}) {
    return withFirestore(async options => {
        const one = await openFirestoreStore({ ...options, flushIntervalMs: 10, ...(observations ? { observationEpoch: 'm1-c-1', observationFlushIntervalMs: 20 } : {}) }); const two = await openFirestoreStore({ ...options, flushIntervalMs: 10, ...(observations ? { observationEpoch: 'm1-c-1', observationFlushIntervalMs: 20 } : {}) });
        const operator = await openAccessOperatorStore({ ...options, databaseId: '(default)' }); const db = new Firestore({ projectId: options.projectId, host: options.emulatorHost, ssl: false });
        const config = testConfig({ publicOrigin: 'http://localhost:8003', ...(observations ? { observationEpoch: 'm1-c-1' } : {}) });
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

module.exports = { fixture, domain, current, invite, join, assertSafe };
