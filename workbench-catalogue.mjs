import { deviceAddress, readDeviceJson } from './workbench-device-http.mjs';
import { FileError } from './workbench-files.mjs';

const typeName = /^[A-Za-z][A-Za-z0-9]{0,18}$/;
const buildMarker = /^[0-9a-f]{4,40}$/;

async function readSupport(address, node, fetchNode) {
  const { data } = await readDeviceJson(fetchNode, address, '/supportedModules', { signal: AbortSignal.timeout(2000) });
  if (data?.schemaVersion !== 1 || data.node !== node || typeof data.build !== 'string' || !buildMarker.test(data.build) ||
      !Array.isArray(data.types) || !data.types.length || data.types.length > 254 ||
      data.types.some(type => typeof type !== 'string' || !typeName.test(type)) || new Set(data.types).size !== data.types.length) {
    throw new Error('Invalid capability response');
  }
  return { build: data.build, types: new Set(data.types) };
}

function parameter(parameter) {
  return parameter && { name: parameter.name, address: parameter.address, type: parameter.type, count: parameter.numValues };
}

export default function createCatalogue(mesh, release, fetchNode = fetch) {
  const metadata = release.assets.get('moduleInfo.json');
  const build = release.assets.get('firmware.ver')?.toString('utf8');
  const entries = metadata ? Object.entries(JSON.parse(metadata)).filter(([type]) => typeName.test(type)).map(([type, item]) => ({
    type,
    description: Array.isArray(item.description) ? item.description.filter(line => typeof line === 'string').join(' ') : '',
    category: typeof item.category?.[0] === 'string' ? item.category[0] : '',
    ...(type === 'NMEA' ? { locationOutput: parameter(item.pub?.find(p => p.name === 'location')),
      serialPort: parameter(item.pub?.find(p => p.name === 'port' && p.writeable)) } : {}),
    ...(type === 'Nav' ? { locationInput: parameter(item.sub?.find(p => p.name === 'location')) } : {}),
  })) : [];
  const pending = new Map();

  return async (requestedNode, transport) => {
    const node = Number(requestedNode);
    if (!/^\d+$/.test(requestedNode) || node < 1 || node > 254 || !['wifi', 'serial'].includes(transport)) {
      throw new FileError(400, 'Select a valid node and transport.');
    }
    let support;
    if (transport === 'wifi') {
      const addressForNode = () => deviceAddress(mesh, node, transport);
      try {
        const address = addressForNode();
        if (address) {
          const key = `${node}:${address}`;
          if (!pending.has(key)) {
            if (pending.size >= 8) throw new Error('Capability requests busy');
            pending.set(key, readSupport(address, node, fetchNode).finally(() => pending.delete(key)));
          }
          const result = await pending.get(key);
          if (address === addressForNode()) support = result;
        }
      } catch { /* A legacy, unreachable or changed device leaves support unknown. */ }
    }
    const supportKnown = !!support;
    const metadataStatus = !metadata ? 'unavailable' : !support ? 'unverified' : build === support.build ? 'marker-match' : 'different-build';
    const known = new Set(entries.map(entry => entry.type));
    return {
      schemaVersion: 1, node, supportKnown, build: support?.build, metadataStatus,
      release: release.status.identity,
      entries: [...entries, ...[...(support?.types ?? [])].filter(type => !known.has(type)).map(type => ({ type, description: '', category: '' }))]
        .map(entry => ({ ...entry, support: !support ? 'unknown' : support.types.has(entry.type) ? 'supported' : 'unsupported' }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    };
  };
}
