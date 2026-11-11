'use strict';

const express = require('express');
const { randomBytes } = require('node:crypto');
const { fault } = require('./accessPolicy');
const { asyncHandler, sendErrorResponse } = require('../middleware/errorHandler');
const { exact, integer, opaque, submission, requested, packet } = require('./commandPayload');

const editors = ['owner', 'editor'];
const noStore = (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };

// JSON.parse keeps the last value for repeated keys. Check the bounded wire
// representation before materializing it so no duplicate can change intent.
function uniqueMembers(req, res, raw) {
    const tokens = raw.toString('utf8').match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:]/g) || [];
    const scopes = [];
    for (const [i, token] of tokens.entries()) {
        if (token === '{') scopes.push(new Set());
        else if (token === '[') scopes.push(null);
        else if (token === '}' || token === ']') scopes.pop();
        else if (token[0] === '"' && tokens[i + 1] === ':') {
            const keys = scopes.at(-1);
            const key = JSON.parse(token);
            if (keys?.has(key)) throw fault('validation');
            keys?.add(key);
        }
    }
}
function body(limit) {
    const parse = express.json({ limit, inflate: false, verify: uniqueMembers });
    return (req, res, next) => {
        if (!req.is('application/json')) return next(fault('validation'));
        return parse(req, res, error => next(error?.type ? fault('validation') : error));
    };
}
function project(row) {
    const { id, domainId, target, operation, transport, priority, submittedBy, acceptedAt, expiresAt, state, terminalAt, reason, cancelledBy } = row;
    const attribution = value => value ? { userId: value.userId, displayName: value.displayName } : null;
    return { id, domainId, target: { nodeAddress: target.nodeAddress, channel: target.channel, param: target.param }, operation,
        requested: requested(row), transport, priority, submittedBy: attribution(submittedBy),
        acceptedAt, expiresAt, state, terminalAt, reason, cancelledBy: attribution(cancelledBy) };
}
function listInput(query) {
    const ranges = { nodeAddress: 254, channel: 254, param: 63, limit: 100 };
    const result = {};
    for (const [field, value] of Object.entries(query)) {
        if (typeof value !== 'string') throw fault('validation');
        if (Object.hasOwn(ranges, field) && /^[1-9]\d{0,2}$/.test(value)) result[field] = integer(Number(value), 1, ranges[field]);
        else if (field === 'view' && ['pending', 'history'].includes(value)) result.view = value;
        else if (field === 'cursor' && /^[\w-]{1,4096}$/.test(value)) result.cursor = value;
        else throw fault('validation');
    }
    if ((result.channel && !result.nodeAddress) || (result.param && !result.channel)) throw fault('validation');
    return result;
}
function reply(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
}
function commandError(error, res) {
    if (error.code === 'validation' && error.field === 'unknown-node') throw fault('not-found');
    if (error.code === 'command-capacity') {
        const scope = error.scope === 'node' ? 'node' : 'domain';
        return sendErrorResponse(res, 409, 'The pending command queue is full', null, error.code, { scope });
    }
    if (['internal', 'duplicate'].includes(error.code)) throw fault('unavailable');
    throw error;
}
function mountCommandRoutes(app, { store, policy, ensureAuthenticated, ready }) {
    if (!store.commands) return;
    const root = '/api/domains/:id';
    function route(method, path, handler, { limit, roles } = {}) {
        app[method](root + path, noStore, ensureAuthenticated, ready, ...(limit ? [body(limit)] : []), asyncHandler(async (req, res) => {
            const expectedUser = req.get('X-Command-User');
            if (expectedUser !== undefined && expectedUser !== req.current.user._id) throw fault('unauthenticated');
            const current = await policy.domain(req, roles, Boolean(roles));
            if (expectedUser !== undefined && expectedUser !== current.actor.userId) throw fault('unauthenticated');
            await handler(req, res, current.actor, { domainId: req.params.id });
        }), (error, req, res, next) => {
            try { commandError(error, res); }
            catch (mapped) { next(mapped); }
        });
    }
    route('post', '/command-submissions', async (req, res, actor, input) => {
        exact(req.body, []);
        const { submissionId, issuedAt, firstUseExpiresAt } = await store.commands.prepare(actor, input);
        reply(res, { submissionId, issuedAt, firstUseExpiresAt }, 201);
    }, { limit: 1024, roles: editors });
    route('get', '/command-submissions/:submissionId', async (req, res, actor, input) => {
        const result = await store.commands.lookupSubmission(actor, { ...input, submissionId: opaque(req.params.submissionId) });
        reply(res, result.status === 'accepted' ? { status: result.status, command: project(result.command) } :
            { status: result.status, firstUseExpiresAt: result.firstUseExpiresAt });
    });
    route('post', '/commands', async (req, res, actor, input) => {
        const result = await store.commands.submit(actor, { ...input, ...submission(req.body) });
        reply(res, project(result.command), result.created ? 201 : 200);
    }, { limit: 8192, roles: editors });
    route('get', '/commands', async (req, res, actor, input) => {
        const query = { ...input, ...listInput(req.query) };
        while (true) {
            const { items, nextCursor } = await store.commands.list(actor, query);
            const encoded = JSON.stringify({ success: true, data: { items: items.map(project) }, pagination: { nextCursor } });
            if (Buffer.byteLength(encoded) <= 512 * 1024) return res.type('json').send(encoded);
            // Escaped JSON can exceed the native estimate. Ask storage for a
            // smaller page so the cursor still follows the last emitted item.
            if (items.length <= 1) throw fault('unavailable');
            query.limit = Math.floor(items.length / 2);
        }
    });
    route('get', '/commands/:commandId', async (req, res, actor, input) => {
        const result = await store.commands.get(actor, { ...input, commandId: opaque(req.params.commandId) });
        if (!result) throw fault('not-found');
        reply(res, project(result));
    });
    route('post', '/commands/:commandId/cancel', async (req, res, actor, input) => {
        exact(req.body, []);
        const result = await store.commands.cancel(actor, { ...input, commandId: opaque(req.params.commandId) });
        const command = project(result.command);
        if (!result.cancellationApplied) return sendErrorResponse(res, 409, 'The command has already reached a terminal state', null, 'command-terminal', { command });
        reply(res, { command, cancellationApplied: true });
    }, { limit: 1024, roles: editors });
    route('get', '/command-settings', async (req, res, actor, input) => {
        const { revision, httpLifetimeSeconds } = await store.commands.getSettings(actor, input);
        reply(res, { revision, httpLifetimeSeconds });
    });
    route('patch', '/command-settings', async (req, res, actor, input) => {
        exact(req.body, ['revision', 'httpLifetimeSeconds']);
        const result = await store.commands.updateSettings(actor, { ...input,
            revision: integer(req.body.revision, 1, Number.MAX_SAFE_INTEGER),
            httpLifetimeSeconds: integer(req.body.httpLifetimeSeconds, 60, 86400) });
        reply(res, { revision: result.revision, httpLifetimeSeconds: result.httpLifetimeSeconds });
    }, { limit: 1024, roles: ['owner'] });
}

