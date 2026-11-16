'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const { fixture, domain, join } = require('../native/support.cjs');

test('Dreamer saves and reopens exact model revisions in Chrome', async t => {
    assert.ok(process.env.CLIENT_BUILD_DIR, 'Select an explicit built Client artifact');
    await fixture(t, async ({ agent }) => {
        const admin = await agent('admin');
        const viewer = await agent('viewer');
        const { _id: id } = await domain(admin, 'Dreamer browser');
        await join(admin, viewer, id, 'viewer', 'viewer');
        const browser = await chromium.launch({
            channel: process.env.DRONELINK_BROWSER_CHANNEL || 'chrome',
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        });
        try {
            const errors = [];
            const openPage = async user => {
                const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
                const login = await context.request.get(admin.origin + '/auth/google/callback?identity=' + user, { maxRedirects: 0 });
                assert.equal(login.status(), 302);
                const page = await context.newPage();
                page.on('pageerror', error => errors.push(error.message));
                page.setDefaultTimeout(15000);
                return page;
            };
            const page = await openPage('admin');
            const library = admin.origin + '/private/domain/' + id + '/dreamer';
            await page.goto(admin.origin + '/private');
            await page.getByRole('link', { name: 'Dreamer', exact: true }).click();
            await page.getByText('No saved models.').waitFor();
            await page.getByRole('button', { name: 'New model' }).click();
            await page.getByLabel('Assembly 3MF').setInputFiles(process.env.DRONELINK_DREAMER_3MF || path.join(__dirname, 'fixtures/dreamer-tetrahedron.3mf'));
            await page.getByRole('combobox', { name: /^Forward/ }).selectOption('-Y');
            await page.getByRole('button', { name: 'Continue to configure' }).click();
            await page.getByLabel('Model name').fill('Tetrahedron');
            await page.getByRole('combobox', { name: /^Physics role/ }).selectOption('Water foil');
            const mass = page.getByLabel('Mass (kg)', { exact: true });
            await mass.fill('1.2');
            await page.getByRole('checkbox', { name: 'Revolute joint' }).check();
            const geometry = page.getByText(/faces ·/);
            const importedGeometry = await geometry.textContent();
            const save = page.getByRole('button', { name: 'Save revision' });
            await save.click();
            await page.getByText('Saved revision 1.', { exact: true }).waitFor();
            const stale = await openPage('admin');
            await stale.goto(library);
            await stale.getByRole('button', { name: 'Open latest' }).click();
            const staleMass = stale.getByLabel('Mass (kg)', { exact: true });
            await staleMass.fill('1.6');
            await mass.fill('1.4');
            await save.click();
            await page.getByText('Saved revision 2.', { exact: true }).waitFor();
            await stale.getByRole('button', { name: 'Save revision' }).click();
            await stale.getByRole('alert').filter({ hasText: 'A newer revision exists' }).waitFor();
            assert.equal(await staleMass.inputValue(), '1.6');

            await page.reload();
            await page.getByRole('button', { name: 'Open latest' }).click();
            assert.equal(await mass.inputValue(), '1.4');
            assert.equal(await geometry.textContent(), importedGeometry);
            assert.equal(await page.getByRole('combobox', { name: /^Physics role/ }).inputValue(), 'Water foil');
            assert.equal(await page.getByRole('checkbox', { name: 'Revolute joint' }).isChecked(), true);
            await page.getByRole('button', { name: 'Back', exact: true }).click();
            assert.equal(await page.getByRole('combobox', { name: /^Forward/ }).inputValue(), '-Y');
            await page.getByRole('button', { name: 'Continue to configure' }).click();
            await page.getByRole('button', { name: 'Back to models' }).click();
            await page.getByRole('button', { name: 'Revisions', exact: true }).click();
            await page.getByRole('button', { name: 'Open revision 1', exact: true }).click();
            assert.equal(await mass.inputValue(), '1.2');
            assert.equal(await mass.isDisabled(), true);
            assert.equal(await save.count(), 0);

            const viewerPage = await openPage('viewer');
            await viewerPage.goto(library);
            await viewerPage.getByRole('button', { name: 'Open latest' }).click();
            const viewerMass = viewerPage.getByLabel('Mass (kg)', { exact: true });
            assert.equal(await viewerMass.inputValue(), '1.4');
            assert.equal(await viewerMass.isDisabled(), true);
            assert.deepEqual(errors, []);
        } finally {
            await browser.close();
        }
    }, { browserOrigin: true });
});
