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
            const openPage = async identity => {
                const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'en-GB' });
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
                await page.getByText('Reference barge · Revision 1', { exact: true }).waitFor();
            };
            const charts = async page => {
                for (const title of ['Righting moment', 'Pitch restoring moment']) {
                    const plot = page.getByRole('img', { name: new RegExp('^' + title + ' chart') });
                    await plot.locator('canvas').first().waitFor();
                    assert.ok((await plot.boundingBox()).width > 240);
                }
            };
            const page = await openPage('admin');
            await openOriginal(page);
            const water = page.getByLabel('Water density', { exact: true });
            const run = page.getByRole('button', { name: 'Run and save' });
            assert.equal(await water.inputValue(), 'salt-water');
            await run.click();
            await page.getByText('Analysis saved to revision 1.', { exact: true }).waitFor();
            await charts(page);
            await page.getByText('487.8 mm', { exact: true }).waitFor();
            await water.selectOption('freshwater');
            await run.click();
            await page.getByText('Analysis saved to revision 1.', { exact: true }).waitFor();
            await page.getByText('500 mm', { exact: true }).waitFor();

            await page.reload();
            await page.getByRole('button', { name: 'Stability', exact: true }).click();
            await page.getByText('No saved analyses for this revision.', { exact: true }).waitFor();
            await page.getByRole('button', { name: 'Back to models' }).click();
            await openOriginal(page);
            const salt = page.locator('li').filter({ hasText: /Salt water · 1,025/ });
            await salt.getByRole('button', { name: 'Open analysis' }).click();
            await page.getByText('487.8 mm', { exact: true }).waitFor();
            await charts(page);

            const viewerPage = await openPage('viewer');
            await openOriginal(viewerPage);
            assert.equal(await viewerPage.getByRole('button', { name: 'Run and save' }).count(), 0);
            await viewerPage.locator('li').filter({ hasText: /Freshwater · 1,000/ }).getByRole('button', { name: 'Open analysis' }).click();
            await viewerPage.getByText('500 mm', { exact: true }).waitFor();
            await charts(viewerPage);
            await viewerPage.setViewportSize({ width: 430, height: 900 });
            await charts(viewerPage);
            const overflow = await viewerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            assert.equal(overflow, false);
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
        }
    }, { browserOrigin: true });
});
