'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { fixture, domain, join } = require('./support.cjs');
const { saveBarge } = require('./stability-fixture.cjs');

test('hosted stability saves both curves to the source revision and enforces current Domain authority', t => fixture(t, async ({ agent, factories }) => {
    const owner = await agent('admin');
    const editor = await agent('editor');
    const viewer = await agent('viewer');
    const study = await domain(owner, 'Stability Study');
    const other = await domain(owner, 'Other Domain');
    await join(owner, editor, study._id, 'editor', 'editor');
    await join(owner, viewer, study._id, 'viewer', 'viewer');
    const first = await saveBarge(owner, study._id);
    const id = randomUUID();
    const path = first.stability + '/' + id;
    const put = (who, url, body = {}) => who.mutate(url, body, 'PUT');
    assert.equal((await factories[0]().request(first.stability)).status, 401);
    assert.equal((await put(viewer, path)).status, 403);
    assert.equal((await put(owner, path, { water: '1010' })).status, 400);
    const noCsrf = await editor.request(path, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(noCsrf.status, 403);
    const saved = await put(editor, path);
    assert.equal(saved.status, 200, saved.text);
    const original = saved.json().data;
    assert.equal(original.revisionId, first.revisionId);
    assert.equal(original.water, 'salt-water');
    assert.deepEqual([original.result.heel.length, original.result.pitch.length], [61, 31]);
    assert.ok(Math.abs(original.result.equilibrium.draft - 4000/8200) < 1e-6);
    assert.deepEqual((await put(editor, path, { water: 'salt-water' })).json().data, original);
    assert.equal((await put(owner, path, { water: 'freshwater' })).status, 409);
    const fresh = (await put(editor, first.stability + '/' + randomUUID(), { water: 'freshwater' })).json().data;
    assert.ok(Math.abs(fresh.result.equilibrium.draft - 0.5) < 1e-6);

    const second = await saveBarge(owner, study._id, first.modelId, first.revisionId, 5000);
    assert.deepEqual((await viewer.request(second.stability)).json().data, []);
    assert.equal((await viewer.request(second.stability + '/' + id)).status, 404);
    assert.deepEqual((await viewer.request(path)).json().data, original);
    assert.equal((await viewer.request(first.stability.replace(study._id, other._id))).status, 403);
    const overloaded = await saveBarge(owner, study._id, first.modelId, second.revisionId, 9000);
    const invalid = (await put(owner, overloaded.stability + '/' + randomUUID())).json();
    assert.equal(invalid.data, null);
    assert.equal(invalid.result.diagnostics[0].code, 'insufficient-displacement');
    assert.deepEqual((await owner.request(overloaded.stability)).json().data, []);

    const current = (await owner.request('/api/domains/' + study._id)).json().data;
    assert.equal((await owner.mutate('/api/domains/' + study._id + '/archive', { revision: current.revision })).status, 200);
    assert.equal((await put(editor, path)).status, 409);
    assert.deepEqual((await viewer.request(path)).json().data, original);
}));
