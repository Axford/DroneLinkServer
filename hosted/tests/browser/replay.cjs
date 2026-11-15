'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const { fixture, domain, join } = require('../native/support.cjs');
const { startReplayWorker } = require('../../lib/replayWorker');

test('built Client opens Cloud Replay from Home and scrubs recorded telemetry in Chrome', { timeout: 60000 }, t => fixture(t, async context => {
    const admin = await context.agent('admin');
    const viewer = await context.agent('browser-replay');
    const fleet = await domain(admin, 'Replay fleet');
    await join(admin, viewer, fleet._id, 'browser-replay', 'viewer');
    const first = Date.parse('2026-11-01T08:00:00Z');
    function position(lng, lat) {
        const bytes = Buffer.from('000b0708370000000000000000', 'hex');
        bytes.writeFloatLE(lng, 5);
        bytes.writeFloatLE(lat, 9);
        return bytes;
    }
    for (const [offset, packet] of [
        [0, Buffer.from('000b0705434e4d4541', 'hex')],
        [1, position(-1.8, 51.5)],
        [2, Buffer.from('000b080e0005', 'hex')],
        [3, Buffer.concat([Buffer.from('000b080e5c', 'hex'), Buffer.from('Replay signal')])],
        [1000, Buffer.from('000b080e0009', 'hex')],
        [2000, position(-1.9, 51.6)],
        [7 * 60000, Buffer.from('000b080e000c', 'hex')]
    ]) await context.one.packets.enqueue({ domain: fleet._id, time: new Date(first + offset), packet, meta: {} });
    const deadline = Date.now() + 5000;
    while ((await context.two.packets.bounds(fleet._id)).last !== first + 7 * 60000) {
        assert.ok(Date.now() < deadline, 'retained fixture did not flush');
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    const worker = startReplayWorker(context.two);
    let browser;
    try {
        browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
        const session = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC' });
        const cookie = viewer.raw.cookie;
        await session.addCookies([{ name: cookie.slice(0, cookie.indexOf('=')), value: cookie.slice(cookie.indexOf('=') + 1), url: viewer.raw.origin }]);
        await session.route('https://api.mapbox.com/**', route => route.fulfill({
            contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [] })
        }));
        await session.route('https://events.mapbox.com/**', route => route.fulfill({ status: 204, body: '' }));
        await session.route('**/api/domains/**/replay/prepare', route => route.continue({
            headers: { ...route.request().headers(), origin: context.config.publicOrigin }
        }));
        const page = await session.newPage();
        page.setDefaultTimeout(15000);
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        let requests = 0;
        page.on('request', request => { if (request.url().includes('/replay/window?')) requests++; });
        await page.goto(viewer.raw.origin + '/private');
        await page.getByRole('link', { name: 'Cloud Replay', exact: true }).click();
        await page.getByRole('heading', { name: 'Replay fleet · Cloud Replay' }).waitFor();
        assert.equal(requests, 0);
        await page.getByLabel('Replay time').fill('2026-11-01T08:00:02');
        await page.getByRole('button', { name: 'Open time', exact: true }).click();
        await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
        await page.getByLabel('Recorded node').selectOption('11');
        await page.getByRole('button', { name: 'Plot Replay signal', exact: true }).click();
        await page.getByRole('region', { name: 'Replay charts' }).waitFor();
        const cachedReads = requests;
        const slider = page.getByRole('slider');
        await slider.press('ArrowLeft');
        assert.equal(requests, cachedReads);
        assert.equal(await page.getByRole('button', { name: 'Bookmark playhead' }).count(), 0);
        assert.deepEqual(pageErrors, []);
        console.log('Chrome Replay: Home entry, base map, recorded channels, chart and cached scrub passed (' + browser.version() + ')');
    } finally {
        await browser?.close();
        await worker.close();
    }
}));
