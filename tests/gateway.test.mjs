import test from 'node:test';
import assert from 'node:assert/strict';
import DroneLinkManager from '../public/modules/DroneLinkManager.mjs';
import { DroneLinkMsg } from '../public/modules/droneLinkMsg.mjs';
import { DroneMeshMsg } from '../public/modules/DroneMeshMsg.mjs';

function gateway(t, credentials = true) {
  t.mock.method(globalThis, 'setInterval', () => 0);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({url, body:JSON.parse(options.body), headers:options.headers});
    return url.endsWith('/gateway/verify') ? {ok:true,status:200,json:async()=>({data:{domainId:'test-domain',nodeAddress:250,capabilities:['telemetry']}})} : {ok:true,status:202};
  });
  const manager = new DroneLinkManager(250, () => {}, credentials ? 'test-domain' : '', '', credentials ? {url:'https://cloud.example',credential:'gateway.'+'a'.repeat(43)} : {});
  manager.logOptions.DroneLinkMsg = false;
  const events = [];
  manager.io = {emit:(name, payload) => events.push({name,payload})};
  return {manager,requests,events};
}
const raw = Uint8Array.from([0,2,3,0x48,0x23,0x78,0x56,0x34,0x12]);
function incoming(nextNode = 250, destNode = 250, bytes = raw) {
  const mesh = new DroneMeshMsg();
  mesh.srcNode=2; mesh.txNode=2; mesh.nextNode=nextNode; mesh.destNode=destNode;
  mesh.setPayloadSize(bytes.length); mesh.uint8_tPayload.set(bytes);
  return mesh;
}

test('addressed packets emit exact bytes and relay; identical copies suppressed only for cloud', async t => {
  const {manager,requests,events} = gateway(t);
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.equal(events.length, 2);
  assert.equal(events[0].name, 'DLM.msg');
  assert.deepEqual(events[0].payload, raw);
  assert.equal(requests.filter(x=>x.url.endsWith('/addPacket')).length, 1);
  assert.equal(requests.find(x=>x.url.endsWith('/addPacket')).body.packet, Buffer.from(raw).toString('base64'));
  assert.deepEqual(requests.find(x=>x.url.endsWith('/addPacket')).body, {domain:'test-domain',id:250,packet:Buffer.from(raw).toString('base64')});
  const changed = Uint8Array.from(raw); changed[5] = 0x79;
  await manager.receiveDroneLinkMsg({}, incoming(250,250,changed), 0);
  assert.equal(requests.filter(x=>x.url.endsWith('/addPacket')).length, 2);
  assert.equal(manager.cloudPacketsSent, 2);
});

test('packets addressed to a different next hop or destination are not delivered locally', async t => {
  const {manager,requests,events} = gateway(t);
  await manager.receiveDroneLinkMsg({}, incoming(251,250), 0);
  await manager.receiveDroneLinkMsg({}, incoming(250,251), 0);
  assert.equal(events.length, 0);
  assert.equal(requests.length, 0);
});

test('confirmed subscribed node traffic follows the existing addressed receive path', async t => {
  const {manager,requests,events} = gateway(t);
  const peer = {heard:true,subState:1,subTimer:0};
  // Routing discovery is outside this replay; exercise the actual subscription handler.
  t.mock.method(manager, 'getNodeInfo', node => node === 2 ? peer : undefined);
  manager.receiveSubscriptionResponse({}, {srcNode:2,destNode:251}, 0);
  assert.equal(peer.subState, 1);
  manager.receiveSubscriptionResponse({}, {srcNode:2,destNode:250}, 0);
  assert.equal(peer.subState, 2);
  assert.ok(peer.subTimer > 0);
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.deepEqual(events[0].payload, raw);
  assert.equal(requests.filter(x=>x.url.endsWith('/addPacket')).length, 1);
});

test('local delivery remains available without configured cloud credentials', async t => {
  const {manager,requests,events} = gateway(t, false);
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.equal(events.length, 1);
  assert.equal(requests.length, 0);
});

