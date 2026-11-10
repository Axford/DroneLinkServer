'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { randomBytes } = require('node:crypto');
const { openCommandOperatorStore } = require('@dronelink/persistence/operator');
const { fixture, domain, current, join, assertSafe } = require('./support.cjs');

const config = { observations: true, commands: true };
const post = (agent, url, body, headers = {}) => agent.request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function activate(f, fleet) {
    const operator = await openCommandOperatorStore({ ...f.options, databaseId: '(default)', commandContract: 'm2-a-1' });
    try {
        const plan = await operator.preview();
        await operator.prepare({ expectedControlRevision: plan.controlRevision, planDigest: plan.digest });
        await operator.prepareDomain({ domainId: fleet._id });
        await operator.activate({ expectedControlRevision: (await f.one.access.getControl()).revision });
    } finally { await operator.close(); }
}
async function setup(f) {
    const admin = await f.agent('admin'), fleet = await domain(admin), root = '/api/domains/' + fleet._id;
    const apiKey = (await admin.request(root + '/key')).json().data.apiKey;
    const device = f.factories[0]();
    const machine = { domain: fleet._id, id: 7, apiKey };
    const publish = async (param, type, bytes, writable = true, node = 7) => {
        const packet = Buffer.from([node, node, 1, param, (writable ? 128 : 0) | (type << 4) | (bytes.length - 1), ...bytes]);
        const response = await post(device, '/addPackets', { ...machine, id: node, packets: packet.toString('base64') });
        assert.equal(response.status, 202, response.text);
    };
    const poll = (body = {}, headers) => post(device, '/commands/poll', { ...machine, limit: 32, ...body }, headers);
    const prepare = async (agent = admin) => {
        const result = await agent.mutate(root + '/command-submissions');
        assert.equal(result.status, 201, result.text);
        return result.json().data.submissionId;
    };
    return { admin, fleet, root, apiKey, device, machine, publish, poll, prepare };
}

test('hosted command routes project canonical intent and poll packs priority, source, type and length exactly', t => fixture(t, async f => {
    const { admin, fleet, root, publish, poll, prepare } = await setup(f);
    assert.equal((await admin.mutate(root + '/command-submissions')).status, 503);
    await activate(f, fleet);
    await publish(1, 0, [20, 21]); await publish(2, 1, [0, 0, 0, 0]);
    await publish(3, 2, [0, 0, 0, 0]); await publish(4, 3, [0, 0, 0, 0]); await publish(5, 4, [65, 0, 0]);
    const observer = await f.agent('admin', 1);
    let observations;
    for (let i = 0; i < 60; i++) {
        observations = (await observer.request(root + '/observations')).json().data;
        if (observations.channels[0]?.params?.['5']?.value) break;
        await delay(25);
    }
    assert.ok(observations.channels[0].params['5'].value);
    const queries = ['query-value', 'query-name'];
    for (const operation of queries) {
        const response = await admin.mutate(root + '/commands', { submissionId: await prepare(), operation, target: { nodeAddress: 7, channel: 1, param: 63 } });
        assert.equal(response.status, 201, response.text);
        assert.equal(response.json().data.requested, null);
    }
    const vectors = [
        [{ values: [0, 255] }, [0, 255]],
        [{ addresses: [{ source: 255, node: 0, channel: 254, param: 63, priority: 3 }] }, [255, 0, 254, 255]],
        [{ values: [0xffffffff] }, [255, 255, 255, 255]],
        [{ values: [-1e-100] }, [0, 0, 0, 0], { values: [0] }],
        [{ text: 'é' }, [233, 0, 0]]
    ];
    const invalid = [{ values: [0, '255'] }, { addresses: [{ source: -1, node: 0, channel: 0, param: 0, priority: 0 }] },
        { values: [0x100000000] }, { values: [1e50] }, { text: 'a\u0000' }];
    const wire = [];
    for (const [msgType, [payload, encoded, canonical = payload]] of vectors.entries()) {
        const submissionId = await prepare();
        const input = { submissionId, operation: 'write', target: { nodeAddress: 7, channel: 1, param: msgType + 1 },
            expected: { observationEpoch: 'm1-c-1', nodeGeneration: 0, msgType, payloadBytes: encoded.length, writable: true }, payload };
        assert.equal((await admin.mutate(root + '/commands', { ...input, payload: invalid[msgType] })).status, 400);
        assert.equal((await admin.request(root + '/command-submissions/' + submissionId)).json().data.status, 'unused');
        const created = await admin.mutate(root + '/commands', input);
        assert.equal(created.status, 201, created.text);
        assertSafe(created);
        assert.equal(created.headers.get('cache-control'), 'private, no-store');
        const row = created.json().data;
        assert.deepEqual(row.requested, canonical);
        assert.equal(row.priority, 3);
        assert.equal((await observer.mutate(root + '/commands', { ...input, payload: canonical })).status, 200);
        assert.equal((await observer.request(root + '/commands/' + row.id)).json().data.id, row.id);
        wire.push(7, 7, 1, 192 | (msgType + 1), msgType << 4 | (encoded.length - 1), ...encoded);
    }
    wire.push(7, 7, 1, 63, 112, 0, 7, 7, 1, 63, 96, 0);
    const before = await observer.request(root + '/observations');
    const response = await poll();
    assert.equal(response.status, 200, response.text);
    assert.deepEqual(response.json(), { success: true, data: { count: 7, packets: Buffer.from(wire).toString('base64') } });
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual((await poll()).json().data, { count: 0, packets: '' });
    assert.deepEqual((await observer.request(root + '/observations')).json().data.channels, before.json().data.channels);
    const history = await admin.request(root + '/commands?view=history&nodeAddress=7&channel=1&param=63&limit=1');
    assert.equal(history.json().data.items.length, 1);
    assert.ok(history.json().pagination.nextCursor);
    const page = await admin.request(root + '/commands?view=history&nodeAddress=7&channel=1&param=63&limit=1&cursor=' + history.json().pagination.nextCursor);
    assert.notEqual(page.json().data.items[0].id, history.json().data.items[0].id);
}, config));

