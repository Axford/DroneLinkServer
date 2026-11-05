import test from 'node:test';
import assert from 'node:assert/strict';
import DroneLinkManager from '../public/modules/DroneLinkManager.mjs';
import { DroneLinkMsg } from '../public/modules/droneLinkMsg.mjs';

function gateway(t, credentials = true) {
  t.mock.method(globalThis, 'setInterval', () => 0);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({url, body:JSON.parse(options.body)});
    return {status:200,statusText:'OK'};
  });
  const manager = new DroneLinkManager(250, () => {}, credentials ? 'test-domain' : '', credentials ? 'test-key' : '');
  manager.logOptions.DroneLinkMsg = false;
  const events = [];
  manager.io = {emit:(name, payload) => events.push({name,payload})};
  return {manager,requests,events};
}
const raw = Uint8Array.from([0,2,3,0x48,0x23,0x78,0x56,0x34,0x12]);
function incoming(nextNode = 250, destNode = 250) {
  return {srcNode:2,txNode:2,nextNode,destNode,rawPayload:raw.buffer};
}

test('addressed packets emit exact bytes and relay; identical copies suppressed only for cloud', t => {
  const {manager,requests,events} = gateway(t);
  manager.receiveDroneLinkMsg({}, incoming(), 0);
  manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.equal(events.length, 2);
  assert.equal(events[0].name, 'DLM.msg');
  assert.deepEqual(events[0].payload, raw);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.packet, Buffer.from(raw).toString('base64'));
  assert.deepEqual(requests[0].body, {domain:'test-domain',apiKey:'test-key',id:250,node:2,channel:3,param:8,msgType:2,packet:Buffer.from(raw).toString('base64')});
  const changed = Uint8Array.from(raw); changed[5] = 0x79;
  manager.receiveDroneLinkMsg({}, {...incoming(),rawPayload:changed.buffer}, 0);
  assert.equal(requests.length, 2);
  assert.equal(manager.cloudPacketsSent, 2);
});

test('packets addressed to a different next hop or destination are not delivered locally', t => {
  const {manager,requests,events} = gateway(t);
  manager.receiveDroneLinkMsg({}, incoming(251,250), 0);
  manager.receiveDroneLinkMsg({}, incoming(250,251), 0);
  assert.equal(events.length, 0);
  assert.equal(requests.length, 0);
});

test('confirmed subscribed node traffic follows the existing addressed receive path', t => {
  const {manager,requests,events} = gateway(t);
  const peer = {heard:true,subState:1,subTimer:0};
  // Routing discovery is outside this replay; exercise the actual subscription handler.
  t.mock.method(manager, 'getNodeInfo', node => node === 2 ? peer : undefined);
  manager.receiveSubscriptionResponse({}, {srcNode:2,destNode:251}, 0);
  assert.equal(peer.subState, 1);
  manager.receiveSubscriptionResponse({}, {srcNode:2,destNode:250}, 0);
  assert.equal(peer.subState, 2);
  assert.ok(peer.subTimer > 0);
  manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.deepEqual(events[0].payload, raw);
  assert.equal(requests.length, 1);
});

test('local delivery remains available without configured cloud credentials', t => {
  const {manager,requests,events} = gateway(t, false);
  manager.receiveDroneLinkMsg({}, incoming(), 0);
  assert.equal(events.length, 1);
  assert.equal(requests.length, 0);
});

test('corrected uint32 packets retain their complete payload through cloud relay', t => {
  const {manager,requests} = gateway(t);
  const msg = new DroneLinkMsg(); msg.setUint32([0x12345678]);
  manager.sendRxPacketToCloud(msg);
  assert.deepEqual([...Buffer.from(requests[0].body.packet,'base64')], [0,0,0,0,0x23,0x78,0x56,0x34,0x12]);
});
