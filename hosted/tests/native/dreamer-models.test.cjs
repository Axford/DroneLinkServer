'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { fixture, domain, join } = require('./support.cjs');

test('Dreamer editor saves and reopens pinned revisions with current Domain authority', t => fixture(t, async ({ agent, factories }) => {
    const owner = await agent('admin');
    const editor = await agent('editor', 1);
    const viewer = await agent('viewer', 1);
    const study = await domain(owner, 'Dreamer Study');
    const other = await domain(owner, 'Other Study');
    await join(owner, editor, study._id, 'editor', 'editor');
    await join(owner, viewer, study._id, 'viewer', 'viewer');
    const domainUrl = '/api/domains/' + study._id;
    const root = domainUrl + '/dreamer-models';
    const modelId = randomUUID();
    const history = root + '/' + modelId + '/revisions';
    const firstId = randomUUID();
    const part = {
        id: '1', name: 'Sail', sourcePose: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]],
        mesh: { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], triangles: [[0, 1, 2]], closed: false, duplicateVertices: 0, degenerateFaces: 0 },
        translation: [0, 0, 0], rotation: [0, 0, 0], role: 'Rigid sail', mass: 2, centerOfMass: null,
        joint: { pivot: [0, 0, 0], axis: [0, 0, 1], neutral: 15, minimum: -40, maximum: 25 },
    };
    const model = { version: 1, name: 'Study boat', forward: '-Y', up: '+Z', parts: [part] };
    const save = (who, id, baseRevisionId, document = model) => who.mutate(history + '/' + id, { baseRevisionId, model: document }, 'PUT');
    assert.equal((await factories[0]().request(root)).status, 401);
    assert.equal((await editor.request('/private/domain/' + study._id + '/dreamer')).status, 200);
    assert.equal((await save(viewer, firstId, null)).status, 403);
    assert.equal((await editor.request(history + '/' + firstId, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, baseRevisionId: null }),
    })).status, 403);
    assert.equal((await save(editor, firstId, null, { ...model, forward: '+Z' })).status, 400);
    const invalid = structuredClone(model);
    invalid.parts[0].mesh.triangles = [[0, 1, 40]];
    assert.equal((await save(editor, firstId, null, invalid)).status, 400);
    const first = await save(editor, firstId, null);
    assert.equal(first.status, 200, first.text);
    const firstRevision = first.json().data;
    assert.equal(firstRevision.number, 1);
    assert.deepEqual((await save(editor, firstId, null)).json().data, firstRevision);
    assert.deepEqual((await viewer.request(history + '/' + firstId)).json().data.model, model);
    const secondId = randomUUID();
    const revised = { ...model, name: 'Trimmed model' };
    const secondRevision = (await save(editor, secondId, firstId, revised)).json().data;
    assert.equal(secondRevision.number, 2);
    assert.equal((await save(editor, randomUUID(), firstId)).status, 409);
    assert.equal((await save(editor, secondId, firstId)).status, 409);
    assert.deepEqual((await editor.request(history + '/' + firstId)).json().data.model, model);
    assert.deepEqual((await editor.request(root)).json().data, [secondRevision]);
    assert.deepEqual((await editor.request(history)).json().data, [secondRevision, firstRevision]);
    assert.equal((await editor.request(root.replace(study._id, other._id))).status, 403);
    assert.equal((await owner.request(history.replace(study._id, other._id) + '/' + firstId)).status, 404);
    const current = (await owner.request(domainUrl)).json().data;
    assert.equal((await owner.mutate(domainUrl + '/archive', { revision: current.revision })).status, 200);
    assert.equal((await save(editor, randomUUID(), secondId)).status, 409);
    assert.deepEqual((await viewer.request(history + '/' + secondId)).json().data.model, revised);
}));
