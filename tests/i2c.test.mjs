import test from 'node:test';
import assert from 'node:assert/strict';
import createI2cDiagnostics from '../workbench-i2c.mjs';

test('checks route, device and job identities before returning channel evidence', async () => {
  const route = { nextHop: 3, directHelloAddress: '192.168.1.149' };
  const mesh = { fileRoute: () => ({ assertAvailable: () => route }) };
  let wrongJob = false;
  let changeRoute = false;
  const service = createI2cDiagnostics(mesh, async (url, { method, redirect }) => {
    assert.equal(redirect, 'error');
    const target = new URL(url);
    assert.equal(target.pathname, '/i2cDiagnostic');
    if (method === 'POST') {
      assert.equal(target.searchParams.get('node'), '3');
      return Response.json({ schemaVersion: 1, node: 3, job: 22 }, { status: 202 });
    }
    assert.equal(target.searchParams.get('job'), '22');
    if (changeRoute) route.nextHop = 8;
    return Response.json({ schemaVersion: 1, node: 3, job: wrongJob ? 23 : 22, multiplexer: 0x77,
      channels: Array.from({ length: 8 }, (_, channel) => ({ channel,
        status: channel === 3 ? 'selection-failed' : 'complete',
        addresses: channel === 1 || channel === 5 ? [64] : [] })),
    });
  });
  const result = await service.scan('3', 'wifi', {});
  assert.deepEqual(result.channels[1].addresses, [64]);
  assert.deepEqual(result.channels[5].addresses, [64]);
  assert.equal(result.channels[3].status, 'selection-failed');
  wrongJob = true;
  await assert.rejects(service.scan('3', 'wifi', {}), { status: 502 });
  wrongJob = false;
  changeRoute = true;
  await assert.rejects(service.scan('3', 'wifi', {}), { status: 503 });
  assert.throws(() => service.register('3', 'wifi', { channel: 1, address: 64, register: 2, length: 2 }), { status: 400 });
});
