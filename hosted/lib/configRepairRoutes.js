'use strict';

const { fault } = require('./accessPolicy');
const { asyncHandler } = require('../middleware/errorHandler');
const { exact, integer } = require('./commandPayload');
const { nodeBearer, domainId, hex } = require('./nodeCredentials');

const editors = ['owner', 'editor'];
const phases = new Set(['idle', 'trial', 'ready', 'rejected', 'committed']);
const actionCode = { none: '-', stage: 's', activate: 'a', confirm: 'c' };
const noStore = (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };

function mountConfigRepairMachine(app, { store, parse, repairAllowed }) {
    if (!store.configRepair) return;
    app.post('/node-auth/repair', noStore, parse(1024), asyncHandler(async (req, res) => {
        exact(req.body, ['domain', 'id', 'boot', 'mode', 'phase', 'installed', 'staged']);
        const target = { domainId: domainId(req.body.domain), nodeAddress: integer(req.body.id, 1, 254) };
        if (!repairAllowed(target.domainId)) throw fault('not-found');
        const credential = nodeBearer(req);
        if (!credential) throw fault('unauthenticated');
        const { phase, installed, staged } = req.body;
        if (!phases.has(phase)) throw fault('validation');
        const result = await store.configRepair.poll({ ...target, credential, boot: hex(req.body.boot, 8),
            mode: integer(req.body.mode, 0, 3), phase, installed: installed === '' ? null : hex(installed, 32),
            staged: staged === '' ? null : hex(staged, 32) });
        const header = actionCode[result.action] + (result.action === 'none' ? '' : result.expected + result.candidate);
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(result.bytes ? Buffer.concat([Buffer.from(header, 'ascii'), result.bytes]) : header);
    }));
}

function mountConfigRepairOperators(app, { store, parse, repairAllowed, ensureAuthenticated, policy }) {
    if (!store.configRepair) return;
    const root = '/api/domains/:id/config-repair/:address';
    function route(method, action) {
        app[method](root + (action === 'get' ? '' : '/' + action), noStore, ensureAuthenticated,
            ...(method === 'post' ? [parse(12288)] : []), asyncHandler(async (req, res) => {
                if (!repairAllowed(req.params.id)) throw fault('not-found');
                const current = await policy.domain(req, editors, true);
                if (req.get('X-Command-User') !== current.actor.userId) throw fault('unauthenticated');
                if (!/^[1-9][0-9]{0,2}$/.test(req.params.address)) throw fault('validation');
                const input = { domainId: domainId(req.params.id), nodeAddress: integer(Number(req.params.address), 1, 254) };
                if (action === 'stage') {
                    exact(req.body, ['expected', 'bytes']);
                    Object.assign(input, { expected: hex(req.body.expected, 32), bytes: req.body.bytes });
                } else if (method === 'post') {
                    exact(req.body, ['id', 'boot']);
                    Object.assign(input, { id: hex(req.body.id, 16), boot: hex(req.body.boot, 8) });
                }
                res.json({ success: true, data: await store.configRepair[action](current.actor, input) ?? { state: "idle", device: null } });
            }));
    }
    route('get', 'get');
    for (const action of ['stage', 'activate', 'confirm']) route('post', action);
}

module.exports = { mountConfigRepairMachine, mountConfigRepairOperators };
