'use strict';
const { fault } = require('./accessPolicy');
const { asyncHandler } = require('../middleware/errorHandler');

const editRoles = ['owner', 'editor'];

function requireFields(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== fields.length || !fields.every(field => Object.hasOwn(value, field))) {
        throw fault('validation');
    }
}

function queryInteger(value) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw fault('validation');
    return Number(value);
}

function mountDroneGroupingRoutes(app, { store, policy, ensureAuthenticated }) {
    const base = '/api/domains/:id';
    const route = run => [ensureAuthenticated, asyncHandler(run)];

    app.post(base + '/drones/move-nodes', ...route(async (req, res) => {
        const current = await policy.domain(req, editRoles, true);
        requireFields(req.body, ['sourceDroneId', 'expectedSourceRevision', 'sourceMasterAddress', 'nodeAddresses', 'destination']);
        const { destination } = req.body;
        if (destination?.kind === 'new') requireFields(destination, ['kind']);
        else requireFields(destination, ['kind', 'droneId', 'expectedRevision', 'masterAddress']);
        const data = await store.telemetry.moveDroneNodes(current.actor, { ...req.body, domainId: req.params.id });
        await policy.domain(req, editRoles);
        res.json({ success: true, data });
    }));

    app.put(base + '/drones/:droneId/master', ...route(async (req, res) => {
        const current = await policy.domain(req, editRoles, true);
        requireFields(req.body, ['expectedRevision', 'masterAddress']);
        const data = await store.telemetry.setDroneMaster(current.actor, {
            ...req.body, domainId: req.params.id, droneId: req.params.droneId
        });
        await policy.domain(req, editRoles);
        res.json({ success: true, data });
    }));

    app.get(base + '/drone-grouping/changes', ...route(async (req, res) => {
        const current = await policy.domain(req);
        const { items, nextBeforeSequence } = await store.telemetry.listDroneGroupingChanges(current.actor, {
            domainId: req.params.id, limit: queryInteger(req.query.limit), beforeSequence: queryInteger(req.query.beforeSequence)
        });
        await policy.domain(req);
        res.json({ success: true, data: { items }, pagination: { nextBeforeSequence } });
    }));

    app.get(base + '/drone-grouping/restorable', ...route(async (req, res) => {
        const current = await policy.domain(req);
        const { cursor } = req.query;
        if (cursor !== undefined && (typeof cursor !== 'string' || !cursor.length)) throw fault('validation');
        const { items, nextCursor } = await store.telemetry.listRestorableDrones(current.actor, {
            domainId: req.params.id, nodeAddress: queryInteger(req.query.nodeAddress), limit: queryInteger(req.query.limit), cursor
        });
        await policy.domain(req);
        res.json({ success: true, data: { items }, pagination: { nextCursor } });
    }));
}

module.exports = { mountDroneGroupingRoutes };
