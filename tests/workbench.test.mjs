import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hello, launch, publication } from './workbench/harness.mjs';

const packet = [11, 11, 5, 8, 0, 42];

async function openFeed(origin, signal) {
  const response = await fetch(`${origin}/api/workbench/v1/events`, { signal });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  return async () => {
    while (!pending.includes('\n\n')) {
      const { done, value } = await reader.read();
      assert.equal(done, false, 'stream closed before the expected event');
      pending += value;
    }
    const end = pending.indexOf('\n\n');
    const lines = pending.slice(0, end).split('\n');
    pending = pending.slice(end + 2);
    return { event: lines[0].slice(7), payload: JSON.parse(lines[1].slice(6)) };
  };
}

async function buildFixture(t) {
  const build = await mkdtemp(join(tmpdir(), 'dronelink-wb-fixture-'));
  t.after(() => rm(build, { force: true, recursive: true }));
  await mkdir(join(build, 'static'));
  await writeFile(join(build, 'index.html'), '<h1>Workbench fixture</h1>');
  return build;
}

test('workbench serves only the local Client and routes validated UDP telemetry across expiry and restart', { timeout: 12000 }, async t => {
  const build = await buildFixture(t);
  const gateway = await launch(build);
  t.after(() => gateway.close());
  await gateway.ready;
  const { origin } = gateway;
  const browser = await fetch(`${origin}/workbench/`);
  assert.match(await browser.text(), /Workbench fixture/);
  assert.match(browser.headers.get('content-security-policy'), /connect-src 'self'/);
  for (const headers of [{ Host: 'foreign.invalid' }, { Origin: 'https://foreign.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    // http.request permits setting Host explicitly, unlike the browser.
    const path = headers.Host ? '/workbench/' : '/api/workbench/v1/events';
    const status = await new Promise((resolve, reject) => {
      request(`${origin}${path}`, { headers }, response => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject).end();
    });
    assert.equal(status, 403);
  }
  for (const path of ['/routes', '/socket.io/', '/private/', '/api/user']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  }
  assert.equal((await fetch(`${origin}/api/workbench/v1/events`, { method: 'POST' })).status, 405);

  const signal = AbortSignal.timeout(8000);
  const next = await openFeed(origin, signal);
  assert.deepEqual(await next(), { event: 'snapshot', payload: { routes: [] } });
  await hello(gateway);
  const route = await next();
  assert.equal(route.event, 'route');
  assert.deepEqual({ ...route.payload, lastHeardAtMs: 0 }, { node: 11, nextHop: 11, reachable: true, lastHeardAtMs: 0 });
  await publication(gateway, packet, 253);
  await publication(gateway, packet.slice(0, -1));
  await publication(gateway, packet);
  let message;
  do { message = await next(); } while (message.event === 'route');
  assert.equal(message.event, 'observation');
  assert.equal(message.payload.packetBase64, Buffer.from(packet).toString('base64'));
  assert.ok(message.payload.receivedAtMs >= route.payload.lastHeardAtMs);

  gateway.processHandle.send('expire routes');
  let expired;
  do { expired = await next(); } while (expired.payload.reachable !== false);
  const newConnection = await openFeed(origin, signal);
  assert.deepEqual(await newConnection(), { event: 'snapshot', payload: { routes: [] } });
  await gateway.close();
  const restarted = await launch(build, gateway.port, gateway.udpPort);
  t.after(() => restarted.close());
  await restarted.ready;
  assert.deepEqual(await (await openFeed(origin, signal))(), { event: 'snapshot', payload: { routes: [] } });
});

test('workbench reports occupied ports and releases the HTTP listener after UDP startup failure', { timeout: 12000 }, async t => {
  const build = await buildFixture(t);
  const gateway = await launch(build);
  t.after(() => gateway.close());
  await gateway.ready;
  const httpConflict = await launch(build, gateway.port);
  assert.deepEqual(await httpConflict.exited, [1, null]);
  await assert.rejects(httpConflict.ready, /EADDRINUSE/);
  const udpConflict = await launch(build, undefined, gateway.udpPort);
  assert.deepEqual(await udpConflict.exited, [1, null]);
  await assert.rejects(udpConflict.ready, /EADDRINUSE/);
  const recovered = await launch(build, udpConflict.port);
  t.after(() => recovered.close());
  await recovered.ready;
});


test('a stalled workbench subscriber is disconnected while a healthy subscriber keeps receiving', { timeout: 10000 }, async t => {
  const gateway = await launch(await buildFixture(t));
  t.after(() => gateway.close());
  await gateway.ready;
  const signal = AbortSignal.timeout(5000);
  const stalled = await fetch(`${gateway.origin}/api/workbench/v1/events`, { signal, headers: { 'X-Workbench-Test-Stalled': 'yes' } });
  const reader = stalled.body.getReader();
  assert.match(Buffer.from((await reader.read()).value).toString(), /event: snapshot/);
  const healthy = await openFeed(gateway.origin, signal);
  assert.equal((await healthy()).event, 'snapshot');
  await hello(gateway);
  await assert.rejects(reader.read(), /terminated/);
  assert.equal((await healthy()).event, 'route');
  const reconnected = await openFeed(gateway.origin, signal);
  assert.equal((await reconnected()).payload.routes[0].node, 11);
});
