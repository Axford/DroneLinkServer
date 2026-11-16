'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const { fixture, domain } = require('../native/support.cjs');

test('Dreamer draws saved-revision sweeps and persists a part exclusion independently of visibility', async t => {
    assert.ok(process.env.CLIENT_BUILD_DIR && process.env.DRONELINK_SAILING_FIXTURE);
    const model = require(process.env.DRONELINK_SAILING_FIXTURE);
    await fixture(t, async ({ agent }) => {
        const owner = await agent('admin');
        const study = await domain(owner, 'Boat response browser test');
        const root = '/api/domains/' + study._id + '/dreamer-models/' + randomUUID() + '/revisions/';
        const saved = await owner.mutate(root + randomUUID(), { baseRevisionId: null, model }, 'PUT');
        assert.equal(saved.status, 200, saved.text);
        const browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome' });
        try {
            const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
            assert.equal((await context.request.get(owner.origin + '/auth/google/callback?identity=admin', { maxRedirects: 0 })).status(), 302);
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const open = () => page.getByRole('button', { name: 'Open latest', exact: true }).click();
            const tab = name => page.getByRole('tab', { name, exact: true });
            await page.goto(owner.origin + '/private/domain/' + study._id + '/dreamer');
            await open();
            await tab('Sail response').waitFor();
            assert.deepEqual((await page.getByRole('tab').allTextContents()).slice(-3), ['Sail response','Hull response','Sail']);
            await tab('Sail response').click();
            await page.getByRole('img', { name: /Drive.*versus.*angle/ }).locator('canvas').first().waitFor();
            await page.getByText('Sample values', { exact: true }).click();
            assert.ok(await page.getByRole('row').count() > 5);
            await tab('Hull response').click();
            await page.getByRole('img', { name: /Drag.*versus Leeway/ }).locator('canvas').first().waitFor();
            await page.getByLabel('Sweep', { exact: true }).selectOption('speed');
            await page.getByRole('img', { name: /Drag.*versus Speed/ }).locator('canvas').first().waitFor();
            await page.getByText('Sample values', { exact: true }).click();
            await page.getByLabel('Part', { exact: true }).selectOption({ label: 'Rudder' });
            assert.equal(await page.getByRole('row').count(), 8);
            await tab('Configure').click();
            await page.getByRole('button', { name: 'Rudder', exact: true }).click();
            const inclusion = page.getByRole('checkbox', { name: 'Include in simulation' });
            await page.getByRole('button', { name: 'Hide Rudder', exact: true }).click();
            assert.ok(await inclusion.isChecked());
            await inclusion.uncheck();
            await tab('Sail').click();
            await page.getByRole('slider', { name: 'Rudder angle' }).waitFor();
            await tab('Configure').click();
            await page.getByRole('button', { name: 'Save revision' }).click();
            await page.getByText(/· Revision 2$/).waitFor();
            await page.getByRole('button', { name: 'Back to models' }).click();
            await open();
            await page.getByRole('button', { name: 'Rudder', exact: true }).click();
            assert.equal(await inclusion.isChecked(), false);
            await tab('Hull response').click();
            await page.getByText('Sample values', { exact: true }).click();
            assert.equal(await page.getByLabel('Part', { exact: true }).locator('option').filter({ hasText: /^Rudder$/ }).count(), 0);
            await tab('Sail').click();
            assert.equal(await page.getByRole('slider', { name: 'Rudder angle' }).count(), 0);
            assert.ok(await page.getByRole('checkbox', { name: 'Velocity', exact: true }).isChecked());
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
        }
    }, { browserOrigin: true });
});
