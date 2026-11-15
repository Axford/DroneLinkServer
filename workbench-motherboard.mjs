import { FileError } from './workbench-files.mjs';
import { deviceAddress, readDeviceJson } from './workbench-device-http.mjs';

export default function createMotherboardReader(mesh, fetchNode = fetch) {
  const pending = new Map();
  return async (requestedNode, transport) => {
    const node = Number(requestedNode);
    if (!/^\d+$/.test(requestedNode) || node < 1 || node > 254 || !['wifi', 'serial'].includes(transport)) {
      throw new FileError(400, 'Select a valid node and transport.');
    }

    const addressForNode = () => deviceAddress(mesh, node, transport);
    const address = addressForNode();
    if (!address) throw new FileError(503, 'Motherboard detection requires a direct Wi-Fi route.');

    const key = `${node}:${address}`;
    if (!pending.has(key)) {
      if (pending.size >= 8) throw new FileError(503, 'Motherboard detection is busy.');
      const signal = AbortSignal.timeout(2000);
      const read = readDeviceJson(fetchNode, address, '/motherboard', { signal, maxBytes: 512 })
        .then(({ data }) => {
          if (data?.schemaVersion !== 1 || data.node !== node || ![0, 1, 2, 4].includes(data.version)) {
            throw new FileError(502, 'The node returned an invalid motherboard result.');
          }
          return { schemaVersion: 1, node, version: data.version };
        })
        .catch(error => {
          if (error instanceof FileError) throw error;
          throw new FileError(signal.aborted ? 504 : 502,
            signal.aborted ? 'The motherboard result timed out.' : 'The gateway could not read the motherboard result.');
        })
        .finally(() => pending.delete(key));
      pending.set(key, read);
    }
    const result = await pending.get(key);
    if (address !== addressForNode()) throw new FileError(503, 'The selected route changed during motherboard detection.');
    return result;
  };
}
