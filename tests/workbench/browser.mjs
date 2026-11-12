import assert from 'node:assert/strict';
import { filePeer } from './file-peer.mjs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { hello, launch, publication, serialFrame, serialHello, serialPublication } from './harness.mjs';

const build = process.env.CLIENT_BUILD_DIR;
if (!build || !isAbsolute(build)) throw new Error('Select a verified Client build with CLIENT_BUILD_DIR');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const packet = value => [11, 11, 5, 8, 0, value];
const first = await launch(build);
let gateway = first;
let browser;
let peer;
try {
  await gateway.ready;
  browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext();
  const offOrigin = [];
  const apiRequests = [];
  const errors = [];
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== first.origin) {
      offOrigin.push(url.origin);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) apiRequests.push([request.method(), url.pathname]);
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const timeout = { timeout: 8000 };
  const connected = page.getByText('Local gateway connected', { exact: true });
  const waitForPublication = page.getByText('Waiting for publications.');
  const row = page.getByRole('article', { name: 'Parameter 11>5.8' });

  await page.goto(`${first.origin}/workbench/`);
  await connected.waitFor(timeout);
  await hello(gateway);
  await page.getByRole('button', { name: /Node 11 · Reachable/ }).click(timeout);
  await waitForPublication.waitFor(timeout);
  await publication(gateway, packet(42));
  await row.getByText('42', { exact: true }).waitFor(timeout);
  await row.getByText(/Local ·/).waitFor(timeout);
  assert.ok(await row.locator('time').getAttribute('datetime'));

  gateway.processHandle.send('expire routes');
  await page.getByText('Node 11 · Local · Wi-Fi · Last seen').waitFor(timeout);
  await hello(gateway);
  await waitForPublication.waitFor(timeout);
  await publication(gateway, packet(43));
  await row.getByText('43', { exact: true }).waitFor(timeout);

  await gateway.close();
  await page.getByText(/Local gateway disconnected/).waitFor(timeout);
  gateway = await launch(build, first.port, first.udpPort);
  await gateway.ready;
  await connected.waitFor(timeout);
  await hello(gateway);
  await waitForPublication.waitFor(timeout);
  await publication(gateway, packet(44));
  await row.getByText('44', { exact: true }).waitFor(timeout);

  await page.reload();
  await page.getByRole('button', { name: /Node 11 · Reachable/ }).click(timeout);
  await waitForPublication.waitFor(timeout);
  await publication(gateway, packet(45));
  await row.getByText('45', { exact: true }).waitFor(timeout);
  assert.deepEqual(offOrigin, []);
  assert.ok(apiRequests.length >= 3);
  for (const request of apiRequests) assert.deepEqual(request, ['GET', '/api/workbench/v1/events']);
  assert.deepEqual(errors, []);
  console.log(`PASS Chrome ${browser.version()}: local typed values, independent route and gateway recovery, reload, zero off-origin requests`);

  await page.close();
  await gateway.close();
  gateway = await launch(build, first.port, first.udpPort, { serialMode: 'dual' });
  await gateway.ready;
  const dual = await context.newPage();
  dual.on('pageerror', error => errors.push(error.message));
  await dual.goto(`${first.origin}/workbench/`);
  await dual.getByText('Serial · Up', { exact: true }).waitFor(timeout);
  await hello(gateway);
  serialHello(gateway);
  await dual.getByRole('button', { name: /Node 11 · Reachable/ }).click(timeout);
  await dual.getByText('Node 11 · Local · Serial', { exact: true }).waitFor(timeout);
  await publication(gateway, packet(46));
  serialPublication(gateway, packet(90));
  serialFrame(gateway, [0xfd, 3, 3, 0, 0, 104, 105, 10, 0xf7]);
  const serialRow = dual.getByRole('article', { name: 'Parameter 11>5.8' });
  await serialRow.getByText('90', { exact: true }).waitFor(timeout);
  await dual.getByRole('list', { name: 'Recent serial messages' }).getByText('hi').waitFor(timeout);
  const selector = dual.getByRole('combobox', { name: 'Transport' });
  await selector.selectOption('serial');
  await dual.getByText(/Hidden by transport selection/).waitFor(timeout);
  gateway.processHandle.send({ serial: 'detach' });
  await dual.getByText('Node 11 · Local · Serial · Last seen', { exact: true }).waitFor(timeout);
  await serialRow.getByText('90', { exact: true }).waitFor(timeout);
  await selector.selectOption('auto');
  await dual.getByText('Node 11 · Local · Wi-Fi', { exact: true }).waitFor(timeout);
  await serialRow.getByText('46', { exact: true }).waitFor(timeout);
  await dual.getByText('Serial · Up', { exact: true }).waitFor({ timeout: 14000 });
  serialHello(gateway);
  await dual.getByText('Waiting for publications.').waitFor(timeout);
  serialPublication(gateway, packet(91));
  await serialRow.getByText('91', { exact: true }).waitFor(timeout);
  assert.deepEqual(offOrigin, []);
  assert.deepEqual(errors, []);
  console.log(`PASS Chrome ${browser.version()}: dual receipts, diagnostic text, pinned stale state, Auto failover and fresh serial recovery`);

  await dual.close();
  await gateway.close();
  peer = await filePeer();
  gateway = await launch(build, first.port, first.udpPort, { peerPort: peer.port });
  await gateway.ready;
  const files = await context.newPage();
  files.on('pageerror', error => errors.push(error.message));
  await files.goto(`${first.origin}/workbench/`);
  await files.getByText('Wi-Fi · Up', { exact: true }).waitFor(timeout);
  peer.hello(gateway);
  await files.getByRole('button', { name: /Node 11 · Reachable/ }).click(timeout);
  await files.getByRole('button', { name: 'List files' }).click();
  await files.getByRole('button', { name: 'sample.txt' }).click(timeout);
  const editor = files.getByRole('textbox', { name: /Stored file/ });
  assert.equal(await editor.inputValue(timeout), 'First line\n');
  await editor.fill('Edited in the Workbench\n');
  await files.getByRole('button', { name: 'Upload to node' }).click();
  await files.getByText(/Stored file verified by readback/).waitFor(timeout);
  assert.equal(peer.files.get('/sample.txt').toString(), 'Edited in the Workbench\r\n');
  assert.deepEqual(peer.actions, ['start', 'block', 'save']);
  files.once('dialog', dialog => dialog.accept());
  await files.getByRole('button', { name: 'Restart node' }).click();
  await files.getByText(/Restart requested/).waitFor(timeout);
  for (let i = 0; i < 20 && peer.actions.at(-1) !== 'restart'; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(peer.actions.at(-1), 'restart');
  assert.deepEqual(offOrigin, []);
  assert.deepEqual(errors, []);
  console.log(`PASS Chrome ${browser.version()}: open stored file, upload byte-exact readback and separate confirmed Restart`);


} finally {
  await browser?.close();
  await gateway.close();
  peer?.close();
}
