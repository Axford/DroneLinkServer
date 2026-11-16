'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openCommandOperatorStore } = require('@dronelink/persistence/operator');
const { fixture, domain, current, join, assertSafe } = require('./support.cjs');

async function activateCommands(options, store, domainIds) {
    const operator = await openCommandOperatorStore({ ...options, databaseId: '(default)', commandContract: 'm2-a-1' });
    try {
        const plan = await operator.preview();
        await operator.prepare({ expectedControlRevision: plan.controlRevision, planDigest: plan.digest });
        for (const domainId of domainIds) await operator.prepareDomain({ domainId });
        await operator.activate({ expectedControlRevision: (await store.access.getControl()).revision });
    } finally {
        await operator.close();
    }
}

function post(device, path, body, headers = {}) {
    return device.request(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
    });
}

async function expectResponse(response, status) {
    const result = await response;
    assert.equal(result.status, status, result.text);
    return result.json();
}

test('hosted Drone grouping enforces access and preserves node-addressed commands, observations and relay', t => fixture(t, async f => {
    const admin = await f.agent('admin');
    const editor = await f.agent('editor', 1);
    const viewer = await f.agent('viewer', 1);
    const outsider = await f.agent('outside');
    const fleet = await domain(admin);
    const foreign = await domain(admin, 'Foreign');
    const root = '/api/domains/' + fleet._id;
    const otherRoot = '/api/domains/' + foreign._id;
    await join(admin, editor, fleet._id, 'editor', 'editor');
    await join(admin, viewer, fleet._id, 'viewer', 'viewer');
    await activateCommands(f.options, f.one, [fleet._id, foreign._id]);

    const device = f.factories[0]();
    const read = async (agent, path) => (await expectResponse(agent.request(path), 200)).data;
    const apiKey = (await read(admin, root + '/key')).apiKey;
    const foreignKey = (await read(admin, otherRoot + '/key')).apiKey;
    const publication = (node, value = 20) => Buffer.from([node, node, 1, 1, 0, value]).toString('base64');
    for (const id of [7, 8, 9]) {
        const result = await post(device, '/addPacket', { domain: fleet._id, apiKey, id, packet: publication(id) });
        assert.equal(result.status, 202, result.text);
    }
    assert.equal((await post(device, '/addPacket', { domain: foreign._id, apiKey: foreignKey, id: 8, packet: publication(8) })).status, 202);

    const identities = () => read(viewer, root + '/identities');
    const { nodes } = await identities();
    const [destinationId, sourceId, relayId] = nodes.map(row => row.droneId);
    const foreignId = (await read(admin, otherRoot + '/identities')).drones[0]._id;
    const movePath = root + '/drones/move-nodes';
    const masterPath = root + '/drones/' + destinationId + '/master';
    const historyPath = root + '/drone-grouping/changes';
    const restorablePath = root + '/drone-grouping/restorable?nodeAddress=8';
    const move = {
        sourceDroneId: sourceId, expectedSourceRevision: 0, sourceMasterAddress: null, nodeAddresses: [8],
        destination: { kind: 'existing', droneId: destinationId, expectedRevision: 0, masterAddress: 7 }
    };
    await expectResponse(post(device, movePath, { ...move, apiKey }), 401);
    await expectResponse(outsider.request(historyPath), 403);
    await expectResponse(viewer.mutate(movePath, move), 403);
    assert.equal((await expectResponse(editor.mutate(movePath, move, 'POST', { 'X-CSRF-Token': 'invalid' }), 403)).code, 'csrf');
    assert.equal((await expectResponse(editor.mutate(movePath, { ...move, destination: { ...move.destination, droneId: foreignId } }), 404)).code, 'not-found');
    await expectResponse(editor.mutate(movePath, { ...move, destination: { ...move.destination, masterAddress: 9 } }), 400);
    await expectResponse(editor.mutate(movePath, { ...move, destination: { kind: 'new', droneId: destinationId } }), 400);
    await expectResponse(viewer.request(historyPath + '?limit=1&limit=2'), 400);
    await expectResponse(viewer.request(restorablePath.replace('=8', '=255')), 400);
    assert.deepEqual((await read(viewer, historyPath)).items, []);

    const { data: { submissionId } } = await expectResponse(editor.mutate(root + '/command-submissions'), 201);
    await expectResponse(editor.mutate(root + '/commands', {
        submissionId, operation: 'query-value', target: { nodeAddress: 8, channel: 1, param: 1 }
    }), 201);
    assert.deepEqual((await expectResponse(editor.mutate(movePath, move), 200)).data, { sequence: 1, destinationDroneId: destinationId });
    assert.equal((await expectResponse(editor.mutate(movePath, move), 409)).code, 'conflict');
    const grouped = await identities();
    assert.equal(grouped.nodes.find(row => row.address === 8).droneId, destinationId);
    assert.equal(grouped.nodes.find(row => row.address === 9).droneId, relayId);
    assert.equal(grouped.drones.length, 2);

    const candidateResponse = await viewer.request(restorablePath);
    assert.equal(candidateResponse.status, 200, candidateResponse.text);
    assertSafe(candidateResponse);
    assert.equal(candidateResponse.headers.get('cache-control'), 'private, no-store');
    const { data: { items: [former] }, pagination: { nextCursor } } = candidateResponse.json();
    assert.deepEqual(former, { droneId: sourceId, revision: 1, memberAddresses: [8], masterAddress: 8, createdAt: nodes[1].createdAt });
    assert.equal(nextCursor, null);

    const master = { expectedRevision: 1, masterAddress: 8 };
    await expectResponse(viewer.mutate(masterPath, master, 'PUT'), 403);
    assert.equal((await expectResponse(editor.mutate(masterPath, master, 'PUT'), 200)).data.sequence, 2);
    assert.equal((await expectResponse(admin.mutate(masterPath, { ...master, expectedRevision: 2 }, 'PUT'), 200)).data.sequence, null);

    const { data: { credential } } = await expectResponse(admin.mutate(root + '/gateways', { name: 'Separate relay', nodeAddress: 9 }), 201);
    const snapshot = await read(viewer, root + '/observations');
    const relayed = await post(device, '/addPacket', { domain: fleet._id, id: 9, packet: publication(8, 21) }, { Authorization: 'Bearer ' + credential });
    assert.equal(relayed.status, 202, relayed.text);
    let updated = await read(viewer, root + '/observations');
    assert.ok(snapshot.nodes.find(row => row.nodeAddress === 8));
    for (let i = 0; i < 40 && updated.channels.find(row => row.nodeAddress === 8)?.params['1'].value?.payload !== 'FQ=='; i++) {
        await new Promise(resolve => setTimeout(resolve, 25));
        updated = await read(viewer, root + '/observations');
    }
    assert.equal(updated.channels.find(row => row.nodeAddress === 8).params['1'].value.payload, 'FQ==');
    const poll = async peers => (await expectResponse(post(device, '/commands/poll', { domain: fleet._id, apiKey, id: 9, peers, limit: 32 }), 200)).data;
    assert.deepEqual(await poll([]), { count: 0, packets: '' });
    assert.deepEqual(await poll([8]), { count: 1, packets: Buffer.from([9, 8, 1, 1, 112, 0]).toString('base64') });
    await expectResponse(editor.mutate(root + '/nodes/8/reset', { expectedGeneration: 0 }), 200);
    assert.equal((await identities()).nodes.find(row => row.address === 8).droneId, destinationId);

    const restore = { ...move, sourceDroneId: destinationId, expectedSourceRevision: 2, sourceMasterAddress: 7,
        destination: { kind: 'restore', droneId: former.droneId, expectedRevision: former.revision, masterAddress: 8 } };
    assert.deepEqual((await expectResponse(editor.mutate(movePath, restore), 200)).data, { sequence: 3, destinationDroneId: sourceId });
    assert.equal((await identities()).nodes.find(row => row.address === 8).droneId, sourceId);
    assert.deepEqual((await read(viewer, restorablePath)).items, []);

    await expectResponse(admin.mutate(root + '/archive', { revision: (await current(admin, fleet._id)).revision }), 200);
    assert.equal((await expectResponse(editor.mutate(movePath, restore), 409)).code, 'domain-archived');
    const { data: { items }, pagination } = await expectResponse(viewer.request(historyPath + '?limit=2'), 200);
    assert.deepEqual(items.map(row => row.sequence), [3, 2]);
    assert.equal(pagination.nextBeforeSequence, 2);
    const { items: [first] } = await read(viewer, historyPath + '?beforeSequence=2');
    assert.deepEqual(first.before[0], { droneId: sourceId, revision: 0, memberAddresses: [8], masterAddress: 8 });
    assert.deepEqual(first.after[0], { droneId: sourceId, revision: 1, memberAddresses: [], masterAddress: null });
    const { data: packets } = await expectResponse(viewer.request(root + '/messages', {
        headers: { 'X-Observation-Contract': '1' }
    }), 200);
    assert.ok(packets.some(row => row.meta.node === 8 && row.meta.id === 9 && row.origin.kind === 'gateway'));
}, { observations: true, commands: true }));
