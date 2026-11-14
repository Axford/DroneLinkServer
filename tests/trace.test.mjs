import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import createTraceRoute from '../workbench-trace.mjs';
import { DroneMeshMsg, DRONE_MESH_MSG_PRIORITY_LOW } from '../public/modules/DroneMeshMsg.mjs';

test('accepts only the correlated trace on the selected mesh link and splits the recorded round trip', async () => {
  const events = new EventEmitter();
  const otherLink = new EventEmitter();
  const netInterface = {};
  let queued = 0;
  const manager = { node: 254, generateTracerouteRequest(iface, node, hop, prefix, priority) {
    queued++;
    assert.equal(iface, netInterface);
    assert.equal(node, 3);
    assert.equal(hop, 11);
    assert.equal(priority, DRONE_MESH_MSG_PRIORITY_LOW);
    const respond = (link, payload, source = 3) => {
      const reply = new DroneMeshMsg();
      Object.assign(reply, { srcNode: source, txNode: 12, nextNode: 254, destNode: 254, seq: 198 });
      reply.setPayloadSize(payload.length);
      reply.uint8_tPayload.set(payload);
      link.emit('workbench.trace-reply', reply, 4);
    };
    respond(otherLink, [...prefix, 8, 3, 1, 12]);
    respond(events, [254, prefix[1] ^ 1, ...prefix.slice(2), 8, 3, 1, 12]);
    respond(events, [...prefix, 8, 3, 1, 12], 5);
    queueMicrotask(() => respond(events, [...prefix, 1, 11, 2, 3, 3, 12]));
    return true;
  } };
  const trace = createTraceRoute({ fileRoute(node, transport) {
    assert.equal(node, 3);
    assert.equal(transport, 'serial');
    return { manager, events, assertAvailable: () => ({ nextHop: 11, netInterface }) };
  } });
  const result = trace('3', 'serial', {});
  await assert.rejects(trace('3', 'serial', {}), { status: 429 });
  const { receivedAt, roundTripMs, ...traceResult } = await result;
  assert.ok(receivedAt <= Date.now());
  assert.ok(roundTripMs >= 0);
  assert.deepEqual(traceResult, {
    node: 3, transport: 'serial', gateway: 254,
    complete: true, targetIndex: 2,
    recorded: [{ node: 254 }, { node: 11, metric: 1 }, { node: 3, metric: 2 }, { node: 12, metric: 3 }],
    gatewayArrival: { node: 254, metric: 4 },
  });
  assert.equal(queued, 1);
  assert.equal(events.listenerCount('workbench.trace-reply'), 0);
});

test('times out a missing reply and releases the listener', async () => {
  const events = new EventEmitter();
  const trace = createTraceRoute({ fileRoute: () => ({
    manager: { node: 254, generateTracerouteRequest: () => true }, events, assertAvailable: () => ({ nextHop: 3 }),
  }) }, { deadlineMs: 5 });
  await assert.rejects(trace('3', 'wifi', {}), { status: 504 });
  assert.equal(events.listenerCount('workbench.trace-reply'), 0);
});

test('preserves recorded hops without inventing a final segment at the payload limit', async () => {
  const events = new EventEmitter();
  const trace = createTraceRoute({ fileRoute: () => ({
    manager: { node: 254, generateTracerouteRequest(_iface, _target, _hop, prefix) {
      const reply = new DroneMeshMsg();
      Object.assign(reply, { srcNode: 3, txNode: 23, nextNode: 254, destNode: 254 });
      const payload = [...prefix, ...Array.from({ length: 21 }, (_, index) => [1, index + 3]).flat()];
      reply.setPayloadSize(payload.length);
      reply.uint8_tPayload.set(payload);
      events.emit('workbench.trace-reply', reply, 1);
      return true;
    } },
    events, assertAvailable: () => ({ nextHop: 3 }),
  }) });
  const result = await trace('3', 'wifi', {});
  assert.equal(result.complete, false);
  assert.equal(result.targetIndex, 1);
  assert.deepEqual(result.recorded.at(-1), { node: 23, metric: 1 });
  assert.equal(result.gatewayArrival, undefined);
});