test('corrected uint32 packets retain their complete payload through cloud relay', async t => {
  const {manager,requests} = gateway(t);
  const msg = new DroneLinkMsg(); msg.setUint32([0x12345678]);
  await manager.sendRxPacketToCloud(msg);
  assert.deepEqual([...Buffer.from(requests.find(x=>x.url.endsWith('/addPacket')).body.packet,'base64')], [0,0,0,0,0x23,0x78,0x56,0x34,0x12]);
});

test('failed cloud acceptance does not suppress a later unchanged publication', async t => {
  const {manager,requests,events} = gateway(t);
  let reject = true;
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/addPacket') && reject) { requests.push({url,body:JSON.parse(options.body)}); return {status:503,ok:false}; }
    return original(url, options);
  });
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.equal(manager.cloudPacketsSent, 0);
  reject = false;
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.equal(manager.cloudPacketsSent, 1);
  assert.equal(events.length, 3);
  assert.equal(requests.filter(x=>x.url.endsWith('/addPacket')).length, 2);
  assert.equal(requests.filter(x=>x.url.endsWith('/gateway/verify')).length, 2);
});
test('malformed raw payloads never become normalized cloud packets or local observations', async t => {
  const {manager,requests,events} = gateway(t);
  for (const bytes of [raw.slice(0, 7), Uint8Array.from([...raw, 0]), Uint8Array.from([0,2,3,8,0x21,1,2])]) await manager.receiveDroneLinkMsg({}, incoming(250,250,bytes), 0);
  assert.equal(requests.length, 0); assert.equal(events.length, 0);
});
test('relay setup rejects unsafe URLs and mismatched association without losing local delivery', async t => {
  t.mock.method(globalThis, 'setInterval', () => 0);
  for (const url of ['http://cloud.example', 'https://name:secret@cloud.example', 'https://cloud.example/path', 'https://cloud.example?key=x']) assert.throws(()=>new DroneLinkManager(250,()=>{},'domain','',{url,credential:'gateway.'+'a'.repeat(43)}));
  const {manager,events} = gateway(t);
  t.mock.method(globalThis, 'fetch', async () => ({ok:true,status:200,json:async()=>({data:{domainId:'wrong',nodeAddress:250,capabilities:['telemetry']}})}));
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.equal(events.length, 1); assert.equal(manager.cloudPacketsSent, 0);
});
test('overlapping changed publications are coalesced and ordered behind an in-flight upload', async t => {
  const {manager,requests} = gateway(t);
  const original = globalThis.fetch; let release; let started;
  const uploading = new Promise(resolve=>{started=resolve;});
  const gate = new Promise(resolve=>{release=resolve;});
  t.mock.method(globalThis, 'fetch', async (url, options) => { if (url.endsWith('/addPacket')) { started(); await gate; } return original(url, options); });
  const first = manager.receiveDroneLinkMsg({}, incoming(), 0);
  await uploading;
  const changed = Uint8Array.from(raw); changed[5] = 0x79;
  const second = manager.receiveDroneLinkMsg({}, incoming(250,250,changed), 0);
  release(); await Promise.all([first, second]);
  assert.equal(requests.filter(x=>x.url.endsWith('/addPacket')).length, 2);
  await manager.receiveDroneLinkMsg({}, incoming(250,250,changed), 0);
  assert.equal(manager.cloudPacketsSent, 2);
});
test('a changed publication received immediately after a suppressed duplicate is still sent', async t => {
  const {manager,requests} = gateway(t);
  await manager.receiveDroneLinkMsg({}, incoming(), 0);
  const duplicate = manager.receiveDroneLinkMsg({}, incoming(), 0);
  const changed = Uint8Array.from(raw); changed[5] = 0x79;
  const update = manager.receiveDroneLinkMsg({}, incoming(250,250,changed), 0);
  await Promise.all([duplicate, update]);
  const uploads = requests.filter(x=>x.url.endsWith('/addPacket'));
  assert.equal(uploads.length, 2); assert.equal(uploads[1].body.packet, Buffer.from(changed).toString('base64'));
});
