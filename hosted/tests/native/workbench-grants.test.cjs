'use strict';
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const { createAccessPolicy, fault } = require('../../lib/accessPolicy');
const { mountWorkbenchRoutes } = require('../../lib/workbenchRoutes');
const { errorHandler } = require('../../middleware/errorHandler');

// Exercise the hosted HTTP grant and real role policy with disposable session/storage fixtures.
test('Workbench grants bind an existing human session, Domain and current gateway credential', async t => {
    const user = { _id: 'user', googleId: 'google', emailCanonical: 'editor@example.test', emailVerified: true };
    const evidence = { userId: user._id, googleId: user.googleId, emailCanonical: user.emailCanonical, emailVerified: true, sessionEpoch: 7 };
    const control = { state: 'ready', sessionEpoch: 7 };
    let role = 'editor';
    let revoked = false;
    let signedIn = true;
    const store = {
        sessions: { get: async id => id === 'private-session' && signedIn ? { data: { passport: { user: evidence } } } : null },
        access: { getControl: async () => control },
        users: { getById: async () => user },
        domains: { getAccessContext: async id => ({ user, control, domain: ['domain', 'other'].includes(id) ? { status: 'active' } : null, role }) },
        telemetry: { verifyGateway: async ({ domainId, forwarderAddress, credential }) => {
            if (revoked || domainId !== 'domain' || forwarderAddress !== 254 || credential.id !== 'gateway') throw fault('forbidden');
        } },
    };
    const app = express();
    const policy = createAccessPolicy(store);
    app.use((req, _res, next) => { req.sessionID = 'private-session'; next(); });
    mountWorkbenchRoutes(app, { config: { cookieKey: 'private test key' }, store, policy, ready: (_req, _res, next) => next(),
        ensureAuthenticated: (_req, _res, next) => next() });
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => { server.close(); server.closeAllConnections(); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body, authorization) => fetch(origin + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body),
    });
    const issue = await post('/api/domains/domain/workbench-grant', { gatewayId: 'gateway' });
    assert.equal(issue.status, 200);
    const { grant } = (await issue.json()).data;
    assert.ok(!Buffer.from(grant, 'base64url').includes(Buffer.from('private-session')));
    const machine = `Bearer gateway.${'a'.repeat(43)}`;
    const authorize = (body = {}, header = machine) => post('/gateway/workbench/authorize', { domain: 'domain', id: 254, grant, action: 'observe', ...body }, header);
    assert.equal((await authorize()).status, 200);
    assert.equal((await authorize({ action: 'query-value' })).status, 200);
    assert.equal((await authorize({ domain: 'other' })).status, 401);
    assert.equal((await authorize({ id: 253 })).status, 401);
    assert.equal((await authorize({}, `Bearer other.${'a'.repeat(43)}`)).status, 401);
    assert.equal((await authorize({ grant: 'x'.repeat(64) })).status, 401);
    assert.equal((await authorize({ apiKey: 'domain-key' }, '')).status, 401);
    role = 'viewer';
    assert.equal((await (await authorize()).json()).data.canQuery, false);
    assert.equal((await authorize({ action: 'query-value' })).status, 403);
    role = null;
    assert.equal((await authorize()).status, 403);
    role = 'editor';
    signedIn = false;
    assert.equal((await authorize()).status, 401);
    signedIn = true;
    revoked = true;
    assert.equal((await authorize()).status, 401);
});
