'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const { fixture, domain } = require('../native/support.cjs');

test('Chrome sails a saved revision with live 3D and replays its manual inputs', async t => {
    assert.ok(process.env.CLIENT_BUILD_DIR, 'Select a built Client artifact');
    assert.ok(process.env.DRONELINK_SAILING_FIXTURE, 'Select the Client reference sloop model');
    const model = require(process.env.DRONELINK_SAILING_FIXTURE);
    await fixture(t, async ({ agent }) => {
        const owner = await agent('admin');
        const study = await domain(owner, 'Manual Sailing Browser');
        const saved = await owner.mutate('/api/domains/' + study._id + '/dreamer-models/' + randomUUID() + '/revisions/' + randomUUID(),
            { baseRevisionId: null, model }, 'PUT');
        assert.equal(saved.status, 200, saved.text);
        const browser = await chromium.launch({ channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome' });
        try {
            const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'en-GB' });
            const login = await context.request.get(owner.origin + '/auth/google/callback?identity=admin', { maxRedirects: 0 });
            assert.equal(login.status(), 302);
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(owner.origin + '/private/domain/' + study._id + '/dreamer');
            await page.getByRole('button', { name: 'Open latest', exact: true }).click();
            await page.getByRole('tab', { name: 'Sail', exact: true }).click();
            const controls = page.getByRole('region', { name: 'Sailing controls' });
            const instruments = page.getByRole('region', { name: 'Sailing instruments' });
            const canvas = page.getByLabel(/^Live 3D sailing view/);
            await canvas.waitFor();
            const rudder = controls.getByRole('slider', { name: 'Rudder angle' });
            const sail = controls.getByRole('slider', { name: 'Main sail angle' });
            assert.equal(await rudder.getAttribute('min'), '-28');
            assert.equal(await rudder.getAttribute('max'), '35');
            assert.equal(await sail.inputValue(), '0');
            await page.getByText('Sea grid · 1 m').waitFor();
            await page.getByText('Hull waterline', { exact: true }).waitFor();
            await controls.getByRole('checkbox', { name: 'Override wind speed' }).check();
            const speedInput = controls.getByLabel('Wind speed (m/s)');
            await speedInput.fill('4.5');
            await speedInput.press('Enter');
            await instruments.getByText(/^4\.5 m\/s from/).waitFor();
            const vectors = page.getByRole('group', { name: 'Vectors' });
            for (const label of ['True wind', 'Apparent wind', 'Air forces', 'Water forces'])
                assert.ok(await vectors.getByRole('checkbox', { name: label, exact: true }).isChecked());
            for (const toggle of await vectors.getByRole('checkbox').all()) await toggle.uncheck();
            await page.waitForFunction(() => {
                const canvas = document.querySelector('.dreamer-sailing-canvas canvas');
                const context = canvas?.getContext('2d');
                if (!context || !canvas.width) return false;
                const pixels = context.getImageData(canvas.width*0.3,canvas.height*0.3,canvas.width*0.4,canvas.height*0.45).data;
                let count = 0;
                for (let i=0; i<pixels.length; i+=4)
                    if (pixels[i] === 130 && pixels[i+1] === 183 && pixels[i+2] === 255) count++;
                return count > 8;
            });
            for (const toggle of await vectors.getByRole('checkbox').all()) await toggle.check();
            const stationary = await canvas.evaluate(element => element.toDataURL());
            await controls.getByRole('button', { name: 'Run', exact: true }).click();
            await page.waitForFunction(() => {
                const values = document.querySelectorAll('.dreamer-sailing-readings dd');
                return Number.parseFloat(values[1]?.textContent) > 0.06;
            }, null, { timeout: 16000 });
            await rudder.press('End');
            await sail.press('Home');
            assert.equal(await rudder.inputValue(), '35');
            assert.equal(await sail.inputValue(), '-80');
            const timer = () => instruments.locator('dd').first().textContent();
            const turnTime = Number.parseFloat(await timer());
            await page.waitForFunction(start =>
                Number.parseFloat(document.querySelector('.dreamer-sailing-readings dd')?.textContent) > start + 1, turnTime);
            await controls.getByRole('button', { name: 'Pause', exact: true }).click();
            const finish = await instruments.locator('dd').allTextContents();
            assert.notEqual(await canvas.evaluate(element => element.toDataURL()), stationary);
            await controls.getByRole('button', { name: 'Reset', exact: true }).click();
            await instruments.getByText('0.0 s', { exact: true }).waitFor();
            assert.equal(await rudder.inputValue(), '0');
            await controls.getByRole('button', { name: 'Replay inputs' }).click();
            await controls.getByText('Replay complete.', { exact: true }).waitFor({ timeout: 18000 });
            assert.deepEqual(await instruments.locator('dd').allTextContents(), finish);
            assert.equal(await speedInput.inputValue(), '4.5');
            await controls.getByRole('combobox', { name: /^Conditions/ }).selectOption('Chop · gusting wind');
            await controls.getByLabel('Weather seed').fill('29');
            assert.equal(await controls.getByLabel('Weather seed').inputValue(), '29');
            await instruments.getByText('0.0 s', { exact: true }).waitFor();
            if (process.env.DRONELINK_SAILING_SCREENSHOT) await canvas.screenshot({ path: process.env.DRONELINK_SAILING_SCREENSHOT });
            await page.setViewportSize({ width: 425, height: 850 });
            assert.equal(await page.evaluate(() => document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth), false);
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
        }
    }, { browserOrigin: true });
});
