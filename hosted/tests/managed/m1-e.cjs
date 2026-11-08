'use strict';
// M1-E: fixed staging and a newly created disposable Domain only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { openFirestoreStore } = require('@dronelink/persistence');
const { DRONE_LINK_MSG_TYPE_CHAR: CHAR, DRONE_LINK_MSG_TYPE_FLOAT: FLOAT, DRONE_LINK_MSG_TYPE_NAME: NAME } = require('@dronelink/protocol');
const ROOT = path.resolve(__dirname, '../../.cache/m1-e');
const ORIGIN = 'https://staging.dronewright.com';
const STATE = path.join(ROOT, 'fixture-state.json');
const actions = ['prepare', 'publish', 'advance', 'after-reset', 'cleanup'];
function validateDomain(domain, original, adminId) {
    assert.ok(domain && !original.some(row => row.name.endsWith('/documents/domains/' + domain._id)), 'Original Domains are excluded');
    assert.match(domain.name, /^M1-E acceptance \d{4}-\d{2}-\d{2}$/);
    assert.equal(domain.createdBy, adminId);
    assert.equal(domain.status, 'active', 'Fixture must remain active until credential cleanup');
}
async function main() {
    const [action, ...args] = process.argv.slice(2);
    assert.ok(actions.includes(action) && args.includes('--apply') && args[args.indexOf('--project') + 1] === 'dronelink-25dbc', 'Explicit staging project/action/--apply required');
    const original = JSON.parse(fs.readFileSync(path.join(ROOT, 'preservation-before.json')));
    const store = await openFirestoreStore({ projectId: 'dronelink-25dbc', databaseId: '(default)', observationEpoch: 'm1-c-1' });
    try {
        const control = await store.access.getControl(); assert.equal(control.state, 'ready');
        const admin = await store.users.getById(control.soleAdmin.userId); assert.equal(admin.email, 'damian@axford.me.uk'); assert.equal(admin.emailVerified, true);
        const actor = { userId: admin._id, sessionEpoch: control.sessionEpoch, allowedRoles: ['owner', 'editor', 'viewer'], allowPlatformAdmin: true };
        let state;
        const persist = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
        if (action === 'prepare') {
            assert.ok(args.includes('--domain') && !fs.existsSync(STATE), 'New fixture/state required');
            const domain = await store.domains.getById(args[args.indexOf('--domain') + 1]);
            validateDomain(domain, original, admin._id);
            assert.equal((await store.telemetry.listIdentities(actor, { domainId: domain._id })).nodes.length, 0);
            assert.equal(await store.packets.countRetained(domain._id), 0);
            state = { project: 'dronelink-25dbc', domainId: domain._id, apiKey: domain.apiKey, sent: 0 };
            fs.writeFileSync(STATE, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
            const secret = crypto.randomBytes(32).toString('base64url');
            const gateway = await store.telemetry.issueGateway(actor, { domainId: domain._id, name: 'M1-E managed synthetic relay', nodeAddress: 254, secretHash: crypto.createHash('sha256').update(secret).digest('hex') });
            state.gatewayId = gateway._id; state.credential = gateway._id + '.' + secret; state.prepared = true; persist();
            console.log(JSON.stringify({ prepared: true, domainId: domain._id, secretsPrinted: false })); return;
        }
        assert.equal(fs.lstatSync(STATE).isSymbolicLink(), false); assert.equal(fs.statSync(STATE).mode & 0o077, 0);
        state = JSON.parse(fs.readFileSync(STATE)); assert.equal(state.project, 'dronelink-25dbc'); if (action !== 'cleanup') assert.equal(state.prepared, true);
        let domain = await store.domains.getById(state.domainId); validateDomain(domain, original, admin._id);
        const snapshot = () => store.observations.readSnapshot(actor, { domainId: state.domainId });
        const identities = () => store.telemetry.listIdentities(actor, { domainId: state.domainId });
        const retained = () => store.packets.countRetained(state.domainId);
        async function wait(check) {
            const deadline = Date.now() + 30000;
            do { const value = await snapshot(); if (check(value)) return value; await new Promise(resolve => setTimeout(resolve, 250)); } while (Date.now() < deadline);
            throw Error('Fixture observations did not reach expected state');
        }
        async function machine(channel, param, type, values, gateway = false) {
            const payload = type === FLOAT ? Buffer.alloc(values.length * 4) : Buffer.from(values);
            if (type === FLOAT) values.forEach((value, index) => payload.writeFloatLE(value, index * 4));
            const bytes = Buffer.concat([Buffer.from([0, 7, channel, param, (type << 4) | (payload.length - 1)]), payload]);
            const response = await fetch(ORIGIN + '/addPacket', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(gateway ? { Authorization: 'Bearer ' + state.credential } : {}) },
                body: JSON.stringify({ domain: state.domainId, id: 254, packet: bytes.toString('base64'), ...(!gateway ? { apiKey: state.apiKey } : {}) }), redirect: 'error', signal: AbortSignal.timeout(30000) });
            await response.arrayBuffer(); return response.status;
        }
        async function send(...args) { assert.equal(await machine(...args), 202); state.sent++; persist(); }
        async function waitHistory(exact = true) {
            const deadline = Date.now() + 30000;
            while (await retained() < state.sent && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
            if (exact) assert.equal(await retained(), state.sent);
            else assert.ok(await retained() >= state.sent);
        }
        if (action === 'publish') {
            assert.ok(!state.published); assert.equal((await snapshot()).channels.length, 0);
            await send(1, 8, CHAR, 'E fixture');
            await send(2, 10, FLOAT, [-1.804, 51.575, 0]); await send(2, 5, CHAR, 'Nav');
            await send(4, 8, FLOAT, [-1.803, 51.576, 0], true); await send(4, 5, CHAR, 'NMEA');
            await send(4, 8, NAME, 'location');
            const first = await wait(page => !!page.channels.find(row => row.channel === 4)?.params['8']?.name && !!page.channels.find(row => row.channel === 4)?.params['8']?.value);
            const before = first.channels.find(row => row.channel === 4).params['8'].value;
            await send(9, 5, CHAR, 'NMEA'); await send(9, 8, FLOAT, [-1.802, 51.577, 0]);
            await send(4, 8, FLOAT, [-1.803, 51.576, 0], true);
            const current = await wait(page => page.channels.find(row => row.channel === 9)?.params['8']?.value && page.channels.find(row => row.channel === 4)?.params['8']?.value?.lastReceivedAt > before.lastReceivedAt);
            const location = current.channels.find(row => row.channel === 4).params['8'];
            assert.equal(location.value.valueLastChangedAt.getTime(), before.valueLastChangedAt.getTime());
            assert.equal(location.value.origin.kind, 'gateway'); assert.equal(location.value.origin.forwarderAddress, 254); assert.equal(location.name.origin.kind, 'http');
            await send(2, 10, FLOAT, [-1.8045, 51.5755, 0]);
            await send(9, 8, FLOAT, [-1.8025, 51.5775, 0]);
            await wait(page => [2, 9].every(channel => page.channels.find(row => row.channel === channel)?.params[channel === 2 ? '10' : '8']?.value?.lastReceivedAt > location.value.lastReceivedAt));
            const identity = await identities(); assert.equal(identity.nodes.length, 1); assert.equal(identity.nodes[0].address, 7); assert.equal(identity.drones.length, 1);
            await waitHistory(); state.identity = identity; state.generation = current.nodes[0].generation; state.published = true; persist();
            console.log(JSON.stringify({ managedInput: true, domainId: state.domainId, node: 7, singletonDroneId: identity.nodes[0].droneId, channels: current.channels.length, mappingCandidates: ['Nav 2.10 priority2', 'NMEA 4.8 priority3', 'NMEA 9.8 priority3'], gatewaySource: 254, unchangedRefreshesReceiptOnly: true, independentHttpName: true, retainedPackets: state.sent }));
        } else if (action === 'advance') {
            assert.equal(state.published, true); assert.ok(!state.advanced);
            await send(4, 8, FLOAT, [-1.801, 51.578, 0], true);
            await wait(page => page.channels.find(row => row.channel === 4)?.params['8']?.value?.payload === Buffer.from(new Float32Array([-1.801, 51.578, 0]).buffer).toString('base64'));
            state.advanced = true; persist(); console.log(JSON.stringify({ freshLocation: true, selectedAddress: '7>4.8', gatewaySource: 254 }));
        } else if (action === 'after-reset') {
            assert.equal(state.published, true); assert.ok(!state.rebuilt);
            const cleared = await snapshot(); assert.equal(cleared.nodes[0].generation, state.generation + 1); assert.equal(cleared.channels.length, 0);
            assert.deepEqual(JSON.parse(JSON.stringify(await identities())), state.identity); await waitHistory();
            const historyBefore = await retained();
            await send(4, 5, CHAR, 'NMEA'); await send(4, 8, FLOAT, [-1.8, 51.579, 0], true);
            const rebuilt = await wait(page => page.channels.find(row => row.channel === 4)?.params['8']?.value);
            assert.equal(rebuilt.channels.length, 1); assert.equal(rebuilt.channels[0].params['8'].name, undefined);
            assert.deepEqual(JSON.parse(JSON.stringify(await identities())), state.identity);
            state.rebuilt = true; persist();
            console.log(JSON.stringify({ resetGeneration: state.generation + 1, identityPreserved: true, priorHistoryRetained: historyBefore, rebuiltChannels: 1, oldNameExcluded: true }));
        } else {
            await waitHistory(false); const historyBeforeCleanup = await retained();
            const identityBeforeCleanup = JSON.parse(JSON.stringify(await identities()));
            const page = await store.telemetry.listGateways(actor, { domainId: state.domainId, limit: 100 }); assert.ok(!page.nextCursor, 'Unexpected credential pagination');
            for (const row of page.items) if (!row.revokedAt) await store.telemetry.revokeGateway(actor, { domainId: state.domainId, gatewayId: row._id, revision: row.revision });
            domain = await store.domains.getById(state.domainId);
            domain = await store.domains.rotateKey(actor, { domainId: state.domainId, revision: domain.revision, newKey: crypto.randomBytes(32).toString('hex') });
            assert.equal(await machine(4, 8, FLOAT, [-1.8, 51.579, 0]), 401);
            if (state.credential) assert.equal(await machine(4, 8, FLOAT, [-1.8, 51.579, 0], true), 401);
            const revoked = await store.telemetry.listGateways(actor, { domainId: state.domainId, limit: 100 });
            assert.ok(!revoked.nextCursor && revoked.items.every(row => row.revokedAt));
            domain = await store.domains.archive(actor, { domainId: state.domainId, revision: domain.revision }); assert.equal(domain.status, 'archived');
            assert.equal(await retained(), historyBeforeCleanup);
            assert.deepEqual(JSON.parse(JSON.stringify(await identities())), identityBeforeCleanup);
            state.cleaned = true; persist(); console.log(JSON.stringify({ fixtureArchived: true, directKeyRotated: true, gatewayRevoked: true, oldCredentialsRejected: true, historyRetained: true }));
        }
    } finally { await store.close(); }
}
module.exports = { validateDomain };
if (require.main === module) main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
