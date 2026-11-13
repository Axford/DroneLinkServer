import test from 'node:test';
import assert from 'node:assert/strict';
import createNodeNetwork from '../workbench-network.mjs';

test('returns only the selected node snapshot and rejects evidence across routes or identities', async () => {
  const route = { nextHop: 3, directHelloAddress: '192.168.1.149' };
  const mesh = { fileRoute: () => ({ assertAvailable: () => route }) };
  const payload = { schemaVersion: 1, node: 3,
    interfaces: [{ channel: 2, type: 'UDP', up: true, broadcast: true, ignored: true }],
    routes: [{ destination: 11, nextHop: 11, channel: 2, cost: 3, ageMs: 39 }],
    queue: { size: 12, utilisation: 12.5, kicked: 1, choked: 2, items: ['ignored'] } };
  let requests = 0;
  let changeRoute = false;
  const network = createNodeNetwork(mesh, async (url, options) => {
    requests++;
    assert.equal(url, 'http://192.168.1.149/networkSnapshot');
    assert.equal(options.redirect, 'error');
    if (changeRoute) route.nextHop = 11;
    return Response.json(payload);
  });
  const results = await Promise.all([network('3', 'wifi'), network('3', 'wifi')]);
  assert.equal(requests, 1);
  assert.deepEqual(results[0].routes, payload.routes);
  assert.equal(results[0].interfaces[0].ignored, undefined);
  assert.equal(results[0].queue.items, undefined);
  await assert.rejects(network('3', 'serial'), { status: 503 });
  payload.node = 4;
  await assert.rejects(network('3', 'wifi'), { status: 502 });
  payload.node = 3;
  changeRoute = true;
  await assert.rejects(network('3', 'wifi'), { status: 503 });
});
