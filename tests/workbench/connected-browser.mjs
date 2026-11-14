import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { filePeer } from './file-peer.mjs';
import { launch, publication } from './harness.mjs';

const build = process.env.CLIENT_BUILD_DIR;
// Optional full catalogue acceptance against prepared SEP-05 release 739fc899… (build c017040).
const catalogueFixture = process.env.WORKBENCH_CATALOGUE_FIXTURE;
if (catalogueFixture) {
  const { verifyRelease } = await import('../../scripts/release.mjs');
  assert.equal(verifyRelease(catalogueFixture).identity, '739fc899479974550361f72c86c3d3c6a5570d102c660e38c2d704df653f21ff');
}
if (!build) throw new Error('Set CLIENT_BUILD_DIR to the verified Client build');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const dir = await mkdtemp(join(tmpdir(), 'workbench-connected-'));
const gatewayCredential = `gateway.${'A'.repeat(43)}`;
const domain = { _id: 'bench', name: 'Bench Domain', status: 'active', canEdit: true };
const cloudRequests = [];
let canEdit = true;
let gatewayRevoked = false;
let backupUnavailable = false;
const snapshots = [];
let cloudFile = { path: '/config.ini', text: 'node = 11\r\n[Nav = 12]\r\n$location = @>10.9\r\n[NMEA = 10]\r\n',
  modifiedAt: '2026-11-13T09:20:00.000Z', revision: 'a'.repeat(64) };
