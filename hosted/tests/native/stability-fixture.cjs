'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

function model(mass = 4000) {
    return {
        version: 1, name: 'Reference barge', forward: '+X', up: '+Z',
        parts: [{
            id: '1', name: 'Barge hull', role: 'Displacement hull', mass, centerOfMass: [0,0,0.2],
            sourcePose: [[1,0,0],[0,1,0],[0,0,1],[0,0,0]], rotation: [0,0,0], translation: [0,0,0], joint: null,
            mesh: {
                closed: true, duplicateVertices: 0, degenerateFaces: 0,
                vertices: [[-2,-1,0],[2,-1,0],[2,1,0],[-2,1,0],[-2,-1,1],[2,-1,1],[2,1,1],[-2,1,1]],
                triangles: [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],
            },
        }],
    };
}

async function saveBarge(owner, domainId, modelId = randomUUID(), baseRevisionId = null, mass) {
    const root = '/api/domains/' + domainId + '/dreamer-models/' + modelId + '/revisions/';
    const revisionId = randomUUID();
    const saved = await owner.mutate(root + revisionId, { baseRevisionId, model: model(mass) }, 'PUT');
    assert.equal(saved.status, 200, saved.text);
    return { modelId, revisionId, stability: root + revisionId + '/stability' };
}
module.exports = { saveBarge };
