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
  gateway = await launch(build, undefined, undefined, { peerPort: peer.port, connectedConfig, caFile: cert });
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
  await page.getByRole('article', { name: 'Parameter 11>5.8' }).getByText('42').waitFor(timeout);
  await page.getByRole('button', { name: 'Query local value' }).click();
  await page.getByText(/Local query queued/).waitFor(timeout);
  assert.ok(cloudRequests.some(([path, action]) => path.endsWith('/authorize') && action === 'query-value'));
  for (let i = 0; i < 20 && !peer.actions.includes('query'); i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(peer.actions.filter(action => action === 'query').length, 1);
  const standalone = await fetch(`${gateway.origin}/api/workbench/v1/nodes/11/file?transport=wifi&path=%2Fsample.txt`);
  assert.equal(standalone.status, 200);
  assert.equal((await standalone.json()).backup, undefined);
  assert.equal(snapshots.length, 0);
  await page.getByRole('button', { name: 'List files' }).click(timeout);
  await page.getByRole('button', { name: 'sample.txt' }).click(timeout);
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
  const source = page.getByRole('combobox', { name: 'Node source' });
  await source.selectOption('cloud');
  await page.getByRole('button', { name: 'Query local value' }).waitFor({ state: 'detached', ...timeout });
  await source.selectOption('auto');
  canEdit = false;
  await page.getByRole('button', { name: 'Query local value' }).click();
  await page.getByText(/Cloud Workbench access was denied/).waitFor(timeout);
  assert.equal(peer.actions.filter(action => action === 'query').length, 1);
  gatewayRevoked = true;
  await page.getByRole('button', { name: 'Disconnect local gateway' }).waitFor({ state: 'detached', timeout: 24000 });
  console.log(`PASS Chrome ${browser.version()}: actual loopback permission, pairing, local observation, direct mesh query, source override, role denial, verified file backup/retry and editor-only restore`);
} finally {
  await browser?.close();
  await gateway?.close();
  peer?.close();
  site?.close();
  site?.closeAllConnections();
  await rm(dir, { recursive: true, force: true });
}
