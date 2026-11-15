import assert from 'node:assert/strict';
import test from 'node:test';
import createMotherboardReader from '../workbench-motherboard.mjs';

test('projects the selected node boot result with a bounded, direct Wi-Fi read', async () => {
  let route = { nextHop: 11, directHelloAddress: '192.168.1.22' };
  const mesh = { fileRoute: () => ({ assertAvailable: () => route }) };
  let calls = 0;
  let reply = () => Response.json({ schemaVersion: 1, node: 11, version: 4 });
  const read = createMotherboardReader(mesh, async (url, options) => {
    assert.equal(url, 'http://192.168.1.22/motherboard');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    calls++;
    return reply();
  });
  const v4 = { schemaVersion: 1, node: 11, version: 4 };
  assert.deepEqual(await Promise.all([read('11', 'wifi'), read('11', 'wifi')]), [v4, v4]);
  assert.equal(calls, 1);

  await assert.rejects(read('11', 'serial'), { status: 503 });
  await assert.rejects(read('0', 'wifi'), { status: 400 });
  route = { ...route, nextHop: 12 };
  await assert.rejects(read('11', 'wifi'), { status: 503 });
  assert.equal(calls, 1);

  route = { ...route, nextHop: 11 };
  reply = () => Response.json({ ...v4, version: 0 });
  assert.deepEqual(await read('11', 'wifi'), { ...v4, version: 0 });
  for (const invalid of [{ node: 12 }, { schemaVersion: 2 }, { version: '4' }, { version: 3 }]) {
    reply = () => Response.json({ ...v4, ...invalid });
    await assert.rejects(read('11', 'wifi'), { status: 502 });
  }
  reply = () => new Response(null, { status: 404 });
  await assert.rejects(read('11', 'wifi'), { status: 503 });

  reply = () => {
    route = { ...route, nextHop: 12 };
    return Response.json(v4);
  };
  await assert.rejects(read('11', 'wifi'), { status: 503, message: /route changed/ });
});
