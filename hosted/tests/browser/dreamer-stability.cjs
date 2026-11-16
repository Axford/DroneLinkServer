'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const { fixture, domain, join } = require('../native/support.cjs');
const { saveBarge } = require('../native/stability-fixture.cjs');

test('Chrome runs, displays and reopens both stability curves against a historical revision', async t => {
    assert.ok(process.env.CLIENT_BUILD_DIR, 'Select an explicit built Client artifact');
    await fixture(t, async ({ agent }) => {
        const owner = await agent('admin');
        const viewer = await agent('viewer');
        const study = await domain(owner, 'Stability Browser');
        await join(owner, viewer, study._id, 'viewer', 'viewer');
        const original = await saveBarge(owner, study._id);
        await saveBarge(owner, study._id, original.modelId, original.revisionId, 5000);
        const library = owner.origin + '/private/domain/' + study._id + '/dreamer';
        const browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome' });
        const errors = [];
        try {
            const openPage = async (identity, hasTouch = false) => {
                const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'en-GB', hasTouch });
                const login = await context.request.get(owner.origin + '/auth/google/callback?identity=' + identity, { maxRedirects: 0 });
                assert.equal(login.status(), 302);
                const page = await context.newPage();
                page.on('pageerror', error => errors.push(error.message));
                page.setDefaultTimeout(15000);
                await page.goto(library);
                return page;
            };
            const openOriginal = async page => {
                await page.getByRole('button', { name: 'Revisions', exact: true }).click();
                await page.getByRole('button', { name: 'Stability for revision 1', exact: true }).click();
                await page.getByRole('heading', { name: 'Dreamer model editor' }).waitFor();
                await page.getByText(/^Reference barge · Revision 1/).waitFor();
                assert.equal(await page.getByRole('tab', { name: 'Stability' }).getAttribute('aria-selected'), 'true');
                assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Import', 'Orient', 'Configure', 'Stability', 'Sail']);
            };
            const charts = async page => {
                for (const title of ['Righting moment', 'Pitch restoring moment']) {
                    const plot = page.getByRole('img', { name: new RegExp('^' + title + ' chart') });
                    await plot.locator('canvas').first().waitFor();
                    assert.ok((await plot.boundingBox()).width > 240);
                }
            };
            async function scrollTab(page, target) {
                const main = page.getByRole('main');
                await target.hover();
                const before = await main.evaluate(element => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
                assert.ok(before.max > 0, 'The tab fixture must extend beyond the viewport');
                const delta = before.max - before.top < 120 ? -120 : 120;
                await page.mouse.wheel(0, delta);
                await page.waitForFunction(({ top, delta }) => (document.querySelector('main').scrollTop - top) * delta > 0,
                    { top: before.top, delta }, { timeout: 2000 });
            }
            const page = await openPage('admin');
            await openOriginal(page);
            const water = page.getByLabel('Water density', { exact: true });
            const run = page.getByRole('button', { name: 'Run and save' });
            assert.equal(await water.inputValue(), 'salt-water');
            await run.click();
            await page.getByText('Analysis saved to revision 1.', { exact: true }).waitFor();
            await charts(page);
            await page.getByText('487.8 mm', { exact: true }).waitFor();
            const history = page.getByRole('heading', { name: 'Saved analyses' });
            const analysis = page.getByRole('region', { name: 'Analysis result' });
            assert.ok((await history.boundingBox()).y < (await analysis.boundingBox()).y);
            const preview = page.getByRole('region', { name: 'Hydrostatic preview' });
            const attitude = preview.getByLabel('Preview attitude');
            const canvas = preview.locator('canvas');
            await canvas.waitFor();
            await page.waitForFunction(() => document.querySelector('.dreamer-hydrostatic-canvas canvas')?.width > 300);
            const originalDrawing = await canvas.evaluate(element => element.toDataURL());
            await preview.getByText(/Weight ↓/).waitFor();
            await preview.getByText(/Buoyancy ↑/).waitFor();
            await preview.getByText(/Waterline .* mm from the model datum/).waitFor();
            await scrollTab(page, page.getByRole('heading', { name: 'Saved analyses' }));
            await scrollTab(page, page.getByRole('img', { name: /^Righting moment chart/ }).locator('canvas').first());
            await scrollTab(page, canvas);
            await canvas.hover();
            const beforeZoom = await page.getByRole('main').evaluate(element => element.scrollTop);
            const imageBeforeZoom = await canvas.evaluate(element => element.toDataURL());
            await page.keyboard.down('Alt');
            try { await page.mouse.wheel(0, -100); }
            finally { await page.keyboard.up('Alt'); }
            await page.waitForFunction(image => document.querySelector('.dreamer-hydrostatic-canvas canvas').toDataURL() !== image, imageBeforeZoom);
            assert.equal(await page.getByRole('main').evaluate(element => element.scrollTop), beforeZoom);

            const hover = async (chart, sample) => {
                const plot = page.getByRole('img', { name: new RegExp('^' + chart + ' chart') }).locator('canvas').first();
                await plot.hover({ position: { x: (await plot.boundingBox()).width - 65, y: 92 } });
                await attitude.filter({ hasText: new RegExp('^' + sample + ' sample') }).waitFor();
            };
            await hover('Righting moment', 'Heel');
            assert.match(await attitude.textContent(), /Heel [1-9][0-9]*° · Pitch 0°/);
            await page.waitForFunction(image => document.querySelector('.dreamer-hydrostatic-canvas canvas').toDataURL() !== image, originalDrawing);
            const heelDrawing = await canvas.evaluate(element => element.toDataURL());
            await hover('Pitch restoring moment', 'Pitch');
            assert.match(await attitude.textContent(), /Heel 0° · Pitch [1-9][0-9]*°/);
            await page.waitForFunction(image => document.querySelector('.dreamer-hydrostatic-canvas canvas').toDataURL() !== image, heelDrawing);

            const scrubber = preview.getByRole('slider', { name: 'Sample angle' });
            await scrubber.focus();
            await scrubber.press('End');
            assert.match(await attitude.textContent(), /Pitch 30°/);
            await preview.getByRole('button', { name: 'Equilibrium', exact: true }).click();
            await attitude.filter({ hasText: /^Equilibrium · Heel 0° · Pitch 0°/ }).waitFor();
            if (process.env.DRONELINK_STABILITY_SCREENSHOT) await preview.screenshot({ path: process.env.DRONELINK_STABILITY_SCREENSHOT });
            await water.selectOption('freshwater');
            await run.click();
            await page.getByText('Analysis saved to revision 1.', { exact: true }).waitFor();
            await page.getByText('500 mm', { exact: true }).waitFor();

            await page.reload();
            await page.getByRole('button', { name: 'Open latest', exact: true }).click();
            assert.equal(await page.getByRole('tab', { name: 'Configure', exact: true }).getAttribute('aria-selected'), 'true');
            await page.setViewportSize({ width: 1050, height: 565 });
            const assembly = page.getByLabel(/^3D boat assembly/);
            await scrollTab(page, assembly);
            await page.getByRole('tab', { name: 'Orient' }).click();
            await scrollTab(page, assembly);
            await page.getByRole('tab', { name: 'Configure' }).click();
            await page.setViewportSize({ width: 1440, height: 960 });
            await page.getByLabel('Mass (kg)', { exact: true }).fill('5400');
            await page.getByRole('tab', { name: 'Stability', exact: true }).click();
            await page.getByText(/Stability uses saved revision 2/).waitFor();
            await page.getByRole('tab', { name: 'Configure', exact: true }).click();
            assert.equal(await page.getByLabel('Mass (kg)', { exact: true }).inputValue(), '5400');
            await page.getByRole('tab', { name: 'Stability', exact: true }).click();
            await page.getByText('No saved analyses for this revision.', { exact: true }).waitFor();
            page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: 'Back to models' }).click();
            await openOriginal(page);
            const salt = page.locator('li').filter({ hasText: /Salt water · 1,025/ });
            await salt.getByRole('button', { name: 'Open analysis' }).click();
            await page.getByText('487.8 mm', { exact: true }).waitFor();
            await charts(page);

            const viewerPage = await openPage('viewer', true);
            await openOriginal(viewerPage);
            assert.equal(await viewerPage.getByRole('button', { name: 'Run and save' }).count(), 0);
            await viewerPage.locator('li').filter({ hasText: /Freshwater · 1,000/ }).getByRole('button', { name: 'Open analysis' }).click();
            await viewerPage.getByText('500 mm', { exact: true }).waitFor();
            await charts(viewerPage);
            await viewerPage.setViewportSize({ width: 430, height: 900 });
            await charts(viewerPage);
            const touchCanvas = viewerPage.getByLabel(/^3D hydrostatic preview/);
            await touchCanvas.scrollIntoViewIfNeeded();
            const box = await touchCanvas.boundingBox();
            const touchMain = viewerPage.getByRole('main');
            const touchBefore = await touchMain.evaluate(element => element.scrollTop);
            assert.ok(touchBefore > 120);
            const touch = await viewerPage.context().newCDPSession(viewerPage);
            const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 3);
            await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
            for (let step = 1; step <= 5; step++)
                await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + step*18 }] });
            await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await viewerPage.waitForFunction(top => document.querySelector('main').scrollTop < top, touchBefore);
            await touch.detach();
            const overflow = await viewerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            assert.equal(overflow, false);
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
        }
    }, { browserOrigin: true });
});
