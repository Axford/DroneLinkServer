import { FileError } from './workbench-files.mjs';
import { DroneLinkMsg, DRONE_LINK_MSG_TYPE_CHAR as CHAR, DRONE_LINK_MSG_TYPE_FLOAT as FLOAT,
  DRONE_LINK_MSG_TYPE_ADDR as ADDR, DRONE_LINK_MSG_TYPE_QUERY as QUERY,
  DRONE_LINK_MSG_TYPE_SIZES as widths } from './public/modules/droneLinkMsg.mjs';
import { encodeLinkPacket, typedPayload } from './public/modules/vendor/protocol-0.2.0.mjs';

const within = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const invalid = () => new FileError(400, 'Enter a valid typed parameter value.');
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function encodePayload(type, size, payload) {
  if (type === CHAR) {
    if (!exact(payload, ['text']) || typeof payload.text !== 'string' ||
        payload.text.length > 16 || /[^\u0001-\u00ff]/.test(payload.text)) throw invalid();
    const bytes = Buffer.alloc(Math.max(1, payload.text.length));
    bytes.write(payload.text, 'latin1');
    return bytes;
  }
  if (type === ADDR) {
    if (!exact(payload, ['addresses']) || !Array.isArray(payload.addresses) || payload.addresses.length !== size / 4) throw invalid();
    return Uint8Array.from(payload.addresses.flatMap(address => {
      if (!exact(address, ['source', 'node', 'channel', 'param', 'priority']) ||
          ![address.source, address.node, address.channel].every(n => within(n, 0, 255)) ||
          !within(address.param, 0, 63) || !within(address.priority, 0, 3)) throw invalid();
      return [address.source, address.node, address.channel, address.param | address.priority << 6];
    }));
  }
  if (!exact(payload, ['values']) || !Array.isArray(payload.values) || payload.values.length !== size / widths[type]) throw invalid();
  if (type === FLOAT && !payload.values.every(n => typeof n === 'number' && Number.isFinite(Math.fround(n)))) throw invalid();
  try { return typedPayload(type, payload.values.map(n => n === 0 ? 0 : n)); }
  catch { throw invalid(); }
}

export default function createParameterOperations(mesh) {
  const queryTimes = new Map();
  function dispatch(action, transport, body) {
    const { nodeAddress: node, channel, param } = body?.target ?? {};
    if (!within(node, 1, 254) || !within(channel, 1, 254) || !within(param, 1, 63) ||
        !['wifi', 'serial'].includes(transport)) throw new FileError(400, 'Select a valid local parameter and transport.');
    const { manager, assertAvailable } = mesh.fileRoute(node, transport);
    const target = { source: manager.node, node, channel, param, writable: false };
    const message = (type, bytes, priority) => new DroneLinkMsg(encodeLinkPacket({
      ...target, msgType: type, msgLength: bytes.length, priority,
    }, bytes));
    function query(expectedHop) {
      const route = assertAvailable();
      if (expectedHop !== undefined && route.nextHop !== expectedHop) return;
      const now = Date.now();
      if (!expectedHop && now - (queryTimes.get(node) ?? 0) < 750) throw new FileError(429, 'Wait before querying the same node again.');
      if (!manager.generateDroneLinkMessage(route.netInterface, message(QUERY, Uint8Array.of(0), 0), route.nextHop))
        throw new FileError(503, 'The local query could not be queued.');
      queryTimes.set(node, now);
    }
    const receivedAfterMs = Date.now();
    if (action === 'query-value') {
      query();
    } else {
      const { msgType, payloadBytes } = body.expected ?? {};
      const observed = mesh.parameterMetadata(transport, target);
      if (!observed?.writable || observed.msgType !== msgType || observed.msgLength !== payloadBytes)
        throw new FileError(409, 'The gateway has no compatible writable observation for this parameter.');
      const write = message(msgType, encodePayload(msgType, payloadBytes, body.payload), 3);
      const route = assertAvailable();
      if (!manager.generateDroneLinkMessage(route.netInterface, write, route.nextHop, receiptNode => {
        if (receiptNode !== node || route.nextHop !== node) return;
        // The mesh receipt establishes sequence for the query, without proving execution.
        try { query(route.nextHop); } catch (error) {
          if (!(error instanceof FileError)) console.error('Workbench readback query failed:', error);
        }
      })) throw new FileError(503, 'The local write could not be queued.');
    }
    return { status: 'queued', receivedAfterMs };
  }
  return dispatch;
}
