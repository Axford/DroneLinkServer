'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, domain, join } = require('./support.cjs');
const { runReplayStep } = require('../../lib/replayWorker');

test('Cloud Replay prepares retained windows for Viewers and stores an Editor bookmark frame', t => fixture(t, async context => {
    const admin = await context.agent('admin');
    const owner = await context.agent('replay-editor');
    const viewer = await context.agent('replay-viewer');
    const fleet = await domain(admin, 'Historical test');
    await join(admin, owner, fleet._id, 'replay-editor', 'editor');
    await join(admin, viewer, fleet._id, 'replay-viewer', 'viewer');
    const base = '/api/domains/' + fleet._id + '/replay';
    const first = 18001, middle = 18501, last = 40001;
    for (const [time, value] of [[first, 11], [middle, 12], [last, 13]]) {
        await context.one.packets.enqueue({ domain: fleet._id, time: new Date(time), packet: Buffer.from([0, 11, 7, 8, 0, value]), meta: {} });
    }
    await context.one.packets.enqueue({ domain: fleet._id, time: new Date(first), packet: Buffer.from('000b0705434e4d4541', 'hex'), meta: {} });
    await context.one.packets.enqueue({ domain: fleet._id, time: new Date(middle + 5), packet: Buffer.from('000b070545494e41323139', 'hex'), meta: {} });
    const deadline = Date.now() + 5000;
    let info;
    do {
        info = (await viewer.request(base)).json().data;
        if (info.last !== last) await new Promise(resolve => setTimeout(resolve, 25));
    } while (info.last !== last && Date.now() < deadline);
    assert.deepEqual([info.first, info.last, info.preparedUntil], [first, last, null]);
    assert.equal((await context.factories[0]().request(base)).status, 401);

    const path = base + '/window?from=' + middle + '&until=' + (last + 1);
    assert.equal((await viewer.request(path)).status, 202);
    assert.equal((await viewer.mutate(base + '/prepare', { at: middle })).status, 202);
    assert.equal(await runReplayStep(context.two), true);
    assert.equal(await runReplayStep(context.two), false);
    const result = (await viewer.request(path)).json().data;
    assert.equal(result.ready, true);
    assert.equal(result.frame.until, middle);
    assert.equal(result.frame.channels[0].params[8].value.payload, 'Cw==');
    assert.deepEqual(result.samples.filter(sample => sample.param === 8).map(sample => [sample.at, sample.payload]), [[middle, 'DA=='], [last, 'DQ==']]);

    assert.equal((await viewer.mutate(base + '/bookmarks', { at: middle, note: 'Denied' })).status, 403);
    const bookmarked = await owner.mutate(base + '/bookmarks', { at: middle, note: 'Test sail' });
    assert.equal(bookmarked.status, 201, bookmarked.text);
    const { bookmark } = bookmarked.json().data;
    assert.equal((await viewer.request(base + '/bookmarks')).json().data.items[0].note, 'Test sail');
    assert.equal((await owner.mutate(base + '/bookmarks/' + bookmark.id, { note: 'Trim test' }, 'PATCH')).status, 200);

    const latest = await owner.mutate(base + '/bookmarks', { note: 'Latest' });
    assert.equal(latest.status, 201, latest.text);
    assert.equal(latest.json().data.bookmark.at, last);
    assert.equal(latest.json().data.ready, false);
    assert.equal(await runReplayStep(context.two), true);
    assert.equal((await viewer.request(base + '/progress?at=' + last)).json().data.ready, true);
    const boundary = await viewer.request(base + '/window?from=' + (middle + 6) + '&until=' + (last + 1));
    assert.equal(boundary.json().data.frame.channels[0].moduleType, 'INA219');
    assert.equal(boundary.json().data.frame.channels[0].params[8], undefined);
    const protectedPage = await viewer.request('/private/domain/' + fleet._id + '/replay');
    assert.equal(protectedPage.status, 200);
}));
