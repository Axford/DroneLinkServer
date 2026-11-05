import test from 'node:test';
import assert from 'node:assert/strict';
import { DroneLinkMsg } from '../public/modules/droneLinkMsg.mjs';

test('uint32 scalar uses four little-endian payload bytes as defined by firmware', () => {
  const msg = new DroneLinkMsg();
  msg.setUint32([0x12345678]);
  assert.equal(msg.msgLength, 4);
  assert.deepEqual([...msg.encodeUnframed()], [0,0,0,0,0x23,0x78,0x56,0x34,0x12]);
});

test('uint32 four-element payload occupies all sixteen firmware payload bytes', () => {
  const msg = new DroneLinkMsg();
  msg.setUint32([0x12345678,0,0xffffffff,0x01020304]);
  assert.equal(msg.msgLength, 16);
  assert.deepEqual([...msg.encodeUnframed()], [0,0,0,0,0x2f,0x78,0x56,0x34,0x12,0,0,0,0,255,255,255,255,4,3,2,1]);
});