let gateway, peer, browser, site;
try {
  const cert = join(dir, 'cert');
  const key = join(dir, 'key');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  const assets = await readFile(join(build, 'asset-manifest.json'), 'utf8').then(JSON.parse);
  const publicFiles = new Set(Object.values(assets.files));
  site = createServer({ key: await readFile(key), cert: await readFile(cert) }, async (req, res) => {
    const pathname = new URL(req.url, 'https://127.0.0.1').pathname;
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    const success = data => json(200, { success: true, data });
    if (pathname.startsWith('/private/')) {
      res.setHeader('Content-Security-Policy', "connect-src 'self' http://127.0.0.1:*; upgrade-insecure-requests");
      return res.end(await readFile(join(build, 'index.html')));
    }
    if (publicFiles.has(pathname)) {
      if (pathname.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
      if (pathname.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
      return res.end(await readFile(join(build, pathname)));
    }
    if (pathname === '/api/user') return json(200, { _id: 'operator', displayName: 'Operator', email: 'operator@example.test' });
    if (pathname === '/api/config') return success({});
    if (pathname === '/api/session') return success({ csrfToken: 'fixture' });
    if (pathname === '/api/domains/bench') return success({ ...domain, canEdit });
    if (pathname === '/api/domains/bench/workbench-grant') return success({ grant: 'a'.repeat(64), expiresAt: Date.now() + 300000 });
    if (pathname === '/api/domains/bench/nodes/11/cloud-files') {
      if (!canEdit) return json(403, {});
      if (req.method === 'PUT') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const { path, text, revision } = JSON.parse(Buffer.concat(chunks));
        if (path !== cloudFile.path || revision !== cloudFile.revision) return json(409, {});
        cloudFile = { ...cloudFile, text, modifiedAt: '2026-11-13T11:20:00.000Z', revision: 'b'.repeat(64) };
        return success(cloudFile);
      }
      const query = new URL(req.url, 'https://127.0.0.1').searchParams;
      if (query.has('path')) return success(cloudFile);
      return success([{ path: cloudFile.path, modifiedAt: cloudFile.modifiedAt }]);
    }
    if (pathname === '/api/domains/bench/nodes/11/file-backups') {
      return success(snapshots.map(({ text, ...version }) => version));
    }
    if (pathname === '/api/domains/bench/nodes/11/file-backups/first') return success(snapshots[0]);
    const received = new Date().toISOString();
    const nodes = [{ nodeAddress: 12, generation: 0, revision: 1, resetAt: null, droneId: 'cloud-drone', lastReceivedAt: received }];
    const channels = [{ nodeAddress: 12, generation: 0, revision: 1, channel: 5, lastReceivedAt: received, params: { 8: { value: {
      payload: Buffer.from([99]).toString('base64'), msgType: 0, writable: false,
      lastReceivedAt: received, valueLastChangedAt: received, origin: { kind: 'http', forwarderAddress: 12, sourceAddress: 12 },
    } } } }];
    if (pathname === '/api/domains/bench/observations') return json(200, { data: { schemaVersion: 1, activationEpoch: 'm1-c-1', startCursor: 'a', catchUpCursor: 'b', nodes, channels }, pagination: { nextCursor: null } });
    if (pathname === '/api/domains/bench/observations/updates') {
      const timeout = new URL(req.url, 'https://127.0.0.1').searchParams.get('timeoutMs');
      if (timeout !== '0') await new Promise(resolve => setTimeout(resolve, 500));
      return success({ events: [], cursor: 'b', caughtUp: true });
    }
    if (pathname === '/gateway/verify' || pathname === '/gateway/workbench/authorize' || pathname === '/addPacket' || pathname === '/gateway/workbench/file-backups') {
      if (req.headers.authorization !== `Bearer ${gatewayCredential}` || gatewayRevoked) return json(401, {});
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      if (body.domain !== 'bench' || body.id !== 254) return json(401, {});
      cloudRequests.push([pathname, body.action]);
      if (pathname === '/gateway/verify') return success({ domainId: 'bench', nodeAddress: 254, capabilities: ['telemetry', 'file-backup'] });
      if (pathname === '/gateway/workbench/file-backups') {
        if (backupUnavailable) return json(503, {});
        snapshots.push({ id: snapshots.length ? 'second' : 'first', text: body.text, savedAt: new Date().toISOString() });
        return success({ status: 'saved' });
      }
      if (pathname === '/addPacket') return json(202, {});
      if (body.grant !== 'a'.repeat(64) || (body.action !== 'observe' && !canEdit)) return json(403, {});
      return success({ domainId: 'bench', canQuery: canEdit });
    }
    json(404, {});
  });
  site.listen(0, '127.0.0.1');
  await once(site, 'listening');
  const port = site.address().port;
  const origin = `https://127.0.0.1:${port}`;
  const connectedConfig = join(dir, 'gateway.json');
  await writeFile(connectedConfig, JSON.stringify({ origin, domain: 'bench', credentials: { wifi: gatewayCredential } }));
  peer = await filePeer();
  const configuration = 'node = 11\n[Nav = 12]\n$location = @>10.8\n[NMEA = 10]\n';
  peer.files.set('/config.ini', Buffer.from(configuration));
  gateway = await launch(build, undefined, undefined, { peerPort: peer.port, connectedConfig, caFile: cert, catalogueFixture });
  await gateway.ready;
  for (let i = 0; i < 25 && !gateway.pairingKey(); i++) await new Promise(resolve => setTimeout(resolve, 20));
  const pairingKey = gateway.pairingKey();
  assert.ok(pairingKey);
  const identity = `${gateway.origin}/api/workbench/v1/connected/identity`;
  assert.equal((await fetch(identity, { headers: { Origin: 'https://unrelated.invalid', 'X-Workbench-Key': pairingKey } })).status, 403);
  assert.equal((await fetch(identity, { headers: { Origin: origin, 'X-Workbench-Key': 'a'.repeat(24) } })).status, 403);

  browser = await chromium.launch({ channel: 'chrome', headless: true, args: [`--ip-address-space-overrides=127.0.0.1:${port}=public`] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await browser.newBrowserCDPSession();
  const { browserContextIds } = await cdp.send('Target.getBrowserContexts');
  const permission = { permission: { name: 'loopback-network' }, origin, browserContextId: browserContextIds[0] };
  const timeout = { timeout: 8000 };
  await page.goto(`${origin}/private/domain/bench`);
  await page.getByRole('button', { name: 'Connect local gateway' }).click(timeout);
  const pair = async () => {
    await page.getByLabel('Gateway port').fill(new URL(gateway.origin).port);
    await page.getByLabel('Pairing key').fill(pairingKey);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
  };
  await cdp.send('Browser.setPermission', { ...permission, setting: 'denied' });
  await pair();
  await page.getByText(/Could not reach the local gateway/).waitFor(timeout);
  assert.ok(!cloudRequests.some(([path]) => path.endsWith('/authorize')));
  await cdp.send('Browser.setPermission', { ...permission, setting: 'granted' });
  await pair();
  await page.getByText('Local gateway connected', { exact: true }).waitFor(timeout);
  peer.hello(gateway);
  await page.getByRole('button', { name: /Inspect node 12/ }).press('Enter', timeout);
  await page.getByText('Cloud observation', { exact: true }).first().waitFor(timeout);
  await page.getByRole('button', { name: /Inspect node 11/ }).press('Enter', timeout);
  await publication(gateway, [11, 11, 5, 8, 0, 42]);
  await page.getByRole('article', { name: 'Parameter 11>5.8' }).getByText('42', { exact: true }).waitFor(timeout);
  await page.getByRole('button', { name: 'Query local value' }).click();
  await page.getByText(/Local query queued/).waitFor(timeout);
  assert.ok(cloudRequests.some(([path, action]) => path.endsWith('/authorize') && action === 'query-value'));
  for (let i = 0; i < 20 && !peer.actions.includes('query'); i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(peer.actions.filter(action => action === 'query').length, 1);
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  await page.getByRole('button', { name: 'Trace route', exact: true }).click(timeout);
  await page.getByRole('region', { name: 'Route trace' }).getByText(/Node 11 · Wi-Fi · \d+ ms round trip/).waitFor(timeout);
  assert.equal(peer.actions.filter(action => action === 'trace').length, 1);
  const standalone = await fetch(`${gateway.origin}/api/workbench/v1/nodes/11/file?transport=wifi&path=%2Fsample.txt`);
  assert.equal(standalone.status, 200);
  assert.equal((await standalone.json()).backup, undefined);
  assert.equal(snapshots.length, 0);
  await page.getByRole('tab', { name: 'Files' }).click();
  await page.getByRole('button', { name: 'Full-window inspector' }).click();
  await page.getByRole('button', { name: 'List files' }).click(timeout);
  await page.getByRole('button', { name: /^sample.txt/ }).click(timeout);
  const editor = page.getByRole('textbox', { name: /Stored file/ });
  const original = await editor.inputValue(timeout);
  await page.getByText('Cloud backup saved', { exact: true }).waitFor(timeout);
  assert.equal(snapshots.length, 1);
  backupUnavailable = true;
  await editor.fill('Changed in connected Workbench\n');
  assert.equal(snapshots.length, 1);
  await page.getByRole('button', { name: 'Upload to node' }).click();
  await page.getByText(/Stored file verified by readback/).waitFor(timeout);
  await page.getByText(/Cloud backup pending/).waitFor(timeout);
  assert.equal(peer.files.get('/sample.txt').toString(), 'Changed in connected Workbench\r\n');
  backupUnavailable = false;
  await page.getByText('Cloud backup saved', { exact: true }).waitFor({ timeout: 16000 });
  await page.getByRole('button', { name: 'Backup history' }).click();
  await page.getByRole('button', { name: /Load backup/ }).first().click(timeout);
  await page.getByText(/Backup loaded into the editor/).waitFor(timeout);
  assert.equal(await editor.inputValue(), original);
  assert.equal(peer.files.get('/sample.txt').toString(), 'Changed in connected Workbench\r\n');
  assert.equal(peer.actions.filter(action => action === 'restart').length, 0);
  await page.getByRole('button', { name: 'Upload to node' }).click();
  await page.getByText(/Stored file verified by readback/).waitFor(timeout);
  assert.equal(peer.files.get('/sample.txt').toString().replaceAll('\r\n', '\n'), original);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Browse files' }).click();
  const picker = page.getByRole('dialog', { name: 'Files' });
  await picker.getByRole('button', { name: 'Cloud', exact: true }).click();
  const modified = picker.locator('time');
  await modified.waitFor(timeout);
  assert.equal(await modified.getAttribute('datetime'), cloudFile.modifiedAt);
  assert.match(await modified.textContent(), /\d{1,2}:\d{2}/);
  await picker.getByRole('button', { name: /config.ini/ }).click();
  await picker.waitFor({ state: 'hidden', ...timeout });
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  const ace = page.locator('.ace_editor');
  await ace.locator('.ace_support.ace_class').first().waitFor(timeout);
  await ace.locator('.ace_content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Home' : 'Control+Home');
  await page.keyboard.insertText('; Cloud edit\n');
  await page.getByRole('button', { name: 'Save to Cloud' }).click();
  await page.getByText('Saved to Cloud.', { exact: true }).waitFor(timeout);
  assert.match(cloudFile.text, /; Cloud edit/);
  assert.equal(peer.files.get('/config.ini').toString(), configuration);
  await page.getByRole('button', { name: 'Load into node draft…' }).click();
  await page.getByText(/Cloud file loaded into the draft/).waitFor(timeout);
  assert.equal(peer.files.get('/config.ini').toString(), configuration);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('tab', { name: 'Modules' }).click();
  const source = page.getByRole('combobox', { name: 'Node source' });
  await source.selectOption('cloud');
  await page.getByRole('button', { name: 'Query local value' }).waitFor({ state: 'detached', ...timeout });
  await source.selectOption('auto');
  await page.getByRole('tab', { name: 'Files' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Open node configuration' }).click();
  const graph = page.getByRole('region', { name: 'Subscription graph' });
  await graph.locator('.react-flow__edge-path').waitFor({ state: 'attached', ...timeout });
  await graph.getByRole('button', { name: '$location', exact: true }).click(timeout);
  await page.getByRole('textbox', { name: 'Source for $location' }).fill('@>10.9');
  await page.getByRole('button', { name: 'Update draft' }).click();
  assert.equal(peer.files.get('/config.ini').toString(), configuration);
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  const code = page.getByRole('textbox', { name: 'Stored file /config.ini' });
  const readCode = () => code.evaluate(input => input.closest('.ace_editor').env.editor.getValue());
  await code.waitFor(timeout);
  assert.equal(await readCode(), configuration.replace('@>10.8', '@>10.9'));
  await code.focus();
  await code.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(configuration);
  await page.getByRole('button', { name: 'Logical', exact: true }).click();
  await page.getByText('@>10.8', { exact: true }).waitFor(timeout);
  await page.getByRole('button', { name: 'Edit source for $location on channel 12' }).click();
  await page.getByRole('textbox', { name: 'Source for $location' }).fill('@>10.9');
  await page.getByRole('button', { name: 'Update draft' }).click();
  if (catalogueFixture) {
    const headers = { Origin: origin, 'X-Workbench-Key': pairingKey, 'X-Workbench-Grant': 'a'.repeat(64) };
    const endpoint = `${gateway.origin}/api/workbench/v1/connected/nodes/11/network?transport=wifi`;
    canEdit = false;
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      response = await fetch(endpoint, { headers });
      if (response.ok) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(response.status, 200);
    assert.equal((await response.json()).node, 11);
    assert.equal((await fetch(endpoint, { headers: { ...headers, 'X-Workbench-Grant': 'b'.repeat(64) } })).status, 403);
    canEdit = true;
    console.log('PASS connected network snapshot honors observation grants independently of edit access');
  }
  const writes = peer.actions.filter(action => action === 'start').length;
  if (catalogueFixture) {
    await page.getByRole('button', { name: 'Add module', exact: true }).click();
    const catalogue = page.getByRole('dialog', { name: 'Add module' });
    await catalogue.getByRole('searchbox').fill('pilot');
    await catalogue.getByRole('button', { name: 'Add Pilot' }).click(timeout);
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    assert.equal(await readCode(), configuration.replace('@>10.8', '@>10.9') + '\n[Nav = 2]\n  name = Pilot\n');
    await page.getByRole('button', { name: 'Logical', exact: true }).click();
    await graph.getByRole('button', { name: 'Pilot', exact: true }).waitFor(timeout);
    await page.getByRole('button', { name: 'Physical', exact: true }).click();
    await page.getByLabel('Motherboard').selectOption('v4');
    const physical = page.getByRole('region', { name: 'Physical wiring graph' });
    await page.getByRole('button', { name: 'Scan I²C' }).click(timeout);
    await page.getByText(/7\/8 channels complete/).waitFor(timeout);
    canEdit = false;
    await page.getByRole('button', { name: 'Scan I²C' }).click(timeout);
    await page.getByRole('alert').filter({ hasText: /Cloud Workbench access was denied/ }).waitFor(timeout);
    canEdit = true;
    await physical.getByRole('group', { name: 'Serial 1 RX · GPIO 13 to NMEA' }).waitFor({ state: 'attached', ...timeout });
    await page.getByLabel('Find wired module').selectOption('10');
    await page.getByLabel('GPS serial port').selectOption('2');
    await physical.getByRole('group', { name: 'Serial 2 RX · GPIO 16 to NMEA' }).waitFor({ state: 'attached', ...timeout });
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    assert.match(await readCode(), /\[NMEA = 10\]\n  port = 2/);
    await page.getByRole('button', { name: 'Logical', exact: true }).click();
  }
  canEdit = false;
  const traceEndpoint = `${gateway.origin}/api/workbench/v1/connected/nodes/11/trace-route?transport=wifi`;
  const deniedTrace = await fetch(traceEndpoint, {
    method: 'POST', body: '{}', headers: { Origin: origin, 'Content-Type': 'application/json',
      'X-Workbench-Key': pairingKey, 'X-Workbench-Grant': 'a'.repeat(64) },
  });
  assert.equal(deniedTrace.status, 403);
  assert.equal(peer.actions.filter(action => action === 'trace').length, 1);

  if (catalogueFixture) {
    await page.getByRole('button', { name: 'Add module', exact: true }).click();
    const catalogue = page.getByRole('dialog', { name: 'Add module' });
    await catalogue.getByText(/Module support on this node is unknown/).waitFor(timeout);
    assert.equal(await catalogue.getByRole('button', { name: 'Add GPS' }).count(), 0);
    await catalogue.getByRole('button', { name: 'Close Add module' }).click();
    console.log('PASS connected catalogue, Logical append and current role denial');
  }
  await page.getByRole('button', { name: 'Upload to node' }).click();
  await page.getByRole('alert').filter({ hasText: /Cloud Workbench access was denied/ }).waitFor(timeout);
  assert.equal(peer.actions.filter(action => action === 'start').length, writes);
  assert.equal(peer.files.get('/config.ini').toString(), configuration);
  await page.getByRole('tab', { name: 'Modules' }).click();
  await page.getByRole('button', { name: 'Query local value' }).click();
  await page.getByRole('tabpanel', { name: 'Modules' }).getByRole('alert').filter({ hasText: /Cloud Workbench access was denied/ }).waitFor(timeout);
  assert.equal(peer.actions.filter(action => action === 'query').length, 1);
  gatewayRevoked = true;
  await page.getByRole('button', { name: 'Disconnect local gateway' }).waitFor({ state: 'detached', timeout: 24000 });
  console.log(`PASS Chrome ${browser.version()}: actual loopback permission, pairing, local observation, direct mesh query, source override, query and configuration upload role denial, verified file backup/retry and editor-only restore`);
} finally {
  await browser?.close();
  await gateway?.close();
  peer?.close();
  site?.close();
  site?.closeAllConnections();
  await rm(dir, { recursive: true, force: true });
}