test('authority, bounded parsers, terminal conflicts and uncertain HTTP responses preserve command identity', t => fixture(t, async f => {
    const { admin, fleet, root, device, machine, publish, poll, prepare } = await setup(f);
    const viewer = await f.agent('viewer'), editor = await f.agent('editor'), outsider = await f.agent('outsider');
    await join(admin, viewer, fleet._id, 'viewer', 'viewer');
    await join(admin, editor, fleet._id, 'editor', 'editor');
    await activate(f, fleet);
    await publish(1, 0, [8]); await publish(1, 0, [9], true, 8);
    assert.equal((await outsider.request(root + '/commands')).status, 403);
    assert.equal((await viewer.mutate(root + '/command-submissions')).status, 403);
    assert.equal((await editor.mutate(root + '/command-submissions', {}, 'POST', { 'X-CSRF-Token': 'invalid' })).status, 403);
    assert.equal((await editor.mutate(root + '/command-submissions', { padding: 'x'.repeat(1024) })).status, 400);
    assert.equal((await editor.mutate(root + '/command-settings', { revision: 1, httpLifetimeSeconds: 60 }, 'PATCH')).status, 403);
    assert.deepEqual((await viewer.request(root + '/command-settings')).json().data, { revision: 1, httpLifetimeSeconds: 3600 });
    assert.equal((await admin.mutate(root + '/command-settings', { revision: 1, httpLifetimeSeconds: 60 }, 'PATCH')).status, 200);
    assert.equal((await admin.mutate(root + '/command-settings', { revision: 1, httpLifetimeSeconds: 60 }, 'PATCH')).status, 409);
    const submissionId = await prepare(editor);
    const request = { submissionId, operation: 'query-value', target: { nodeAddress: 7, channel: 1, param: 12 } };
    const duplicate = await editor.request(root + '/commands', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: f.config.publicOrigin, 'X-CSRF-Token': editor.token },
        body: JSON.stringify(request).replace('"operation":', '"operation":"query-name","operation":') });
    assert.equal(duplicate.status, 400);
    assert.equal((await editor.request(root + '/command-submissions/' + submissionId)).json().data.status, 'unused');
    const alias = await viewer.request(root.replace('/api/', '/API/') + '/commands');
    assert.equal(alias.headers.get('cache-control'), 'private, no-store');
    const otherId = randomBytes(32).toString('base64url');
    assert.equal((await editor.mutate(root + '/commands', { ...request, submissionId: otherId })).status, 410);
    assert.equal((await viewer.request(root + '/command-submissions/' + submissionId)).status, 410);
    const submit = f.one.commands.submit;
    f.one.commands.submit = async (...args) => {
        await submit(...args);
        throw Object.assign(new Error('credential must not appear in response'), { code: 'unavailable' });
    };
    try {
        const lost = await editor.mutate(root + '/commands', request);
        assert.equal(lost.status, 503);
        assert.doesNotMatch(lost.text, /credential/);
    } finally { f.one.commands.submit = submit; }
    const recovered = await editor.mutate(root + '/commands', request);
    assert.equal(recovered.status, 200, recovered.text);
    const command = recovered.json().data;
    assert.equal(Date.parse(command.expiresAt) - Date.parse(command.acceptedAt), 60000);
    assert.equal((await editor.mutate(root + '/commands', { ...request, operation: 'query-name' })).json().code, 'submission-conflict');
    assert.equal((await poll({ apiKey: 'invalid' })).status, 401);
    assert.equal((await poll({ apiKey: undefined })).status, 401);
    assert.equal((await poll({ domain: 'unknown' })).status, 401);
    assert.equal((await poll({ id: 9 })).status, 404);
    assert.equal((await poll({ id: 8 })).json().data.count, 0);
    assert.equal((await poll({ peers: [8] })).status, 400);
    assert.equal((await poll({}, { Authorization: 'Bearer other' })).status, 401);
    assert.equal((await device.request('/commands/poll', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: gzipSync(JSON.stringify({ ...machine, limit: 1 })) })).status, 400);
    assert.equal((await poll()).json().data.count, 1);
    const cancel = await editor.mutate(root + '/commands/' + command.id + '/cancel');
    assert.equal(cancel.status, 409); assert.equal(cancel.json().data.command.state, 'retrieved');
    assert.equal((await editor.request(root + '/command-submissions/' + submissionId)).json().data.command.id, command.id);
    assert.equal((await viewer.mutate(root + '/commands/' + command.id + '/cancel')).status, 403);
    const pending = (await editor.mutate(root + '/commands', { ...request, submissionId: await prepare(editor) })).json().data;
    const cancelled = await admin.mutate(root + '/commands/' + pending.id + '/cancel');
    assert.equal(cancelled.json().data.cancellationApplied, true);
    assert.deepEqual((await editor.mutate(root + '/commands/' + pending.id + '/cancel')).json().data, cancelled.json().data);
    assert.equal((await admin.mutate(root + '/archive', { revision: (await current(admin, fleet._id)).revision })).status, 200);
    assert.equal((await poll()).json().code, 'domain-archived');
    assert.equal((await editor.mutate(root + '/commands', request)).status, 409);
    assert.equal((await viewer.request(root + '/commands?view=history')).status, 200);
    assert.equal((await editor.mutate('/api/send', request)).status, 501);
}, config));
