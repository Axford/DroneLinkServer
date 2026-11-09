// Explicit local artifact update; normal starts/builds never write into sibling trees.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const entry = import.meta.resolve('@dronelink/protocol');
const metadata = JSON.parse(readFileSync(new URL('../package.json', entry)));
assert.equal(metadata.version, '0.2.0', 'Review codec import path before updating the protocol version');
const destination = new URL('../public/modules/vendor/protocol-0.2.0.mjs', import.meta.url);
const expected = readFileSync(new URL(entry));
if (process.argv.includes('--check')) {
  assert.deepEqual(readFileSync(destination), expected, 'Browser protocol artifact differs from installed pinned package');
} else {
  mkdirSync(new URL('.', destination), {recursive:true});
  writeFileSync(destination, expected);
}
console.log(`PASS: pinned browser protocol artifact ${fileURLToPath(destination)}`);
