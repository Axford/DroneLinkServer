'use strict';
// Explicit managed storage probe; Google consent/browser acceptance remains manual.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { openFirestoreStore } = require('@dronelink/persistence');
async function main() {
    const args = process.argv.slice(2); const option = name => args[args.indexOf(name) + 1];
    if (!args.includes('--project') || option('--project') !== 'dronelink-25dbc') throw Error('Select agreed staging project explicitly');
    if (!args.includes('--apply')) { console.log('Dry run: create isolated SEP-06 synthetic user/domain, exercise managed queries/listeners/chunks, retain clearly named acceptance data; no Google identity or hardware validation'); return; }
    const filename = option('--evidence');
    if (!args.includes('--evidence') || !filename || fs.existsSync(filename)) throw Error('Select a new evidence file');
    const events = []; const store = await openFirestoreStore({ projectId: option('--project'), onPacketDrop: event => events.push(event) });
    const runId = 'sep06-check-' + crypto.randomUUID();
    try {
        const user = await store.users.registerSignIn({ googleId: runId, email: runId + '@example.invalid', displayName: 'SEP-06 synthetic acceptance' });
        const domain = await store.domains.createWithCreator({ name: runId, createdBy: user._id });
        assert.equal((await store.domains.listForUser(user._id)).items[0]._id, domain._id);
        assert.equal((await store.domains.findNamedForUser(runId, user._id))._id, domain._id);
        const now = new Date(); const sessionId = 'acceptance-' + crypto.randomUUID();
        await store.sessions.put(sessionId, { data: { test: runId }, createdAt: now, expiresAt: new Date(now.getTime() + 60000) });
        assert.equal((await store.sessions.get(sessionId)).data.test, runId);
        await store.sessions.remove(sessionId); assert.equal(await store.sessions.get(sessionId), null);
        const from = new Date(Date.now() - 1000);
        const waiting = store.packets.waitForPage({ domainId: domain._id, from, timeoutMs: 30000 });
        const expected = [];
        const memoryStart = process.memoryUsage().rss; const started = Date.now();
        // Representative 66 packet/s peak; receipt time and bytes remain individual.
        for (let second = 0; second < 12; second++) {
            for (let n = 0; n < 66; n++) expected.push((await store.packets.enqueue({ domain: domain._id, time: new Date(), packet: Buffer.from([1, 2, 3, 4, 5, n]), meta: { id: 250, node: 2, channel: 3, param: 4, msgType: 0 } })).packetId);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        const first = await waiting; assert.ok(first.items.length > 0);
        await new Promise(resolve => setTimeout(resolve, 1200));
        const until = new Date(); const actual = []; let cursor;
        do {
            const page = await store.packets.readPage({ domainId: domain._id, from, until, limit: 37, ...(cursor ? { cursor } : {}) });
            actual.push(...page.items); cursor = page.nextCursor;
        } while (cursor);
        assert.deepEqual(new Set(actual.map(packet => packet._id)), new Set(expected));
        assert.equal(actual.length, expected.length);
        assert.equal(await store.packets.countRetained(domain._id), expected.length);
        assert.equal(events.length, 0);
        const controller = new AbortController();
        const cancelled = store.packets.waitForPage({ domainId: domain._id, from: new Date(Date.now() + 1000), timeoutMs: 30000, signal: controller.signal });
        controller.abort(); await assert.rejects(cancelled, { code: 'unavailable' });
        const result = { runId, projectId: option('--project'), domainId: domain._id, userId: user._id, packets: expected.length, peakPacketsPerSecond: 66, durationMs: Date.now() - started, droppedChunks: events.length, rssStart: memoryStart, rssEnd: process.memoryUsage().rss, checks: ['managed domain query indexes', 'atomic domain membership', 'fixed session/revocation', 'managed listener', 'individual cursor pagination', 'retained count', 'abort cleanup'], limitations: ['Operator ADC probe; not Cloud Run memory/instance measurement', 'Synthetic packet bytes do not prove codec/map behavior', 'Google consent/browser acceptance remains separate'] };
        fs.writeFileSync(filename, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        console.log(JSON.stringify({ passed: true, runId, packets: result.packets, droppedChunks: 0 }));
    } finally { await store.close(); }
}
main().catch(error => { console.error('Staging probe failed', { category: error.code || 'assertion', message: error.code ? undefined : error.message }); process.exitCode = 1; });
