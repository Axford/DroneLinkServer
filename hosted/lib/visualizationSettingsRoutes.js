'use strict';
const { fault } = require('./accessPolicy');
const { asyncHandler } = require('../middleware/errorHandler');

function mountVisualizationSettingsRoutes(app, { store, policy, ensureAuthenticated }) {
    if (!store.visualizationSettings) return;
    const base = '/api/domains/:id/visualization-settings';
    app.get(base, ensureAuthenticated, asyncHandler(async (req, res) => {
        const current = await policy.domain(req);
        const { items, nextCursor } = await store.visualizationSettings.list(current.actor, {
            domainId: req.params.id, cursor: req.query.cursor,
            limit: req.query.limit === undefined ? undefined : Number(req.query.limit)
        });
        await policy.domain(req);
        res.json({ success: true, data: { items }, pagination: { nextCursor } });
    }));
    app.put(base + '/:node/:channel/:module', ensureAuthenticated, asyncHandler(async (req, res) => {
        const { id, node, channel, module: moduleType } = req.params;
        const fields = ['revision', 'expectedGeneration', 'thresholds'];
        if (!/^[1-9]\d{0,2}$/.test(node) || !/^[1-9]\d{0,2}$/.test(channel) ||
            !req.body || Object.keys(req.body).length !== fields.length || !fields.every(field => Object.hasOwn(req.body, field))) {
            throw fault('validation');
        }
        const current = await policy.domain(req, ['owner', 'editor'], true);
        const data = await store.visualizationSettings.save(current.actor, {
            ...req.body, domainId: id, nodeAddress: Number(node), channel: Number(channel), moduleType
        });
        await policy.domain(req);
        res.json({ success: true, data });
    }));
}
module.exports = { mountVisualizationSettingsRoutes };
