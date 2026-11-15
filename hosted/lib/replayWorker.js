'use strict';
const { replayPage, advanceReplayStep, encodeState, decodeState } = require('./replayHistory');

async function runReplayStep(store) {
    const job = await store.replay.claim();
    if (!job) return false;
    const { domainId, token, anchorAt } = job;
    try {
        const start = job.preparedUntil ?? job.from;
        let target = job.target;
        if (job.follow && start >= target) {
            const { last } = await store.packets.bounds(domainId);
            if (last !== null) target = Math.max(target, last + 1);
        }
        const nextCapture = job.lastCapture + job.intervalMs;
        const until = job.pendingUntil ?? Math.min(target, nextCapture > start ? nextCapture : target);
        const frame = decodeState(domainId, start, job.payload);
        const page = until > start
            ? await replayPage(store.packets, { domainId, from: start, until, cursor: job.cursor, limit: 2000 })
            : { publications: [], nextCursor: null };
        const result = await advanceReplayStep(frame, page, until, job.boundaryAt, (cutoff, payload) =>
            store.replay.publishBoundary({ domainId, token, anchorAt, until: cutoff, payload }));
        const current = result.frame;
        await store.replay.checkpoint({
            domainId, token, anchorAt, boundaryAt: result.boundaryAt, until, cursor: page.nextCursor, target,
            payload: encodeState(current), capture: until > start && (until >= nextCapture || !job.preparedUntil)
        });
        return true;
    } catch (error) {
        await store.replay.checkpoint({ domainId, token, anchorAt, retry: true }).catch(() => {});
        throw error;
    }
}

function startReplayWorker(store) {
    if (!store.replay) return { wake() {}, async close() {} };
    let timer, active;
    let closed = false;
    let requested = false;
    const schedule = delay => {
        if (closed) return;
        clearTimeout(timer);
        timer = setTimeout(tick, delay);
        timer.unref();
    };
    function tick() {
        requested = false;
        active = runReplayStep(store).catch(error => {
            console.error('Replay catch-up step failed', { category: error.code || 'internal' });
            return false;
        }).then(continued => {
            active = null;
            schedule(continued || requested ? 30 : 30000);
        });
    }
    schedule(0);
    return {
        wake() { requested = true; if (!active) schedule(0); },
        async close() { closed = true; clearTimeout(timer); await active; }
    };
}

module.exports = { startReplayWorker, runReplayStep };
