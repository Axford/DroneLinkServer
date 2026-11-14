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

// Project startup settings from the verified release metadata. Read-only
// publications are options for publish, rather than standalone assignments.
function settingsFor(catalogue, type) {
  const settings = new Map();
  const examples = new Map();
  const defaults = new Map();
  const publications = new Set();
  const visited = new Set();
  const key = /^\$?[A-Za-z][A-Za-z0-9_]*$/;
  const add = (name, value) => {
    if (typeof name === 'string' && key.test(name)) settings.set(name, value);
  };
  const exampleFor = param => param.type === 'c' ? '""' :
    Array.from({ length: Math.min(16, Math.max(1, Number(param.numValues) || 1)) }, () => '0').join(', ');
  function visit(name) {
    if (visited.has(name) || !Object.hasOwn(catalogue, name)) return;
    visited.add(name);
    const item = catalogue[name];
    for (const parent of item.inherits ?? []) visit(parent);
    for (const entry of Array.isArray(item.default) ? item.default : []) {
      if (Array.isArray(entry?.values)) defaults.set(entry.param, entry.values.join(', '));
    }
    for (const example of Array.isArray(item.config) ? item.config : []) {
      if (typeof example !== 'string') continue;
      for (const line of example.split(/\r?\n/)) {
        const match = /^\s*(\$?[A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(line);
        if (match) examples.set(match[1], match[2].trim());
      }
    }
    for (const param of item.pub ?? []) {
      if (typeof param.name === 'string' && key.test(param.name)) publications.add(param.name);
      if (param.writeable) add(param.name, exampleFor(param));
    }
    for (const param of item.sub ?? []) {
      add(param.name, exampleFor(param));
      add(`$${param.name}`, '@>GPS.location');
    }
  }
  visit(type);
  for (const [name, value] of defaults) if (!settings.has(name) && !publications.has(name)) add(name, value);
  for (const [name, value] of examples) if (!settings.has(name)) add(name, value);
  if (publications.size) add('publish', [...publications].join(', '));
  return Array.from(settings, ([name, example]) => ({ name, value: defaults.get(name) || examples.get(name) || example }));
}

export default function createCatalogue(mesh, release, fetchNode = fetch) {
  const metadata = release.assets.get('moduleInfo.json');
  const build = release.assets.get('firmware.ver')?.toString('utf8');
  const moduleInfo = metadata ? JSON.parse(metadata) : {};
  const entries = Object.entries(moduleInfo).filter(([type]) => typeName.test(type)).map(([type, item]) => ({
    type,
    settings: settingsFor(moduleInfo, type),
    description: Array.isArray(item.description) ? item.description.filter(line => typeof line === 'string').join(' ') : '',
    category: typeof item.category?.[0] === 'string' ? item.category[0] : '',
    ...(type === 'NMEA' ? { locationOutput: parameter(item.pub?.find(p => p.name === 'location')),
      serialPort: parameter(item.pub?.find(p => p.name === 'port' && p.writeable)) } : {}),
    ...(type === 'Nav' ? { locationInput: parameter(item.sub?.find(p => p.name === 'location')) } : {}),
  }));
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
