'use strict';
const { fault } = require('./accessPolicy');
const { asyncHandler } = require('../middleware/errorHandler');
function mountObservationRoutes(app, { store, policy, ensureAuthenticated }) {
    if (!store.observations) return;
    const base = '/api/domains/:id';
    const route = handler => [ensureAuthenticated, asyncHandler(handler)];
    const limit = value => value === undefined ? undefined : Number(value);
    const respond = (res, result) => {
        const { nextCursor, ...data } = result;
        res.json({ success: true, data, pagination: { nextCursor } });
    };
    app.get(base + '/observations', ...route(async (req, res) => {
        const current = await policy.domain(req);
        const result = await store.observations.readSnapshot(current.actor, { domainId: req.params.id, cursor: req.query.cursor, limit: limit(req.query.limit) });
        await policy.domain(req); respond(res, result);
    }));
    app.get(base + '/observations/updates', ...route(async (req, res) => {
        const current = await policy.domain(req); const controller = new AbortController();
        const cancel = () => controller.abort(); res.once('close', cancel);
        try {
            const result = await store.observations.readUpdates(current.actor, { domainId: req.params.id, cursor: req.query.cursor, through: req.query.through,
                limit: limit(req.query.limit), timeoutMs: req.query.timeoutMs === undefined ? 25000 : Number(req.query.timeoutMs), signal: controller.signal });
            await policy.domain(req); if (!controller.signal.aborted) respond(res, result);
        } finally { res.off('close', cancel); }
    }));
    app.post(base + '/nodes/:address/reset', ...route(async (req, res) => {
        if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'expectedGeneration') || !/^[1-9]\d{0,2}$/.test(req.params.address)) throw fault('validation');
        const current = await policy.domain(req, ['owner', 'editor'], true);
        const result = await store.observations.reset(current.actor, { domainId: req.params.id, nodeAddress: Number(req.params.address), expectedGeneration: req.body.expectedGeneration });
        await policy.domain(req, ['owner', 'editor']); res.json({ success: true, data: result });
    }));
    app.get(base + '/observation-diagnostics', ...route(async (req, res) => {
        const current = await policy.domain(req); const result = await store.observations.getDiagnostics(current.actor, { domainId: req.params.id });
        await policy.domain(req); res.json({ success: true, data: result });
    }));
}
module.exports = { mountObservationRoutes };
