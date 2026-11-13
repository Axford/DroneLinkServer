import { DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_CHAR } from '../../public/modules/droneLinkMsg.mjs';
import assert from 'node:assert/strict';
import { filePeer } from './file-peer.mjs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { hello, launch, publication, serialFrame, serialHello, serialPublication } from './harness.mjs';

const build = process.env.CLIENT_BUILD_DIR;
// Optional full catalogue acceptance against prepared SEP-05 release 739fc899… (build c017040).
const catalogueFixture = process.env.WORKBENCH_CATALOGUE_FIXTURE;
if (catalogueFixture) {
  const { verifyRelease } = await import('../../scripts/release.mjs');
  assert.equal(verifyRelease(catalogueFixture).identity, '739fc899479974550361f72c86c3d3c6a5570d102c660e38c2d704df653f21ff');
}
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
  // Keep the Modules inspector floating on the map.
  const shortInspector = await inspectorPanel.boundingBox();
  assert.ok(shortInspector.height <= lensBox.height, JSON.stringify({
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
  await inspectorPanel.getByRole('button', { name: 'Collapse inspector' }).click();
  const restore = inspectorPanel.getByRole('button', { name: 'Normal inspector' });
  assert.equal(await restore.getAttribute('aria-pressed'), 'false');
  assert.equal(await inspectorPanel.getByRole('tab').count(), 0);
  assert.equal(await separator.isVisible(), false);
  assert.equal((await inspectorPanel.boundingBox()).width, (await inspectorPanel.getByRole('group', { name: 'Inspector size' }).boundingBox()).width);
  assert.ok((await lens.boundingBox()).width > lensBox.width);
  await restore.press('Enter');
  assert.equal(await inspectorPanel.getByRole('tab', { name: 'Modules' }).getAttribute('aria-selected'), 'true');
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
  const configuration = 'node = 11\r\n[Nav = 12]\r\n $location = "@>GPS.location"  ; primary fix\r\n[NMEA = 10]\r\n name = GPS\r\n[NMEA = 14]\r\n name = BackupGPS\r\n[Probe = 18]\r\n pin32 = digital\r\n pin33 = digital\r\n[BME280 = 19]\r\n bus = 3\r\n[INA3221 = 20]\r\n bus = 5\r\n';
  peer.files.set('/config.ini', Buffer.from(configuration));
  gateway = await launch(build, first.port, first.udpPort, { peerPort: peer.port, catalogueFixture });
  await gateway.ready;
  const files = await context.newPage();
  files.on('pageerror', error => errors.push(error.message));
  await files.goto(`${first.origin}/workbench/`);
  await files.getByRole('status').filter({ hasText: 'Local gateway connected' }).waitFor(timeout);
  peer.hello(gateway);
  await files.getByRole('button', { name: /Node 11 · Reachable/ }).click(timeout);
  const inspector = files.getByRole('region', { name: 'Node Inspector' });
  assert.equal(await inspector.getByRole('tab', { name: 'Modules' }).getAttribute('aria-selected'), 'true');
  const normalSize = await inspector.boundingBox();
  await inspector.getByRole('tab', { name: 'Files' }).click();
  assert.deepEqual(await inspector.boundingBox(), normalSize);
  const full = inspector.getByRole('button', { name: 'Full-window inspector' });
  await full.click();
  assert.equal(await full.getAttribute('aria-pressed'), 'true');
  await files.getByRole('button', { name: 'List files' }).click();
  await files.getByRole('button', { name: /^sample\.txt/ }).click(timeout);
  const editor = files.getByRole('textbox', { name: /Stored file/ });
  assert.equal(await editor.inputValue(timeout), 'First line\n');
  await editor.fill('Edited in the Workbench\n');
  await inspector.getByRole('button', { name: 'Collapse inspector' }).click();
  assert.equal(await editor.isVisible(), false);
  await inspector.getByRole('button', { name: 'Normal inspector' }).click();
  assert.equal(await editor.inputValue(), 'Edited in the Workbench\n');
  await inspector.getByRole('tab', { name: 'Modules' }).click();
  await files.getByRole('button', { name: 'Network', exact: true }).click();
  await files.getByText('Wi-Fi · Up', { exact: true }).waitFor(timeout);
  await files.getByRole('button', { name: 'Inspect node 11 from Wi-Fi route' }).click();
  if (catalogueFixture) {
    const network = files.getByRole('region', { name: 'Selected node network' });
    const refresh = network.getByRole('button', { name: 'Refresh node network' });
    await refresh.click(timeout);
    await network.getByText('UDP · Up', { exact: true }).waitFor(timeout);
    await network.getByText('No routes reported by node 11.').waitFor(timeout);
    await network.getByText(/3.5% utilization · 12 slots/).waitFor(timeout);
    gateway.processHandle.send('expire routes');
    await network.getByText(/^Last seen from node 11/).waitFor(timeout);
    assert.ok(await refresh.isDisabled());
    await new Promise((resolve, reject) => gateway.processHandle.send('restore clock', error => error ? reject(error) : resolve()));
    peer.hello(gateway);
    await refresh.click(timeout);
    await network.getByText(/^Received from node 11/).waitFor(timeout);
    console.log('PASS selected node network remains distinct from gateway routes through loss and recovery');
  }
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
  const normalMapSize = await inspector.boundingBox();
  assert.ok(normalMapSize.width < 390);
  await full.click();
  assert.ok((await inspector.boundingBox()).width >= 385);
  assert.equal(await scrollingPane.evaluate(pane => getComputedStyle(pane).overflowY), 'auto');
  await files.getByRole('button', { name: 'Upload to node' }).click();
  await files.getByText(/Stored file verified by readback/).waitFor(timeout);
  assert.equal(peer.files.get('/sample.txt').toString(), 'Edited in the Workbench\r\n');
  assert.deepEqual(peer.actions, ['start', 'block', 'save']);
  await files.getByRole('button', { name: 'Browse files' }).click();
  await files.getByRole('dialog', { name: 'Files' }).getByRole('button', { name: 'Open node configuration' }).click();
  const graph = files.getByRole('region', { name: 'Subscription graph' });
  await graph.locator('.react-flow__edge-path').waitFor({ state: 'attached', ...timeout });
  await graph.getByRole('button', { name: '$location', exact: true }).click(timeout);
  await files.getByText('Local: GPS (channel 10)', { exact: true }).waitFor(timeout);
  const editSource = files.getByRole('button', { name: 'Edit source for $location on channel 12' });
  const source = files.getByRole('textbox', { name: 'Source for $location' });
  await source.fill('@>14.8');
  await source.press('Enter');
  assert.equal(await editSource.evaluate(button => button === document.activeElement), true);
  await graph.getByRole('group', { name: /Local: BackupGPS.*to channel 12/ }).waitFor({ state: 'attached', ...timeout });
  await files.getByRole('button', { name: 'Code', exact: true }).click();
  await files.locator('.ace_support.ace_class').first().waitFor(timeout);
  const code = files.getByRole('textbox', { name: 'Stored file /config.ini' });
  const readCode = () => files.locator('.ace_editor:visible').evaluate(editor => editor.env.editor.getValue(), undefined, timeout);
  assert.equal(await readCode(), configuration.replace('@>GPS.location', '@>14.8').replaceAll('\r\n', '\n'));
  const replaceCode = async text => {
    await code.focus();
    await code.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await files.keyboard.insertText(text);
  };
  await replaceCode(configuration.replace('@>GPS.location', '@>10').replaceAll('\r\n', '\n'));
  await files.getByRole('button', { name: 'Logical', exact: true }).click();
  await files.getByText('Fix configuration errors before uploading.').waitFor(timeout);
  assert.ok(await files.getByRole('button', { name: 'Upload to node' }).isDisabled());
  await files.getByRole('button', { name: 'Code', exact: true }).click();
  assert.match(await readCode(), /@>10"/);
  await replaceCode(configuration.replaceAll('\r\n', '\n'));
  await files.getByRole('button', { name: 'Logical', exact: true }).click();
  await graph.getByRole('group', { name: /Local: GPS.*to channel 12/ }).waitFor({ state: 'attached', ...timeout });
  await files.getByText('@>GPS.location', { exact: true }).waitFor(timeout);
  await editSource.click();
  await source.fill('@>14.8');
  await source.press('Enter');
  assert.equal(peer.files.get('/config.ini').toString(), configuration);
  assert.deepEqual(peer.actions, ['start', 'block', 'save']);
  await files.getByRole('button', { name: 'Upload to node' }).click();
  await files.getByText(/Stored file verified by readback/).waitFor(timeout);
  assert.equal(peer.files.get('/config.ini').toString(), configuration.replace('@>GPS.location', '@>14.8'));
  assert.ok(!peer.actions.includes('restart'));
  if (catalogueFixture) {
    await files.getByRole('button', { name: 'Code', exact: true }).click();
    await files.getByRole('button', { name: 'Add module', exact: true }).click();
    const catalogue = files.getByRole('dialog', { name: 'Add module' });
    await catalogue.getByRole('searchbox').fill('gps');
    await catalogue.getByRole('button', { name: 'Add GPS' }).click(timeout);
    const base = configuration.replace('@>GPS.location', '@>14.8');
    assert.equal(await readCode(), (base + '\r\n[NMEA = 2]\r\n  name = GPS2\r\n').replaceAll('\r\n', '\n'));
    await files.getByRole('button', { name: 'Physical', exact: true }).click();
    const physical = files.getByRole('region', { name: 'Physical wiring graph' });
    await files.getByLabel('Motherboard').selectOption('v4');
    await physical.getByRole('group', { name: 'Serial 1 RX · GPIO 13 to GPS2' }).waitFor({ state: 'attached', ...timeout });
    await files.getByLabel('GPS serial port').selectOption('2');
    await physical.getByRole('group', { name: 'Serial 2 RX · GPIO 16 to GPS2' }).waitFor({ state: 'attached', ...timeout });
    assert.equal(await physical.getByRole('group', { name: 'Serial 1 RX · GPIO 13 to GPS2' }).count(), 0);
    await files.getByRole('button', { name: 'Scan I²C' }).click(timeout);
    await physical.getByText(/7\/8 channels complete/).waitFor(timeout);
    await physical.getByText(/Channel 3 · selection failed/).waitFor(timeout);
    await physical.locator('[data-detection="unchecked"]').filter({ hasText: 'BME280' }).waitFor(timeout);
    await physical.getByRole('button', { name: /INA3221.*Address responded/ }).waitFor(timeout);
    await physical.getByRole('group', { name: 'I²C channel 1 to detected 0x40' }).waitFor({ state: 'attached', ...timeout });
    await files.getByLabel('Find detected device').selectOption('i2c:1:64', timeout);
    await physical.getByRole('button', { name: 'Identify device' }).click(timeout);
    await files.getByText(/Identification inconclusive/).waitFor(timeout);
    await files.getByText(/Register 0xFF · short read · 0x32/).waitFor(timeout);
    await physical.getByRole('button', { name: 'Review module assignment' }).click(timeout);
    await catalogue.getByText(/Proposed assignment: I²C channel 1 · 0x40/).waitFor(timeout);
    await catalogue.getByRole('button', { name: 'Close Add module' }).click();
    await files.getByLabel('Find wired module').selectOption('20', timeout);
    await physical.getByRole('button', { name: 'Identify device' }).click(timeout);
    await physical.getByRole('button', { name: /INA3221.*Signature matches INA3221/ }).waitFor(timeout);
    await files.getByText(/Register 0xFE · complete · 0x54 0x49/).waitFor(timeout);
    assert.equal(peer.files.get('/config.ini').toString(), base);
    console.log('PASS all-channel coverage, repeated address isolation, and matched and inconclusive register reads');
    const probe32 = physical.getByRole('button', { name: /GPIO 32 Probe/ });
    const probe33 = physical.getByRole('button', { name: /GPIO 33 Probe/ });
    await probe32.filter({ hasText: 'Waiting for running Probe' }).waitFor(timeout);
    await publication(gateway, [11, 11, 18, 5, (DRONE_LINK_MSG_TYPE_CHAR << 4) | 4, ...Buffer.from('Probe')]);
    await publication(gateway, [11, 11, 18, 42, 5, 0x11, 1, 4, 0, 20, 0]);
    await publication(gateway, [11, 11, 18, 43, 1, 0x15, 10]);
    await probe32.filter({ hasText: /Live · High · 4 transitions/ }).waitFor(timeout);
    await probe33.filter({ hasText: /Occupied or unavailable.*owned by channel 10/ }).waitFor(timeout);
    await probe32.filter({ hasText: /Stale · High/ }).waitFor(timeout);
    await files.getByLabel('Find connector').selectOption('33');
    await files.getByRole('button', { name: 'Code', exact: true }).click();
    await files.getByRole('button', { name: 'Physical', exact: true }).click();
    assert.equal(await files.getByLabel('Find connector').inputValue(), '33');
    await files.getByLabel('Find connector').selectOption('32');
    await files.getByLabel('Probe mode').selectOption('serial');
    await files.getByLabel('Baud rate').selectOption('19200');
    await files.getByRole('button', { name: 'Set Probe mode in draft' }).click();
    await probe32.filter({ hasText: 'Draft only' }).waitFor(timeout);
    await files.getByLabel('Find wired module').selectOption('19');
    await files.getByLabel('I²C channel', { exact: true }).selectOption('5');
    await physical.getByRole('group', { name: 'I²C channel 5 to BME280' }).waitFor({ state: 'attached', ...timeout });
    await physical.locator('[data-detection="missing"]').filter({ hasText: 'BME280' }).waitFor(timeout);
    await files.getByLabel('Find connector').selectOption('16');
    await files.getByRole('button', { name: 'Find GPS in catalogue' }).click();
    assert.equal(await catalogue.getByRole('searchbox').inputValue(), 'GPS');
    await catalogue.getByText('A GPS added from this connector will use Serial 2.').waitFor(timeout);
    await catalogue.getByRole('button', { name: 'Close Add module' }).click();
    await files.getByRole('button', { name: 'Logical', exact: true }).click();
    await graph.getByRole('button', { name: 'GPS2', exact: true }).press('Enter', timeout);
    assert.equal(await files.getByLabel('GPS serial port').inputValue(), '2');
    await graph.getByRole('button', { name: 'Nav', exact: true }).click(timeout);
    await files.getByLabel('Pilot location source').selectOption('2', timeout);
    await files.getByRole('button', { name: 'Review connection' }).click();
    assert.match(await files.getByLabel('Connection changes').textContent(), /publish = location/);
    assert.equal(peer.files.get('/config.ini').toString(), base);
    await files.getByRole('button', { name: 'Apply connection to draft' }).click();
    await graph.getByRole('group', { name: /Local: GPS2.*to channel 12/ }).waitFor({ state: 'attached', ...timeout });
    await files.getByRole('button', { name: 'Code', exact: true }).click();
    const expected = base.replace('@>14.8', '@>2.8').replace('pin32 = digital', 'pin32 = serial,19200').replace('bus = 3', 'bus = 5') + '\r\n[NMEA = 2]\r\n  name = GPS2\r\n  port = 2\r\n  publish = location\r\n';
    assert.equal(await readCode(), expected.replaceAll('\r\n', '\n'));
    await files.getByRole('button', { name: 'Upload to node' }).click();
    await files.getByText(/Stored file verified by readback/).waitFor(timeout);
    assert.equal(peer.files.get('/config.ini').toString(), expected);
    gateway.processHandle.send('different catalogue build');
    await files.getByRole('button', { name: 'Add module', exact: true }).click();
    await catalogue.getByText('Catalogue metadata is from a different build.', { exact: false }).waitFor(timeout);
    await catalogue.getByRole('searchbox').fill('GPS');
    assert.ok(await catalogue.getByRole('button', { name: 'Add GPS' }).isEnabled());
    await catalogue.getByRole('button', { name: 'Close Add module' }).click();
    await files.getByRole('button', { name: 'Logical', exact: true }).click();
    await graph.getByRole('button', { name: 'Nav', exact: true }).click(timeout);
    assert.equal(await files.getByLabel('Pilot location source').count(), 0);
    console.log('PASS pinned catalogue, Physical serial and I²C rewiring, GPIO waiting/live/occupied/stale, and exact cross-view upload');
  }
  files.once('dialog', dialog => dialog.accept());
  await files.getByRole('button', { name: 'Node actions' }).click();
  await files.getByText('Restart node', { exact: true }).click();
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
