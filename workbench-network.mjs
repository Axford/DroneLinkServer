import { FileError } from './workbench-files.mjs';
import { deviceAddress, readDeviceJson } from './workbench-device-http.mjs';

const within = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;
const nodeId = n => within(n, 1, 254);
const counter = n => within(n, 0, 0xffffffff);
const types = new Set(['UDP', 'RFM69', 'Serial', 'Iridium', 'Unknown']);

function project(data, node) {
  if (data?.schemaVersion !== 1 || data.node !== node ||
      !Array.isArray(data.interfaces) || data.interfaces.length > 254 ||
      !Array.isArray(data.routes) || data.routes.length > 253) return;
  const interfaces = [];
  const channels = new Set();
  for (const item of data.interfaces) {
    if (!item || !nodeId(item.channel) || channels.has(item.channel) || !types.has(item.type) ||
        typeof item.up !== 'boolean' || typeof item.broadcast !== 'boolean' ||
        (!item.broadcast && !within(item.peer, 0, 254))) return;
    const { channel, type, up, broadcast, peer } = item;
    channels.add(channel);
    interfaces.push({ channel, type, up, broadcast, peer: broadcast ? undefined : peer });
  }
  const routes = [];
  const destinations = new Set();
  for (const item of data.routes) {
    if (!item || !nodeId(item.destination) || item.destination === node || destinations.has(item.destination) ||
        !nodeId(item.nextHop) || !within(item.cost, 0, 255) || !counter(item.ageMs) ||
        (item.channel !== undefined && !nodeId(item.channel))) return;
    const { destination, nextHop, cost, ageMs, channel } = item;
    destinations.add(destination);
    routes.push({ destination, nextHop, cost, ageMs, channel });
  }
  const queue = data.queue;
  if (!queue || !counter(queue.size) || !counter(queue.kicked) || !counter(queue.choked) ||
      !Number.isFinite(queue.utilisation) || queue.utilisation < 0 || queue.utilisation > 100) return;
  return { interfaces, routes, queue: { size: queue.size, utilisation: queue.utilisation, kicked: queue.kicked, choked: queue.choked } };
}

export default function createNodeNetwork(mesh, fetchNode = fetch) {
  const pending = new Map();
  return async (requestedNode, transport) => {
    const node = Number(requestedNode);
    if (!/^\d+$/.test(requestedNode) || !nodeId(node) || !['wifi', 'serial'].includes(transport)) {
      throw new FileError(400, 'Select a valid node and transport.');
    }
    const addressForNode = () => deviceAddress(mesh, node, transport);
    const address = addressForNode();
    if (!address) throw new FileError(503, 'Node network diagnostics require a direct Wi-Fi route.');
    const key = `${node}:${address}`;
    if (!pending.has(key)) {
      if (pending.size >= 8) throw new FileError(503, 'Network diagnostics are busy.');
      const signal = AbortSignal.timeout(2000);
      const read = readDeviceJson(fetchNode, address, '/networkSnapshot', { signal, maxBytes: 32768 })
        .then(({ data }) => {
          const result = project(data, node);
          if (!result) throw new FileError(502, 'The node returned an invalid network snapshot.');
          return { schemaVersion: 1, node, receivedAt: Date.now(), ...result };
        })
        .catch(error => {
          if (error instanceof FileError) throw error;
          throw new FileError(signal.aborted ? 504 : 502, signal.aborted ? 'The node network snapshot timed out.' :
            'The gateway could not read the node network snapshot.');
        })
        .finally(() => pending.delete(key));
      pending.set(key, read);
    }
    const result = await pending.get(key);
    if (address !== addressForNode()) throw new FileError(503, 'The selected route changed during the network read.');
    return result;
  };
}
