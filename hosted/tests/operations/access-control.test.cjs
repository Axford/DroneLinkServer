'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../../tools/access-control.cjs');
const target = ['--project', 'demo-access-tests', '--database', '(default)', '--emulator', '127.0.0.1:8080'];
test('operator requires explicit target and refuses ambient/emulator/managed ambiguity', () => {
    for (const args of [[], ['plan'], ['plan', '--project', 'demo-access-tests'], ['plan', ...target, '--managed'], ['plan', ...target, '--emulator', '127.0.0.1:9'], ['plan', ...target, '--unknown'], ['plan', '--project', 'production', '--database', '(default)', '--managed', '--output', '/tmp/never']]) assert.throws(() => parseArgs(args));
    assert.equal(parseArgs(['plan', ...target, '--output', '/tmp/private-preview']).command, 'plan');
});
test('mutations require reviewed plan/revision and explicit stopped old runtime traffic', () => {
    for (const args of [['apply', ...target], ['apply', ...target, '--plan', '/tmp/plan', '--apply'], ['activate', ...target, '--plan', '/tmp/plan', '--apply'], ['recover-admin', ...target, '--plan', '/tmp/plan', '--old-google-id', 'old', '--new-google-id', 'new', '--apply', '--revision', '1']]) assert.throws(() => parseArgs(args));
    assert.equal(parseArgs(['apply', ...target, '--plan', '/tmp/plan', '--apply', '--stopped-traffic']).command, 'apply');
    assert.equal(parseArgs(['grant-admin', ...target, '--plan', '/tmp/plan', '--google-id', 'subject']).flags.apply, undefined);
});
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { createRequire } = require('node:module');
const { withFirestore } = require('../../tools/firestore.cjs');
const operatorRequire = createRequire(path.resolve(__dirname, '../../tools/access-control/package.json'));
const execute = promisify(execFile);
test('installed CLI migration, check, repair preview/apply and activation complete before owned storage closes', async () => withFirestore(async options => {
    const { Firestore } = require('@google-cloud/firestore');
    const crypto = require('node:crypto');
    const { openFirestoreStore } = operatorRequire('@dronelink/persistence');
    const native = new Firestore({ projectId: options.projectId, host: options.emulatorHost, ssl: false }); const runtime = await openFirestoreStore(options);
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dronelink-access-cli-'));
    try {
        // Persist actual SEP-06 record shapes as a migration fixture; no legacy runtime fallback.
        const owner = { _id: 'legacy-owner' }; const member = { _id: 'legacy-member' };
        const domain = { _id: 'legacy-domain', apiKey: 'legacy-key', inviteToken: 'legacy-invite' }; const now = new Date();
        await native.doc('users/' + owner._id).set({ googleId: 'damian-cli', email: 'damian@axford.me.uk', displayName: 'Damian', domains: [domain._id], createdAt: now });
        await native.doc('users/' + member._id).set({ googleId: 'member-cli', email: 'member@example.test', displayName: 'Member', domains: [], createdAt: now });
        await native.doc('uniqueKeys/google-' + crypto.createHash('sha256').update('damian-cli').digest('hex')).set({ ownerId: owner._id });
        await native.doc('domains/' + domain._id).set({ name: 'CLI migration fixture', apiKey: domain.apiKey, inviteToken: domain.inviteToken, users: [owner._id], createdBy: owner._id, createdAt: now, updatedAt: now, revision: 1 });
        await runtime.users.registerVerifiedSignIn({ googleId: 'damian-cli', email: 'damian@axford.me.uk', displayName: 'Damian', emailVerified: true });
        const targetArgs = ['--project', options.projectId, '--database', '(default)', '--emulator', options.emulatorHost];
        const cli = async (command, extra = []) => {
            const result = await execute(process.execPath, [path.resolve(__dirname, '../../tools/access-control.cjs'), command, ...targetArgs, ...extra], { timeout: 20000 });
            assert.ok(!result.stdout.includes(domain.apiKey)); assert.ok(!result.stdout.includes(domain.inviteToken)); return JSON.parse(result.stdout);
        };
        const planPath = path.join(temporary, 'reviewed.json');
        const preview = await cli('plan', ['--output', planPath]); assert.equal(preview.domainCount, 1); assert.equal((await fs.stat(planPath)).mode & 0o777, 0o600);
        const reviewed = ['--plan', planPath];
        await cli('apply', [...reviewed, '--apply', '--stopped-traffic']);
        await cli('apply', [...reviewed, '--apply', '--stopped-traffic']);
        const before = await runtime.access.getControl();
        assert.equal((await cli('grant-admin', [...reviewed, '--google-id', 'damian-cli'])).applied, undefined);
        await cli('grant-admin', [...reviewed, '--google-id', 'damian-cli', '--apply', '--revision', String(before.revision)]);
        assert.deepEqual((await cli('check', reviewed)).issues, []);
        let current = await runtime.domains.getById(domain._id);
        const repair = ['--domain', domain._id, '--user', member._id, '--reason', 'Reviewed CLI Owner handover', '--revision', String(current.revision)];
        assert.equal((await cli('repair-owner', repair)).applied, false);
        assert.equal((await runtime.domains.getById(domain._id)).members[member._id], undefined);
        assert.equal((await cli('repair-owner', [...repair, '--apply'])).applied, true);
        const control = await runtime.access.getControl();
        assert.equal((await cli('activate', [...reviewed, '--apply', '--revision', String(control.revision)])).state, 'ready');
        assert.deepEqual((await cli('check', reviewed)).issues, []);
        current = await runtime.domains.getById(domain._id); assert.equal(current.apiKey, domain.apiKey); assert.equal(current.members[member._id], 'owner');
    } finally { await native.terminate(); await runtime.close(); await fs.rm(temporary, { recursive: true, force: true }); }
}));
