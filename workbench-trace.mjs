import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { DRONE_MESH_MSG_MAX_PAYLOAD_SIZE, DRONE_MESH_MSG_PRIORITY_LOW } from './public/modules/DroneMeshMsg.mjs';
import { FileError } from './workbench-files.mjs';

const timeoutMs = 4000;
const replyEvent = 'workbench.trace-reply';

function traceResult(message, receivingMetric, prefix, node, startedAt, transport) {
  const payload = message.uint8_tPayload.subarray(0, message.getPayloadSize());
  const gateway = prefix[0];
  if (message.srcNode !== node || message.destNode !== gateway || message.nextNode !== gateway ||
      payload.length < prefix.length || payload.length % 2 || !prefix.every((byte, index) => payload[index] === byte)) return;

  const recorded = [{ node: gateway }];
  for (let i = prefix.length; i < payload.length; i += 2) {
    if (payload[i + 1] < 1 || payload[i + 1] > 254) return;
    recorded.push({ node: payload[i + 1], metric: payload[i] });
  }
  // Firmware appends pairs while there is room and replies with its own sequence number.
  // A full payload may omit a suffix. Do not join an unrecorded segment to the gateway.
  const targetIndex = recorded.findIndex(hop => hop.node === node);
  const complete = payload.length < DRONE_MESH_MSG_MAX_PAYLOAD_SIZE - 2 && targetIndex > 0 &&
    recorded.at(-1).node === message.txNode && !recorded.slice(targetIndex + 1).some(hop => hop.node === node);
  return {
    node, transport, gateway, receivedAt: Date.now(), roundTripMs: Math.round(performance.now() - startedAt),
    complete, recorded, targetIndex,
    ...(complete ? { gatewayArrival: { node: gateway, metric: receivingMetric } } : {}),
  };
}

export default function createTraceRoute(mesh, { deadlineMs = timeoutMs } = {}) {
  let pending = false;
  let nextStart = 0;

  return async (nodeValue, transport, body, response) => {
    const node = Number(nodeValue);
    if (typeof nodeValue !== 'string' || !/^\d{1,3}$/.test(nodeValue) || node < 1 || node > 254 || !['wifi', 'serial'].includes(transport) ||
        !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) {
      throw new FileError(400, 'Select a valid node and local transport.');
    }
    if (pending || performance.now() < nextStart) throw new FileError(429, 'Wait before starting another route trace.');
    const { manager, events, assertAvailable } = mesh.fileRoute(node, transport);
    const route = assertAvailable();
    const prefix = Uint8Array.of(manager.node, ...randomBytes(3));
    const startedAt = performance.now();
    pending = true;
    nextStart = startedAt + deadlineMs;
    try {
      return await new Promise((resolve, reject) => {
        const finish = (error, result) => {
          clearTimeout(timer);
          events.off(replyEvent, receive);
          response?.off('close', cancel);
          if (error) reject(error);
          else resolve(result);
        };
        const cancel = () => finish(new FileError(503, 'The trace request closed.'));
        const receive = (message, metric) => {
          const result = traceResult(message, metric, prefix, node, startedAt, transport);
          if (result) finish(null, result);
        };
        const timer = setTimeout(() => finish(new FileError(504, 'No trace reply reached the gateway.')), deadlineMs);
        events.on(replyEvent, receive);
        response?.once('close', cancel);
        try {
          if (response?.destroyed) cancel();
          else if (!manager.generateTracerouteRequest(route.netInterface, node, route.nextHop, prefix, DRONE_MESH_MSG_PRIORITY_LOW)) {
            finish(new FileError(503, 'The route trace could not be queued.'));
          }
        } catch (error) {
          finish(error);
        }
      });
    } finally {
      pending = false;
    }
  };
}
