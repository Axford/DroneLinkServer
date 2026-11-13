import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hello, launch, publication, serialFrame, serialHello, serialPublication } from './workbench/harness.mjs';

const packet = [11, 11, 5, 8, 0, 42];

async function openFeed(origin, signal, diagnostics = false) {
  const query = diagnostics ? '?diagnostics=1' : '';
  const response = await fetch(`${origin}/api/workbench/v1/events${query}`, { signal });
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
    if (lines[0].startsWith(':')) return { event: 'heartbeat' };
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
  const navigation = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  const navigationStatus = path => new Promise((resolve, reject) => {
    request(`${origin}${path}`, { headers: navigation }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject).end();
  });
  assert.equal(await navigationStatus('/workbench/'), 200);
  assert.equal(await navigationStatus('/api/workbench/v1/events'), 403);
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

async function until(next, event, predicate = () => true) {
  for (;;) {
    const current = await next();
    if (current.event === event && predicate(current.payload)) return current.payload;
  }
}

test('dual workbench receives both transports independently and recovers serial without losing Wi-Fi', { timeout: 25000 }, async t => {
  const gateway = await launch(await buildFixture(t), undefined, undefined, { serialMode: 'dual' });
  t.after(() => gateway.close());
  await gateway.ready;
  const signal = AbortSignal.timeout(22000);
  const next = await openFeed(gateway.origin, signal, true);
  const snapshot = await until(next, 'snapshot');
  assert.deepEqual(snapshot.interfaces.map(({ transport, address }) => ({ transport, address })), [
    { transport: 'wifi', address: 254 }, { transport: 'serial', address: 253 },
  ]);
  if (!snapshot.interfaces[1].up) await until(next, 'interface', status => status.transport === 'serial' && status.up);
  await hello(gateway);
  await until(next, 'route', route => route.transport === 'wifi');
  serialHello(gateway);
  await until(next, 'route', route => route.transport === 'serial');
  await publication(gateway, packet);
  assert.equal((await until(next, 'observation')).transport, 'wifi');
  serialPublication(gateway, [11, 11, 5, 8, 0, 91]);
  assert.equal((await until(next, 'observation')).transport, 'serial');
  const diagnostic = [0xfd, 3, 3, 0, 0, 104, 105, 10, 0xf7];
  serialFrame(gateway, [...diagnostic.slice(0, -1), 0]);
  serialFrame(gateway, diagnostic);
  assert.equal((await until(next, 'diagnostic', item => item.text === 'hi')).text, 'hi');
  const counters = await until(next, 'interface', status => status.transport === 'serial' && status.diagnosticRecords === 1);
  assert.equal(counters.diagnosticRejected, 1);
  assert.equal(counters.rejected, 0);

  gateway.processHandle.send({ serial: 'detach' });
  await until(next, 'interface', status => status.transport === 'serial' && !status.up);
  await until(next, 'path', route => route.transport === 'serial' && !route.reachable);
  await until(next, 'route', route => route.transport === 'wifi' && route.reachable);
  await publication(gateway, packet);
  assert.equal((await until(next, 'observation')).transport, 'wifi');
  await until(next, 'interface', status => status.transport === 'serial' && status.up);
  // Port reopen alone cannot resurrect an old route.
  const afterOpen = await until(await openFeed(gateway.origin, signal, true), 'snapshot');
  assert.deepEqual(afterOpen.paths.map(path => path.transport), ['wifi']);
  serialHello(gateway);
  await until(next, 'route', route => route.transport === 'serial' && route.reachable);
  serialPublication(gateway, packet);
  assert.equal((await until(next, 'observation')).transport, 'serial');
});

test('serial-only mode runs without a UDP bind and rejects duplicate mesh addresses in dual mode', { timeout: 10000 }, async t => {
  const build = await buildFixture(t);
  const wifi = await launch(build);
  t.after(() => wifi.close());
  await wifi.ready;
  const serial = await launch(build, undefined, wifi.udpPort, { serialMode: 'only' });
  t.after(() => serial.close());
  await serial.ready;
  const next = await openFeed(serial.origin, AbortSignal.timeout(6000), true);
  const { interfaces } = await until(next, 'snapshot');
  assert.deepEqual(interfaces.map(({ transport, address }) => ({ transport, address })), [{ transport: 'serial', address: 254 }]);
  if (!interfaces[0].up) await until(next, 'interface', status => status.up);
  serialHello(serial);
  await until(next, 'route', route => route.transport === 'serial');
  serialPublication(serial, packet, 254);
  assert.equal((await until(next, 'observation')).transport, 'serial');
  const invalid = await launch(build, undefined, undefined, { serialMode: 'dual', serialAddress: 254 });
  await assert.rejects(invalid.ready, /different mesh addresses/);
  assert.deepEqual(await invalid.exited, [1, null]);
});

test('node file API verifies uploads, protects stale and scratch files, and queues Restart separately', { timeout: 20000 }, async t => {
  const { filePeer } = await import('./workbench/file-peer.mjs');
  const peer = await filePeer();
  t.after(() => peer.close());
  const gateway = await launch(await buildFixture(t), undefined, undefined, { peerPort: peer.port });
  t.after(() => gateway.close());
  await gateway.ready;
  const feed = await openFeed(gateway.origin, AbortSignal.timeout(18000));
  await until(feed, 'snapshot');
  peer.hello(gateway);
  await until(feed, 'route');
  const base = `${gateway.origin}/api/workbench/v1/nodes/11`;
  const url = (endpoint, path) => `${base}/${endpoint}?transport=wifi${path === undefined ? '' : `&path=${encodeURIComponent(path)}`}`;
  const mutate = (endpoint, method, body, origin = gateway.origin) => fetch(url(endpoint), {
    method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const list = await (await fetch(url('files', '/'))).json();
  assert.deepEqual(list.entries.map(entry => entry.path), ['/nested', '/sample.txt']);
  const nested = await (await fetch(url('files', '/nested'))).json();
  assert.deepEqual(nested.entries.map(entry => entry.path), ['/nested/test.txt']);
  const storedResponse = await fetch(url('file', '/sample.txt'));
  assert.equal(storedResponse.headers.get('cache-control'), 'no-store');
  const stored = await storedResponse.json();
  assert.equal(stored.text, 'First line\r\n');
  assert.equal((await fetch(url('file', '/../sample.txt'))).status, 400);
  const text = 'Verified from Workbench '.repeat(3) + '\r\n';
  const upload = { path: stored.path, revision: stored.revision, text };
  assert.equal((await mutate('file', 'PUT', upload, 'https://other.invalid')).status, 403);
  assert.equal((await fetch(url('restart'), { method: 'POST', body: '{}' })).status, 403);
  peer.files.set('/backup.txt', Buffer.from('Existing scratch'));
  assert.equal((await mutate('file', 'PUT', upload)).status, 409);
  assert.deepEqual(peer.actions, []);
  peer.files.delete('/backup.txt');
  peer.loseSaveReply();
  const saving = mutate('file', 'PUT', upload);
  for (let i = 0; i < 60 && !peer.actions.includes('save'); i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(peer.actions.includes('save'));
  assert.equal((await mutate('restart', 'POST', {})).status, 409);
  const saved = await saving;
  assert.equal(saved.status, 200);
  const verified = await saved.json();
  assert.equal(verified.text, text);
  assert.equal(peer.files.get('/sample.txt').toString(), text);
  assert.deepEqual(peer.actions, ['start', 'block', 'block', 'block', 'save']);
  assert.equal((await mutate('file', 'PUT', upload)).status, 409);
  peer.rejectBlock();
  assert.equal((await mutate('file', 'PUT', { ...upload, revision: verified.revision, text: 'new draft' })).status, 502);
  assert.deepEqual(peer.actions.slice(-3), ['start', 'block', 'cancel']);
  assert.equal(peer.files.get('/sample.txt').toString(), text);
  const restarted = await mutate('restart', 'POST', {});
  assert.equal(restarted.status, 202);
  assert.deepEqual(await restarted.json(), { status: 'queued' });
  for (let i = 0; i < 20 && peer.actions.at(-1) !== 'restart'; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(peer.actions.at(-1), 'restart');
});