function mountCommandPoll(app, { store }) {
    if (!store.commands) return;
    app.post('/commands/poll', noStore, body(4096), asyncHandler(async (req, res) => {
        const input = req.body;
        if (input && typeof input === 'object' && !Array.isArray(input) && !Object.hasOwn(input, 'apiKey')) throw fault('unauthenticated');
        exact(input, ['domain', 'id', 'apiKey', 'limit']);
        if (req.get('Authorization') !== undefined || req.get('Cookie') !== undefined) throw fault('unauthenticated');
        if (typeof input.domain !== 'string' || !input.domain || Buffer.byteLength(input.domain) > 200 ||
            /[/\u0000-\u001f]/.test(input.domain) || input.domain === '.' || input.domain === '..' || /^__.*__$/.test(input.domain)) throw fault('validation');
        if (typeof input.apiKey !== 'string' || !input.apiKey || Buffer.byteLength(input.apiKey) > 512) throw fault('unauthenticated');
        const nodeAddress = integer(input.id, 1, 254);
        const limit = integer(input.limit, 1, 32);
        let selected;
        try {
            selected = await store.commands.consume({ credential: { kind: 'domain', secret: input.apiKey } },
                { domainId: input.domain, nodeAddress, limit, attemptId: randomBytes(32).toString('base64url') });
        } catch (error) {
            if (error.code === 'forbidden' || error.code === 'not-found') throw fault('unauthenticated');
            return commandError(error, res);
        }
        let packets;
        try {
            if (selected.length > limit) throw fault('unavailable');
            packets = Buffer.concat(selected.map(row => packet(row, nodeAddress))).toString('base64');
            if (packets.length > 896) throw fault('unavailable');
        } catch { throw fault('unavailable'); }
        reply(res, { count: selected.length, packets });
    }));
}
module.exports = { mountCommandRoutes, mountCommandPoll };
