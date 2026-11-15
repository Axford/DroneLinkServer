'use strict';
const { fault } = require('./accessPolicy');
const { asyncHandler } = require('../middleware/errorHandler');
const { replayPage, decodeState, encodeState } = require('./replayHistory');

const WINDOW = 15 * 60 * 1000;
const EDITORS = ['owner', 'editor'];
function millis(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= 8640000000000000) throw fault('validation');
    return value;
}

function mountReplayRoutes(app, { store, policy, ensureAuthenticated, replayWorker }) {
    if (!store.replay) return;
    const base = '/api/domains/:id/replay';
    const wrap = run => [ensureAuthenticated, asyncHandler(run)];
    const scope = req => ({ domainId: req.params.id });
    const reply = (res, data, status = 200) => res.status(status).json({ success: true, data });
    async function startingFrame(actor, domainId, first, at) {
        if (first === at) return decodeState(domainId, first, null);
        const saved = await store.replay.frame(actor, { domainId, at, includeProgress: true, exact: true });
        return saved ? decodeState(domainId, saved.until, saved.payload) : null;
    }
    app.get(base, ...wrap(async (req, res) => {
        const current = await policy.domain(req);
        const { domainId } = scope(req);
        const [bounds, progress] = await Promise.all([store.packets.bounds(domainId), store.replay.inspect(current.actor, { domainId })]);
        await policy.domain(req);
        reply(res, { ...bounds, ...progress, domain: policy.summary(current.domain, current), userId: current.user._id, admin: current.admin });
    }));
    app.get(base + '/progress', ...wrap(async (req, res) => {
        const current = await policy.domain(req);
        const at = req.query.at === undefined ? undefined : millis(Number(req.query.at));
        const progress = await store.replay.inspect(current.actor, { ...scope(req), at });
        await policy.domain(req);
        reply(res, progress);
    }));
    app.post(base + '/prepare', ...wrap(async (req, res) => {
        const current = await policy.domain(req);
        const { domainId } = scope(req);
        const at = millis(req.body?.at);
        const { first, last } = await store.packets.bounds(domainId);
        const follow = req.body?.follow === true;
        if (first === null || at < first || at > last + 1) throw fault('validation');
        if (at === first && at < last && !follow) {
            await policy.domain(req);
            return reply(res, { ready: true, preparedUntil: at });
        }
        const progress = await store.replay.request(current.actor, { domainId, from: first, until: follow ? last + 1 : at === first ? first + 1 : at, follow: follow || at >= last });
        replayWorker?.wake();
        await policy.domain(req);
        const currentState = at === first ? { ready: true } : await store.replay.inspect(current.actor, { domainId, at });
        if (currentState.preparedUntil >= at && !currentState.ready) {
            await store.replay.requestAnchor(current.actor, { domainId, from: first, at });
            replayWorker?.wake();
        }
        await policy.domain(req);
        reply(res, { ...progress, ready: currentState.ready }, currentState.ready ? 200 : 202);
    }));
    app.get(base + '/window', ...wrap(async (req, res) => {
        const current = await policy.domain(req);
        const { domainId } = scope(req);
        const { from: rawFrom, until: rawUntil, cursor } = req.query;
        if (typeof rawFrom !== 'string' || !/^\d+$/.test(rawFrom) ||
            typeof rawUntil !== 'string' || !/^\d+$/.test(rawUntil) ||
            (cursor !== undefined && (typeof cursor !== 'string' || !cursor))) throw fault('validation');
        const from = millis(Number(rawFrom)), until = millis(Number(rawUntil));
        if (until <= from || until - from > WINDOW) throw fault('validation');
        let frame = null;
        if (!cursor) {
            const { first: earliest, last } = await store.packets.bounds(domainId);
            if (earliest === null || from < earliest || until > last + 1) throw fault('validation');
            frame = await startingFrame(current.actor, domainId, earliest, from);
            if (!frame) {
                const { preparedUntil } = await store.replay.inspect(current.actor, { domainId });
                await policy.domain(req);
                return reply(res, { ready: false, preparedUntil }, 202);
            }
        }
        const page = await replayPage(store.packets, { domainId, from, until, cursor, limit: 2000 });
        const samples = page.publications.map(({ at, packet }) => {
            const { node, channel, param, msgType, payload } = packet;
            return { at, node, channel, param, msgType, payload: Buffer.from(payload).toString('base64') };
        });
        await policy.domain(req);
        reply(res, { ready: true, frame, samples, nextCursor: page.nextCursor });
    }));
    app.put(base + '/settings', ...wrap(async (req, res) => {
        const current = await policy.domain(req, EDITORS, true);
        const { intervalMs, revision } = req.body || {};
        reply(res, await store.replay.setInterval(current.actor, { ...scope(req), intervalMs, revision }));
    }));
    app.get(base + '/bookmarks', ...wrap(async (req, res) => {
        const current = await policy.domain(req);
        const result = await store.replay.listBookmarks(current.actor, { ...scope(req), cursor: req.query.cursor });
        await policy.domain(req);
        reply(res, result);
    }));
    app.post(base + '/bookmarks', ...wrap(async (req, res) => {
        const current = await policy.domain(req, EDITORS, true);
        const { domainId } = scope(req);
        const { first, last } = await store.packets.bounds(domainId);
        const at = req.body?.at === undefined ? last : millis(req.body.at);
        if (first === null || at < first || at > last) throw fault('validation');
        const note = req.body?.note;
        if (typeof note !== 'string' || !note.trim() || Buffer.byteLength(note) > 1024) throw fault('validation');
        const frame = await startingFrame(current.actor, domainId, first, at);
        if (!frame) {
            await store.replay.requestAnchor(current.actor, { domainId, from: first, at });
            replayWorker?.wake();
        }
        const result = await store.replay.createBookmark(current.actor, { domainId, at, note, ...(frame ? { payload: encodeState(frame) } : {}) });
        await policy.domain(req);
        reply(res, { ready: Boolean(frame), bookmark: result }, 201);
    }));
    for (const method of ['patch', 'delete']) {
        app[method](base + '/bookmarks/:bookmark', ...wrap(async (req, res) => {
            const current = await policy.domain(req, EDITORS, true);
            const result = await store.replay.changeBookmark(current.actor, {
                ...scope(req), id: req.params.bookmark, ...(method === 'delete' ? { remove: true } : { note: req.body?.note })
            });
            reply(res, result);
        }));
    }
}

module.exports = { mountReplayRoutes };
