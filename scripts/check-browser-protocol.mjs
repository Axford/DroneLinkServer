// Evaluate the actual unbundled codec/module graph in a browser-like JS context.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vectors } from '@dronelink/protocol/testing';
const root = new URL('../public/', import.meta.url);
const context = vm.createContext({console});
const modules = new Map();
async function load(url) {
  assert.ok(url.href.startsWith(root.href), 'Browser module escaped the public asset tree');
  if (modules.has(url.href)) return modules.get(url.href);
  const mod = new vm.SourceTextModule(readFileSync(url,'utf8'), {context,identifier:url.href});
  modules.set(url.href, mod);
  await mod.link((specifier, referencing) => {
    assert.ok(specifier.startsWith('.'), `Browser cannot resolve bare import ${specifier}`);
    return load(new URL(specifier,referencing.identifier));
  });
  return mod;
}
const entry = await load(new URL('modules/droneLinkMsg.mjs',root));
await entry.evaluate();
assert.equal(vm.runInContext('typeof process', context), 'undefined');
const Codec = entry.namespace.DroneLinkMsg;
for (const vector of vectors) {
  // Construct input buffers in the module's realm, as a browser caller would.
  context.input = vector.decoded;
  const raw = Array.from(Buffer.from(vector.hex.replaceAll(' ',''),'hex'));
  context.raw = raw;
  const buffer = vm.runInContext('Uint8Array.from(raw).buffer', context);
  const msg = new Codec(buffer);
  assert.deepEqual(Array.from(msg.encodeUnframed()),raw,vector.name);
}
console.log(`PASS: browser ESM graph (${modules.size} modules), no bare/Node imports, ${vectors.length} fixture round trips`);
