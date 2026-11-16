'use strict';

const { createHash } = require('node:crypto');
const { fault } = require('./accessPolicy');
const { asyncHandler } = require('../middleware/errorHandler');
const { exact, integer } = require('./commandPayload');

const domainId = value => {
    if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 200 ||
        /[/\u0000-\u001f]/.test(value) || value === '.' || value === '..' || /^__.*__$/.test(value)) throw fault('validation');
    return value;
};
const hex = (value, bytes) => {
    if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[a-f0-9]+$/.test(value)) throw fault('validation');
    return value;
};
function nodeBearer(req) {
    const authorization = req.get('Authorization');
    if (authorization === undefined) return null;
    if (req.get('Cookie') !== undefined) throw fault('unauthenticated');
    const match = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(authorization);
    if (!match) throw fault('unauthenticated');
    return { kind: 'node', id: match[1], secretHash: createHash('sha256').update(match[2]).digest('hex') };
}
function mountNodeMachines(app, { store, parse, nodeRecoveryAllowed }) {
    if (!store.nodeIdentity) return;
    const rules = {
        enroll: { claim: 32, publicKey: 64 },
        challenge: { enrollmentId: 16 },
        renew: { enrollmentId: 16, nonce: 32, signature: 64 }
    };
    for (const [action, fields] of Object.entries(rules)) {
        app.post('/node-auth/' + action, parse(2048), asyncHandler(async (req, res) => {
            res.set('Cache-Control', 'private, no-store');
            if (req.get('Cookie') !== undefined || req.get('Authorization') !== undefined) throw fault('unauthenticated');
            exact(req.body, ['domain', 'id', ...Object.keys(fields)]);
            const input = { domainId: domainId(req.body.domain), nodeAddress: integer(req.body.id, 1, 254) };
            if (!nodeRecoveryAllowed(input.domainId)) throw fault('not-found');
            for (const [key, bytes] of Object.entries(fields)) input[key] = hex(req.body[key], bytes);
            try { res.json({ success: true, data: await store.nodeIdentity[action](input) }); }
            catch (error) { if (error.code === 'forbidden') throw fault('unauthenticated'); throw error; }
        }));
    }
}
function mountNodeOperators(app, { store, parse, nodeRecoveryAllowed, ensureAuthenticated, policy }) {
    if (!store.nodeIdentity) return;
    const root = '/api/domains/:id/node-credentials/:address';
    function route(method, path, fields, action) {
        app[method](root + path, ensureAuthenticated, ...(method === 'post' ? [parse(1024)] : []), asyncHandler(async (req, res) => {
            if (!nodeRecoveryAllowed(req.params.id)) throw fault('not-found');
            const expectedUser = req.get('X-Command-User');
            if (expectedUser !== undefined && expectedUser !== req.current.user._id) throw fault('unauthenticated');
            const current = await policy.domain(req, ['owner'], true);
            if (expectedUser !== undefined && expectedUser !== current.actor.userId) throw fault('unauthenticated');
            if (!/^[1-9][0-9]{0,2}$/.test(req.params.address)) throw fault('validation');
            const input = { domainId: domainId(req.params.id), nodeAddress: integer(Number(req.params.address), 1, 254) };
            if (method === 'post') exact(req.body, Object.keys(fields));
            for (const [key, bytes] of Object.entries(fields)) input[key] = hex(req.body[key], bytes);
            res.json({ success: true, data: await store.nodeIdentity[action](current.actor, input) });
        }));
    }
    route('get', '', {}, 'get');
    route('post', '/claim', {}, 'claim');
    route('post', '/revoke', { enrollmentId: 16 }, 'revoke');
}
module.exports = { domainId, hex, nodeBearer, mountNodeMachines, mountNodeOperators };
