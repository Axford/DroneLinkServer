'use strict';
const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const { fault } = require('./accessPolicy');
function mountAccessRoutes(app, { store, policy, ensureAuthenticated, config }) {
    const { domains, invitations, packets, users } = store;
    const wrap = run => [ensureAuthenticated, asyncHandler(run)];
    const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
    const body = (req, allowed, required = allowed) => {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(req.body, key))) throw fault('validation');
        if (allowed.includes('revision') && (!Number.isSafeInteger(req.body.revision) || req.body.revision < 1)) throw fault('validation');
        return req.body;
    };
    const paging = (req, defaultLimit = 20, extra = []) => {
        if (Object.keys(req.query).some(key => !['limit', 'cursor', ...extra].includes(key))) throw fault('validation');
        const limit = req.query.limit === undefined ? defaultLimit : Number(req.query.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || req.query.cursor !== undefined && typeof req.query.cursor !== 'string') throw fault('validation');
        return { limit, ...(req.query.cursor ? { cursor: req.query.cursor } : {}) };
    };
    const page = (res, result, limit) => res.json({ success: true, data: result.items, pagination: { nextCursor: result.nextCursor, limit } });
    async function detail(domain, current) {
        const creator = await users.getById(domain.createdBy);
        return { ...policy.summary(domain, current), createdBy: creator ? { _id: creator._id, displayName: creator.displayName, email: creator.email, ...(creator.profilePicture ? { profilePicture: creator.profilePicture } : {}) } : null };
    }
    const proof = token => {
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,200}\.[A-Za-z0-9_-]{43}$/.test(token)) throw fault('invite-unavailable');
        const [invitationId, secret] = token.split('.'); return { invitationId, tokenHash: crypto.createHash('sha256').update(secret).digest('hex') };
    };
    const secret = () => { const token = crypto.randomBytes(32).toString('base64url'); return { token, tokenHash: crypto.createHash('sha256').update(token).digest('hex') }; };
    const invitationResult = (invitation, token) => ({ invitation, shareUrl: new URL('/invite/' + invitation._id + '.' + token, config.publicOrigin).href });
    app.get('/api/user', ...wrap(async (req, res) => res.json(policy.self(await policy.identity(req)))));
    app.get('/api/session', ...wrap(async (req, res) => ok(res, { csrfToken: policy.csrf(req) })));
    app.put('/api/user/map-state', ...wrap(async (req, res) => {
        const state = body(req, ['lng', 'lat', 'zoom']);
        if (!Object.values(state).every(Number.isFinite) || state.lng < -180 || state.lng > 180 || state.lat < -90 || state.lat > 90 || state.zoom < 0 || state.zoom > 24) throw fault('validation');
        await users.updateMapState(req.current.user._id, state); res.json({ success: true, message: 'Map state updated successfully' });
    }));
    app.get('/api/config', ...wrap(async (req, res) => ok(res, { mapboxAccessToken: config.mapboxAccessToken || null })));
    app.get('/api/domains', ...wrap(async (req, res) => {
        const options = paging(req, 10, ['status']); const current = await policy.identity(req);
        const result = await domains.listForActor(policy.actor(current), { ...options, status: req.query.status });
        const items = [];
        for (const item of result.items) { const context = await policy.domain(req, undefined, false, item._id); items.push(policy.summary(context.domain, context)); }
        await policy.identity(req);
        page(res, { ...result, items }, options.limit);
    }));
    app.post('/api/domains', ...wrap(async (req, res) => {
        const value = body(req, ['name']); const current = await policy.identity(req); const domain = await domains.createOwned(policy.actor(current), value);
        ok(res, await detail(domain, current), 201);
    }));
    app.get('/api/domains/:id', ...wrap(async (req, res) => {
        let current = await policy.domain(req); const payload = await detail(current.domain, current); current = await policy.domain(req);
        ok(res, { ...payload, ...policy.summary(current.domain, current) });
    }));
    app.put('/api/domains/:id', ...wrap(async (req, res) => {
        const value = body(req, ['name', 'revision']); const current = await policy.domain(req, ['owner', 'editor'], true);
        const domain = await domains.renameAuthorized(current.actor, { ...value, domainId: req.params.id }); ok(res, policy.summary(domain, current));
    }));
    app.delete('/api/domains/:id', ...wrap(async () => { throw fault('method-not-allowed'); }));
    app.post('/api/domains/:id/regenerate-invite', ...wrap(async () => { throw fault('invite-retired'); }));
    app.get('/api/domains/:id/members', ...wrap(async (req, res) => {
        const options = paging(req); let current = await policy.domain(req); const result = await domains.listMembers(current.actor, { ...options, domainId: req.params.id });
        current = await policy.domain(req); page(res, result, options.limit);
    }));
    const memberChange = method => app[method]('/api/domains/:id/members/:userId', ...wrap(async (req, res) => {
        const value = body(req, method === 'patch' ? ['role', 'revision'] : ['revision']);
        if (method === 'patch' && !['owner', 'editor', 'viewer'].includes(value.role)) throw fault('validation');
        const current = await policy.domain(req, ['owner'], true);
        const domain = await domains.changeMember(current.actor, { ...value, role: method === 'patch' ? value.role : null, domainId: req.params.id, userId: req.params.userId });
        ok(res, { domainId: domain._id, revision: domain.revision });
    }));
    memberChange('patch'); memberChange('delete');
    app.post('/api/domains/:id/leave', ...wrap(async (req, res) => { const value = body(req, ['revision']); const current = await policy.domain(req, undefined, true); const domain = await domains.leave(current.actor, { ...value, domainId: req.params.id }); ok(res, { domainId: domain._id, revision: domain.revision }); }));
    app.get('/api/domains/:id/key', ...wrap(async (req, res) => { const current = await policy.domain(req, ['owner', 'editor']); ok(res, { apiKey: current.domain.apiKey, revision: current.domain.revision }); }));
    app.post('/api/domains/:id/regenerate-key', ...wrap(async (req, res) => {
        const value = body(req, ['revision']); const current = await policy.domain(req, ['owner'], true); const domain = await domains.rotateKey(current.actor, { ...value, domainId: req.params.id, newKey: crypto.randomBytes(32).toString('hex') });
        const refreshed = await policy.domain(req, ['owner']); ok(res, { apiKey: refreshed.domain.apiKey, revision: domain.revision });
    }));
    for (const action of ['archive', 'restore']) app.post('/api/domains/:id/' + action, ...wrap(async (req, res) => {
        const value = body(req, ['revision']); const current = await policy.domain(req, ['owner']); const domain = await domains[action](current.actor, { ...value, domainId: req.params.id }); ok(res, policy.summary(domain, current));
    }));
    app.get('/api/domains/:id/invitations', ...wrap(async (req, res) => { const options = paging(req); const current = await policy.domain(req, ['owner']); const result = await invitations.list(current.actor, { ...options, domainId: req.params.id }); await policy.domain(req, ['owner']); page(res, result, options.limit); }));
    app.post('/api/domains/:id/invitations', ...wrap(async (req, res) => {
        const value = body(req, ['email', 'role']); const current = await policy.domain(req, ['owner'], true); const generated = secret();
        const invitation = await invitations.issue(current.actor, { domainId: req.params.id, emailCanonical: value.email, role: value.role, tokenHash: generated.tokenHash });
        await policy.domain(req, ['owner']); ok(res, invitationResult(invitation, generated.token), 201);
    }));
    app.post('/api/domains/:id/invitations/:invitationId/reissue', ...wrap(async (req, res) => {
        const value = body(req, ['role', 'revision']); const current = await policy.domain(req, ['owner'], true); const generated = secret();
        const invitation = await invitations.reissue(current.actor, { ...value, domainId: req.params.id, invitationId: req.params.invitationId, tokenHash: generated.tokenHash });
        await policy.domain(req, ['owner']); ok(res, invitationResult(invitation, generated.token));
    }));
    app.delete('/api/domains/:id/invitations/:invitationId', ...wrap(async (req, res) => {
        const value = body(req, ['revision']); const current = await policy.domain(req, ['owner'], true); const invitation = await invitations.revoke(current.actor, { ...value, domainId: req.params.id, invitationId: req.params.invitationId }); ok(res, invitation);
    }));
    const inviteLimit = rateLimit({ windowMs: 60000, limit: 60, max: 60, standardHeaders: true, legacyHeaders: false, message: { success: false, code: 'rate-limit', message: 'Try again later' } });
    app.use('/api/invite', inviteLimit);
    app.get('/api/invite/:token', ...wrap(async (req, res) => ok(res, await invitations.inspect(proof(req.params.token), policy.actor(await policy.identity(req))))));
    app.post('/api/invite/:token', ...wrap(async (req, res) => { body(req, [], []); ok(res, await invitations.accept(policy.actor(await policy.identity(req)), proof(req.params.token))); }));
    const packetJSON = message => ({ ...message, packet: Buffer.isBuffer(message.packet) ? message.packet.toString('base64') : message.packet });
    const packetOptions = req => ({ domainId: req.params.id, ...(req.query.cursor ? { cursor: req.query.cursor } : {}), ...(req.query.from || req.query.since ? { from: new Date(req.query.from || req.query.since) } : {}), ...(req.query.until ? { until: new Date(req.query.until) } : {}), limit: req.query.limit === undefined ? 1000 : Number(req.query.limit) });
    app.get('/api/domains/:id/messages', ...wrap(async (req, res) => { await policy.domain(req); const result = await packets.readPage(packetOptions(req)); await policy.domain(req); res.json({ success: true, data: result.items.map(packetJSON), count: result.items.length, cursor: result.cursor, nextCursor: result.nextCursor, from: result.from, until: result.until }); }));
    app.get('/api/domains/:id/packet-count', ...wrap(async (req, res) => { await policy.domain(req); const retainedPacketCount = await packets.countRetained(req.params.id); await policy.domain(req); ok(res, { retainedPacketCount }); }));
    app.get('/api/domains/:id/stream', ...wrap(async (req, res) => {
        await policy.domain(req, undefined, true); const controller = new AbortController(); const cancel = () => controller.abort(); res.once('close', cancel);
        try {
            const result = await packets.waitForPage({ ...packetOptions(req), timeoutMs: req.query.timeout === undefined ? 30000 : Number(req.query.timeout), signal: controller.signal });
            if (res.destroyed) return; await policy.domain(req, undefined, true);
            res.json({ success: true, type: result.items.length ? 'messages' : 'timeout', data: result.items.map(packetJSON), count: result.items.length, cursor: result.cursor, nextCursor: result.nextCursor });
        } catch (error) { if (!controller.signal.aborted) throw error; } finally { controller.abort(); res.off('close', cancel); }
    }));
    app.post('/api/send', ...wrap(async () => { throw fault('command-unavailable'); }));
}
module.exports = { mountAccessRoutes };
