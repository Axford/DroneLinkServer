import { DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_CHAR } from '../../public/modules/droneLinkMsg.mjs';
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
  page.on('console', message => {
    if (message.type() === 'error' && /access token|Workbench map rendering failed/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  const timeout = { timeout: 8000 };
  const connected = page.getByText('Local gateway connected', { exact: true });
  const waitForPublication = page.getByText('Waiting for publications.');
  const row = page.getByRole('article', { name: 'Parameter 11>5.8' });

  await page.goto(`${first.origin}/workbench/`);
  await connected.waitFor(timeout);
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  assert.equal(await nav.getByRole('link', { name: 'Workbench' }).getAttribute('aria-current'), 'page');
  await page.getByRole('heading', { name: 'Workbench', exact: true }).waitFor(timeout);
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

  // Exercise the real map without making network calls to the tile provider.
  const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACv0lEQVR4nO3TMQ0AMAzAsMIejT3DOxg9YskA8mTOfZA16wWwyACkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSPvL1BhSjgDtrAAAAABJRU5ErkJggg==', 'base64');
  await page.route('https://tile.openstreetmap.org/**', request => request.fulfill({
    contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: tile,
  }));
  const payload = Buffer.alloc(12);
  [-1.804, 51.575, 0].forEach((value, index) => payload.writeFloatLE(value, index * 4));
  const type = Buffer.from('NMEA');
  await publication(gateway, [11, 11, 10, 5, (DRONE_LINK_MSG_TYPE_CHAR << 4) | (type.length - 1), ...type]);
  await publication(gateway, [11, 11, 10, 8, (DRONE_LINK_MSG_TYPE_FLOAT << 4) | (payload.length - 1), ...payload]);
  const tileRequest = page.waitForRequest('https://tile.openstreetmap.org/**', timeout);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await tileRequest;
  await page.locator('.maplibregl-canvas').waitFor(timeout);
  const canvas = page.locator('.dw-map-canvas');
  const lens = page.locator('.dw-map');
  const cards = page.getByRole('region', { name: 'Observed nodes' });
  const inspectorPanel = page.getByRole('region', { name: 'Node Inspector' });
  const separator = page.getByRole('separator');
  assert.ok((await canvas.boundingBox()).width > (await lens.boundingBox()).width);
  const cardBox = await cards.boundingBox();
  const lensBox = await lens.boundingBox();
  assert.ok(cardBox.x > lensBox.x + lensBox.width / 2);
  assert.equal(await cards.locator('li').first().evaluate(card => getComputedStyle(card).backdropFilter), 'blur(6px)');
  // Switch to the short unopened Files view while keeping the same node selected.
  await inspectorPanel.getByRole('tab', { name: 'Files' }).click();
  const shortInspector = await inspectorPanel.boundingBox();
  assert.ok(shortInspector.height < lensBox.height * 0.75, JSON.stringify({
    shortInspector, lensBox, children: await inspectorPanel.evaluate(panel => Array.from(panel.children, el => ({
      className: el.className, height: el.clientHeight, scrollHeight: el.scrollHeight,
    }))),
  }));
  assert.equal(await inspectorPanel.evaluate(panel => getComputedStyle(panel).backdropFilter), 'blur(6px)');
  assert.equal(await separator.evaluate(handle => getComputedStyle(handle).backgroundColor), 'rgba(0, 0, 0, 0)');
  await separator.hover();
  assert.notEqual(await separator.evaluate(handle => getComputedStyle(handle).backgroundColor), 'rgba(0, 0, 0, 0)');
  const handleBox = await separator.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 30);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 70, handleBox.y + 30, { steps: 6 });
  await page.mouse.up();
  assert.ok((await inspectorPanel.boundingBox()).width > shortInspector.width);
  await inspectorPanel.getByRole('button', { name: 'Minimize inspector' }).click();
  const restore = inspectorPanel.getByRole('button', { name: 'Restore inspector' });
  assert.equal(await restore.getAttribute('aria-expanded'), 'false');
  assert.equal(await inspectorPanel.getByRole('tab').count(), 0);
  assert.equal(await separator.isVisible(), false);
  assert.equal((await inspectorPanel.boundingBox()).width, (await restore.boundingBox()).width);
  assert.ok((await lens.boundingBox()).width > lensBox.width);
  await restore.press('Enter');
  assert.equal(await inspectorPanel.getByRole('tab', { name: 'Files' }).getAttribute('aria-selected'), 'true');
  await page.getByRole('button', { name: 'Fit observed positions' }).click();
  const marker = page.getByRole('button', { name: /Node 11.*Binding 11>10.8/ });
  await marker.click(timeout);
  await inspectorPanel.getByRole('tab', { name: 'Modules' }).click();
  await page.getByText('Node 11 · Local · Wi-Fi', { exact: true }).waitFor(timeout);
  await page.getByRole('link', { name: 'OpenStreetMap contributors' }).waitFor(timeout);
  assert.equal(await page.getByText('Basemap tiles unavailable').count(), 0);
  assert.deepEqual(offOrigin, []);
  assert.deepEqual(errors, []);
  console.log(`PASS Chrome ${browser.version()}: standalone map requests tiles, fits local GPS and selects its node without cloud API calls`);

  await page.close();
  await gateway.close();
  gateway = await launch(build, first.port, first.udpPort, { serialMode: 'dual' });
  await gateway.ready;
  const dual = await context.newPage();
  dual.on('pageerror', error => errors.push(error.message));
  await dual.goto(`${first.origin}/workbench/`);
  await dual.getByRole('button', { name: 'Network', exact: true }).click();
  await dual.getByText('Serial · Up', { exact: true }).waitFor(timeout);
  await hello(gateway);
  serialHello(gateway);
  const routes = dual.getByRole('table', { name: 'Local routes' });
  const wifiRoute = routes.getByRole('row').filter({ has: dual.getByRole('button', { name: 'Inspect node 11 from Wi-Fi route' }) });
  await wifiRoute.getByRole('cell', { name: 'Wi-Fi', exact: true }).click(timeout);
  assert.equal(await wifiRoute.getAttribute('data-focused'), 'true');
  assert.equal(await dual.getByRole('region', { name: 'Local nodes' }).count(), 0);
  await dual.getByText('Node 11 · Local · Serial', { exact: true }).waitFor(timeout);
  const name = Buffer.from('BenchTest');
  await publication(gateway, [11, 11, 1, 8, (DRONE_LINK_MSG_TYPE_CHAR << 4) | (name.length - 1), ...name]);
  const namedRoute = wifiRoute.getByRole('button', { name: 'Inspect node 11 from Wi-Fi route: BenchTest' });
  await namedRoute.waitFor(timeout);
  assert.equal(await namedRoute.textContent(), '11 BenchTest');
  assert.equal(await namedRoute.evaluate(button => getComputedStyle(button).textDecorationLine), 'none');
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
  const configuration = 'node = 11\r\n[Nav = 12]\r\n $location = "@>GPS.location"  ; primary fix\r\n[NMEA = 10]\r\n name = GPS\r\n';
  peer.files.set('/config.ini', Buffer.from(configuration));
  gateway = await launch(build, first.port, first.udpPort, { peerPort: peer.port });
  await gateway.ready;
  const files = await context.newPage();
  files.on('pageerror', error => errors.push(error.message));
  await files.goto(`${first.origin}/workbench/`);
  await files.getByRole('status').filter({ hasText: 'Local gateway connected' }).waitFor(timeout);
  peer.hello(gateway);
  await files.getByRole('button', { name: /Node 11 · Reachable/ }).click(timeout);
  const inspector = files.getByRole('region', { name: 'Node Inspector' });
  assert.equal(await inspector.getByRole('tab', { name: 'Modules' }).getAttribute('aria-selected'), 'true');
  await inspector.getByRole('tab', { name: 'Files' }).click();
  await files.getByRole('button', { name: 'List files' }).click();
  await files.getByRole('button', { name: 'sample.txt' }).click(timeout);
  const editor = files.getByRole('textbox', { name: /Stored file/ });
  assert.equal(await editor.inputValue(timeout), 'First line\n');
  await editor.fill('Edited in the Workbench\n');
  await inspector.getByRole('button', { name: 'Minimize inspector' }).click();
  assert.equal(await editor.isVisible(), false);
  await inspector.getByRole('button', { name: 'Restore inspector' }).click();
  assert.equal(await editor.inputValue(), 'Edited in the Workbench\n');
  await inspector.getByRole('tab', { name: 'Modules' }).click();
  await files.getByRole('button', { name: 'Network', exact: true }).click();
  await files.getByText('Wi-Fi · Up', { exact: true }).waitFor(timeout);
  await files.getByRole('button', { name: 'Inspect node 11 from Wi-Fi route' }).click();
  assert.equal(await inspector.getByRole('tab', { name: 'Modules' }).getAttribute('aria-selected'), 'true');
  await inspector.getByRole('tab', { name: 'Files' }).click();
  assert.equal(await editor.inputValue(), 'Edited in the Workbench\n');
  await files.route('https://tile.openstreetmap.org/**', request => request.fulfill({
    contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: tile,
  }));
  await files.getByRole('button', { name: 'Map', exact: true }).click();
  await files.setViewportSize({ width: 390, height: 844 });
  assert.equal(await editor.inputValue(), 'Edited in the Workbench\n');
  const scrollingPane = inspector.locator('.tab-content');
  await files.waitForFunction(() => {
    const pane = document.querySelector('.inspector-panel .tab-content');
    return pane && pane.clientHeight > 0 && pane.scrollHeight > pane.clientHeight;
  });
  assert.equal(await scrollingPane.evaluate(pane => getComputedStyle(pane).overflowY), 'auto');
  await files.getByRole('button', { name: 'Upload to node' }).click();
  await files.getByText(/Stored file verified by readback/).waitFor(timeout);
  assert.equal(peer.files.get('/sample.txt').toString(), 'Edited in the Workbench\r\n');
  assert.deepEqual(peer.actions, ['start', 'block', 'save']);
  await files.getByRole('button', { name: 'Open node configuration' }).click();
  await files.getByText('Modules and subscriptions (2 modules)', { exact: true }).click();
  await files.getByText('Local: GPS (channel 10)', { exact: true }).waitFor(timeout);
  const editSource = files.getByRole('button', { name: 'Edit source for $location on channel 12' });
  await editSource.click();
  const source = files.getByRole('textbox', { name: 'Source for $location' });
  await source.fill('@>10.8');
  await source.press('Enter');
  assert.equal(await editSource.evaluate(button => button === document.activeElement), true);
  assert.equal(peer.files.get('/config.ini').toString(), configuration);
  assert.deepEqual(peer.actions, ['start', 'block', 'save']);
  await files.getByRole('button', { name: 'Upload to node' }).click();
  await files.getByText(/Stored file verified by readback/).waitFor(timeout);
  assert.equal(peer.files.get('/config.ini').toString(), configuration.replace('@>GPS.location', '@>10.8'));
  assert.ok(!peer.actions.includes('restart'));
  files.once('dialog', dialog => dialog.accept());
  await files.getByRole('button', { name: 'Restart node' }).click();
  await files.getByText(/Restart requested/).waitFor(timeout);
  for (let i = 0; i < 20 && peer.actions.at(-1) !== 'restart'; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(peer.actions.at(-1), 'restart');
  assert.deepEqual(offOrigin, []);
  assert.deepEqual(errors, []);
  console.log(`PASS Chrome ${browser.version()}: open stored file, trace and edit draft binding, verify exact upload bytes and confirm Restart separately`);

  await files.close();
  await gateway.close();
  const fixtureToken = 'pk.workbench.fixture';
  gateway = await launch(build, undefined, undefined, { mapboxToken: fixtureToken });
  await gateway.ready;
  const cloudMap = await browser.newPage();
  const localhostOrigin = gateway.origin.replace('127.0.0.1', 'localhost');
  const ipConfig = await fetch(`${gateway.origin}/api/workbench/v1/map-config`);
  assert.equal((await ipConfig.json()).mapboxAccessToken, null);
  const cloudStylePath = '/styles/v1/axford/cm0bi93ot00qj01ph7m580lku';
  let requestedToken;
  await cloudMap.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === localhostOrigin) return route.continue();
    if (url.origin === 'https://api.mapbox.com' && url.pathname === cloudStylePath) {
      requestedToken = url.searchParams.get('access_token');
      return route.fulfill({
        json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#222' } }] },
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
    return route.abort();
  });
  await cloudMap.goto(`${localhostOrigin}/workbench/`);
  const styleResponse = cloudMap.waitForResponse(response => new URL(response.url()).pathname === cloudStylePath && response.ok(), timeout);
  await cloudMap.getByRole('button', { name: 'Map', exact: true }).click();
  await styleResponse;
  assert.equal(requestedToken, fixtureToken);
  await cloudMap.locator('.mapboxgl-canvas').waitFor(timeout);
  assert.equal(await cloudMap.getByText('Local fallback basemap').count(), 0);
  await cloudMap.close();
  console.log('PASS configured Workbench loads the exact hosted Mapbox style using a synthetic token');


} finally {
  await browser?.close();
  await gateway.close();
  peer?.close();
}
