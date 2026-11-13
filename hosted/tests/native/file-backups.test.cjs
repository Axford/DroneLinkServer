'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { fixture, domain, join } = require('./support.cjs');

test('connected files and hosted backup history enforce role, capability and Domain boundaries', async t => {
    await fixture(t, async ({ agent, factories }) => {
        const owner = await agent('admin');
        const editor = await agent('editor', 1);
        const viewer = await agent('viewer', 1);
        const fleet = await domain(owner);
        const other = await domain(owner, 'Other Domain');
        const prefix = '/api/domains/' + fleet._id;
        await join(owner, editor, fleet._id, 'editor', 'editor');
        await join(owner, viewer, fleet._id, 'viewer', 'viewer');
        const issue = async fileBackup => {
            const response = await owner.mutate(prefix + '/gateways', { name: 'Bench', nodeAddress: 246, fileBackup });
            assert.equal(response.status, 201);
            return response.json().data;
        };
        const relay = await issue(false);
        const enabled = await issue(true);
        const machine = factories[1]();
        const stream = randomUUID();
        const snapshot = { domain: fleet._id, id: 246, nodeAddress: 11, path: '/sample.txt', text: 'original\r\n',
            capturedAt: new Date().toISOString(), stream, sequence: 1 };
        const send = (endpoint, body, credential) => machine.request(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: 'Bearer ' + credential } : {}) },
            body: JSON.stringify(body),
        });
        const save = (body, credential = enabled.credential) => send('/gateway/workbench/file-backups', body, credential);
        const verify = await send('/gateway/verify', snapshot, enabled.credential);
        assert.deepEqual(verify.json().data.capabilities, ['telemetry', 'file-backup']);
        assert.equal((await save(snapshot, relay.credential)).status, 401);
        assert.equal((await save({ ...snapshot, domain: other._id })).status, 401);
        assert.equal((await save(snapshot)).status, 200);
        assert.equal((await save(snapshot)).status, 200);
        const history = prefix + '/nodes/11/file-backups';
        const query = '?path=%2Fsample.txt';
        const list = await editor.request(history + query);
        assert.equal(list.status, 200);
        assert.equal(list.json().data.length, 1);
        assert.equal(list.json().data[0].text, undefined);
        assert.equal((await viewer.request(history + query)).status, 403);
        assert.equal((await editor.request(history.replace(fleet._id, other._id) + query)).status, 403);
        const version = await editor.request(history + '/' + encodeURIComponent(list.json().data[0].id) + query);
        assert.equal(version.json().data.text, snapshot.text);
        for (const [browser, status] of [[editor, 200], [viewer, 403]]) {
            const result = await browser.mutate(prefix + '/workbench-grant', { gatewayId: enabled.gateway._id });
            assert.equal(result.status, 200);
            const { grant } = result.json().data;
            const authorize = await send('/gateway/workbench/authorize',
                { domain: fleet._id, id: 246, grant, action: 'node-files' }, enabled.credential);
            assert.equal(authorize.status, status);
        }
        assert.equal((await owner.mutate(prefix + '/gateways/' + enabled.gateway._id, { revision: enabled.gateway.revision }, 'DELETE')).status, 200);
        assert.equal((await save({ ...snapshot, sequence: 2, text: 'later' })).status, 401);
    });
});
