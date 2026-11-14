import assert from 'node:assert/strict';
import { test } from 'node:test';
import createParameterOperations from '../workbench-parameters.mjs';
import { FileError } from '../workbench-files.mjs';
import { DRONE_LINK_MSG_TYPE_CHAR as CHAR, DRONE_LINK_MSG_TYPE_QUERY as QUERY } from '../public/modules/droneLinkMsg.mjs';

const target = { nodeAddress: 3, channel: 1, param: 21 };
const body = { target, expected: { msgType: CHAR, payloadBytes: 1 }, payload: { text: 'probe.ini' } };

function fixture() {
  const packets = [];
  let available = true;
  let hop = 3;
  let writable = true;
  const manager = { node: 254, generateDroneLinkMessage: (adapter, msg, nextHop, receipt) => {
    packets.push({ adapter, msg, nextHop, receipt });
    return true;
  } };
  const run = createParameterOperations({
    fileRoute: (_node, transport) => ({ manager, assertAvailable: () => {
      if (!available) throw new FileError(503, 'Route unavailable');
      return { nextHop: hop, netInterface: transport };
    } }),
    parameterMetadata: transport => transport === 'wifi' ? { writable, msgType: CHAR, msgLength: 1 } : undefined,
  });
  return { packets, run, setAvailable: value => { available = value; },
    setHop: value => { hop = value; }, setWritable: value => { writable = value; } };
}

test('queues a typed system write from known metadata and queries only after receipt on the same path', () => {
  const { run, packets } = fixture();
  assert.equal(run('write', 'wifi', body).status, 'queued');
  assert.equal(packets.length, 1);
  assert.equal(packets[0].adapter, 'wifi');
  assert.equal(packets[0].msg.param, 21);
  assert.equal(packets[0].msg.msgLength, 9);
  assert.equal(packets[0].msg.payloadToString(), 'probe.ini');
  packets[0].receipt(3);
  assert.equal(packets.length, 2);
  assert.equal(packets[1].msg.msgType, QUERY);
  assert.equal(packets[1].nextHop, 3);
});

test('rejects wrong metadata, wrong path, read-only targets and invalid payloads without dispatch', () => {
  const { run, packets, setWritable } = fixture();
  assert.throws(() => run('write', 'serial', body), { status: 409 });
  assert.throws(() => run('write', 'wifi', { ...body, expected: { msgType: CHAR, payloadBytes: 15 } }), { status: 409 });
  assert.throws(() => run('write', 'wifi', { ...body, payload: { text: 'a\x00b' } }), { status: 400 });
  setWritable(false);
  assert.throws(() => run('write', 'wifi', body), { status: 409 });
  assert.equal(packets.length, 0);
});

test('route loss and route replacement neither queue readback across that change nor replay a write', () => {
  const { run, packets, setAvailable, setHop } = fixture();
  run('write', 'wifi', body);
  setAvailable(false);
  packets[0].receipt(3);
  setAvailable(true);
  assert.equal(packets.length, 1);
  run('write', 'wifi', body);
  setHop(11);
  packets[1].receipt(3);
  assert.equal(packets.length, 2);
});
