import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import lodash from 'lodash';
import DroneLinkState from '../public/modules/DroneLinkState.mjs';
import { DroneLinkMsg } from '../public/modules/droneLinkMsg.mjs';

test('gateway socket observations reach live state and discovery; playback ignores incoming traffic', t => {
  const previous = globalThis._;
  globalThis._ = lodash;
  t.after(() => { globalThis._ = previous; });
  const socket = new EventEmitter();
  const state = new DroneLinkState(socket);
  state.localAddress = 254;
  const raw = [], discovered = [], sent = [];
  state.on('raw', msg => raw.push(msg));
  state.on('node.new', node => discovered.push(node));
  socket.on('sendMsg', bytes => sent.push(new DroneLinkMsg(bytes)));
  const incoming = new DroneLinkMsg();
  incoming.source = 11; incoming.node = 11; incoming.channel = 1; incoming.param = 13;
  incoming.setUint32([480]);

  socket.emit('DLM.msg', incoming.encodeUnframed());
  assert.deepEqual(state.getParamValues(11, 1, 13, [0]), [0]);
  state.goLive();
  socket.emit('DLM.msg', incoming.encodeUnframed());
  assert.deepEqual(state.getParamValues(11, 1, 13, [0]), [480]);
  assert.deepEqual(discovered, [11]);
  assert.equal(state.received, 1);
  assert.equal(raw.length, 1);
  state.processDiscoveryQueue();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].source, 254);
  assert.equal(sent[0].node, 11);
  assert.equal(sent[0].param, 8);
  assert.equal(sent[0].msgType, 7);

  state.liveMode = false;
  incoming.setUint32([999]);
  socket.emit('DLM.msg', incoming.encodeUnframed());
  assert.deepEqual(state.getParamValues(11, 1, 13, [0]), [480]);
  assert.equal(state.received, 1);
});
