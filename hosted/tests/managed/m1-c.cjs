'use strict';
// Approved C.4 staging fixtures only. Never mutate an existing operational Domain.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict'); const crypto = require('node:crypto');
const { openFirestoreStore } = require('@dronelink/persistence');
const action = process.argv[2], args = process.argv.slice(3); const flag = name => args[args.indexOf(name) + 1];
if (!['prepare', 'check', 'after-reset', 'cleanup'].includes(action) || !args.includes('--apply') || flag('--project') !== 'dronelink-25dbc' || !args.includes('--state')) throw Error('Explicit approved action/project/private state/--apply required');
const statePath = path.resolve(flag('--state')); const origin = 'https://staging.dronewright.com';
if (!statePath.startsWith(path.resolve(__dirname, '../../.cache/m1-c') + path.sep)) throw Error('State must remain in private C.4 evidence directory');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function main() {
 const store = await openFirestoreStore({ projectId: 'dronelink-25dbc', databaseId: '(default)', observationEpoch: 'm1-c-1' });
 try {
  const control = await store.access.getControl(); assert.equal(control.state, 'ready');
  const admin = await store.users.getById(control.soleAdmin.userId); assert.equal(admin.email, 'damian@axford.me.uk'); assert.equal(admin.emailVerified, true);
  const actor = { userId: admin._id, sessionEpoch: control.sessionEpoch, allowedRoles: ['owner', 'editor', 'viewer'], allowPlatformAdmin: true };
  const original = JSON.parse(fs.readFileSync(path.join(path.dirname(statePath), 'preservation-before.json')));
  const fixture = async id => { assert.ok(!original.some(item => item.name.endsWith('/documents/domains/' + id)), 'Pre-existing Domains are excluded from C.4 mutations'); const row = await store.domains.getById(id); assert.match(row?.name || '', /^M1-C acceptance \d{4}-\d{2}-\d{2}$/); assert.equal(row.createdBy, admin._id); return row; };
  let state;
  const persist = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  const snapshot = () => store.observations.readSnapshot(actor, { domainId: state.domainId });
  const identities = () => store.telemetry.listIdentities(actor, { domainId: state.domainId });
  async function wait(check) { const deadline = Date.now() + 30000; while (true) { const value = await snapshot(); if (check(value)) return value; if (Date.now() > deadline) throw Error('Fixture snapshot did not reach expected state'); await new Promise(resolve => setTimeout(resolve, 200)); } }
  async function machine(packet, gateway = false, extra = {}) {
   const response = await fetch(origin + '/addPacket', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(gateway ? { Authorization: 'Bearer ' + state.credential } : {}) },
    body: JSON.stringify({ domain: state.domainId, id: 254, packet: Buffer.from(packet).toString('base64'), ...(!gateway ? { apiKey: state.apiKey } : {}), ...extra }), redirect: 'error', signal: AbortSignal.timeout(30000) });
   await response.arrayBuffer(); return response.status;
  }
  if (action === 'prepare') {
   if (fs.existsSync(statePath) || !args.includes('--domain')) throw Error('New private state and Admin-created C fixture Domain required');
   const domain = await fixture(flag('--domain')); assert.equal(domain.status, 'active');
   assert.equal((await store.telemetry.listIdentities(actor, { domainId: domain._id })).nodes.length, 0); assert.equal(await store.packets.countRetained(domain._id), 0);
   state = { project: 'dronelink-25dbc', domainId: domain._id, domainName: domain.name, apiKey: domain.apiKey, prepared: false };
   fs.writeFileSync(statePath, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
   const secret = crypto.randomBytes(32).toString('base64url');
   const gateway = await store.telemetry.issueGateway(actor, { domainId: domain._id, name: 'M1-C managed fixture relay', nodeAddress: 254, secretHash: hash(secret) });
   state.gatewayId = gateway._id; state.credential = gateway._id + '.' + secret; state.prepared = true; persist();
   console.log(JSON.stringify({ prepared: true, domainId: domain._id, gatewayId: gateway._id, secretsPrinted: false })); return;
  }
  assert.equal(fs.lstatSync(statePath).isSymbolicLink(), false); assert.equal(fs.statSync(statePath).mode & 0o077, 0);
  state = JSON.parse(fs.readFileSync(statePath)); assert.equal(state.project, 'dronelink-25dbc');
  let domain = await fixture(state.domainId);
  if (action === 'check') {
   assert.equal(state.prepared, true); assert.ok(!state.checked);
   const initial = await snapshot(); assert.equal(initial.channels.length, 0);
   assert.equal(await machine([0,7,1,1,0,42]), 202);
   const first = await wait(page => page.channels[0]?.params['1'].value?.payload === 'Kg=='); const changed = first.channels[0].params['1'].value.valueLastChangedAt.getTime();
   assert.equal(await machine([0,7,1,1,0,42]), 202);
   const unchanged = await wait(page => page.channels[0]?.params['1'].value.lastReceivedAt > first.channels[0].params['1'].value.lastReceivedAt);
   assert.equal(unchanged.channels[0].params['1'].value.valueLastChangedAt.getTime(), changed);
   const receipt = unchanged.channels[0].params['1'].value.lastReceivedAt.getTime(); const name = Buffer.from('managed');
   assert.equal(await machine([0,7,1,1,80 | (name.length - 1),...name], true), 202);
   const named = await wait(page => !!page.channels[0]?.params['1'].name); assert.equal(named.channels[0].params['1'].value.lastReceivedAt.getTime(), receipt);
   assert.equal(named.channels[0].params['1'].name.origin.kind, 'gateway'); assert.equal(named.channels[0].params['1'].value.origin.kind, 'http');
   assert.equal(await machine([254,99,1,1,112,0]), 202); await new Promise(resolve => setTimeout(resolve, 1200));
   const identity = await identities(); assert.equal(identity.nodes.length, 1); assert.equal(identity.nodes[0].address, 7);
   const current = await snapshot(); assert.equal(current.nodes.length, 1); assert.equal(current.channels[0].params['1'].value.lastReceivedAt.getTime(), receipt);
   const changes = await store.observations.readUpdates(actor, { domainId: state.domainId, cursor: initial.startCursor }); assert.ok(changes.events.length);
   const historyDeadline = Date.now() + 30000;
   while ((await store.packets.countRetained(state.domainId)) < 4 && Date.now() < historyDeadline) await new Promise(resolve => setTimeout(resolve, 200));
   state.identity = identity; state.beforeGeneration = current.nodes[0].generation; state.beforeHistory = await store.packets.countRetained(state.domainId); assert.equal(state.beforeHistory, 4);
   state.beforeCursor = changes.cursor; state.checked = true; persist();
   const result = { managedChecksPassed: true, domainId: state.domainId, nodeAddress: 7, observedValue: 42, generation: state.beforeGeneration, unchangedRefreshesReceiptOnly: true, independentNameSourceTime: true, queryDoesNotCreateOrRefreshObservations: true, retainedPackets: state.beforeHistory };
   fs.writeFileSync(statePath + '.checks.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } else if (action === 'after-reset') {
   assert.equal(state.checked, true); assert.ok(!state.rebuilt);
   const cleared = await snapshot(); assert.equal(cleared.nodes[0].generation, state.beforeGeneration + 1); assert.equal(cleared.channels.length, 0);
   assert.deepEqual(JSON.parse(JSON.stringify(await identities())), state.identity); assert.equal(await store.packets.countRetained(state.domainId), state.beforeHistory);
   await new Promise(resolve => setTimeout(resolve, 1200)); assert.equal((await snapshot()).channels.length, 0);
   assert.equal(await machine([0,7,1,1,0,43], true), 202);
   const rebuilt = await wait(page => page.channels[0]?.generation === state.beforeGeneration + 1 && page.channels[0]?.params['1'].value?.payload === 'Kw==');
   assert.equal(rebuilt.channels[0].params['1'].name, undefined); assert.equal(rebuilt.channels[0].params['1'].value.origin.kind, 'gateway');
   assert.deepEqual(JSON.parse(JSON.stringify(await identities())), state.identity);
   assert.equal((await store.observations.getDiagnostics(actor, { domainId: state.domainId })).snapshotWriteFailures, 0);
   state.rebuilt = true; persist();
   const result = { resetClearsStructure: true, preResetReplayExcluded: true, generation: state.beforeGeneration + 1, identityPreserved: true, retainedHistoryPreserved: true, freshGatewayPublicationRebuilds: true, oldNameDoesNotReappear: true, observedValue: 43, savedFailureCount: 0 };
   fs.writeFileSync(statePath + '.reset-result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } else {
   assert.equal(domain.status, 'active', 'Cleanup must invalidate keys before archiving the fixture');
   const page = await store.telemetry.listGateways(actor, { domainId: domain._id, limit: 100 });
   assert.ok(!page.nextCursor, 'Unexpected credential pagination requires explicit cleanup');
   for (const credential of page.items) if (!credential.revokedAt) await store.telemetry.revokeGateway(actor, { domainId: domain._id, gatewayId: credential._id, revision: credential.revision });
   if (domain.status === 'active') {
    domain = await store.domains.getById(domain._id);
    domain = await store.domains.rotateKey(actor, { domainId: domain._id, revision: domain.revision, newKey: crypto.randomBytes(32).toString('hex') });
    assert.equal(await machine([0,7,1,1,0,43]), 401); assert.equal(await machine([0,7,1,1,0,43], true), 401);
    domain = await store.domains.archive(actor, { domainId: domain._id, revision: domain.revision });
   }
   assert.equal(domain.status, 'archived'); state.cleaned = true; persist(); console.log(JSON.stringify({ fixtureArchived: true, oldDomainKeyInvalidated: true, gatewayCredentialsRevoked: true, historyRetained: true }));
  }
 } finally { await store.close(); }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
