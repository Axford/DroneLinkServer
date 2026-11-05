/** Local release preparation/validation; imports do not start services or hardware. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Mustache from 'mustache';

export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const safeName = name => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(name);
const safePath = name => typeof name === 'string' && name.length > 0 && !name.includes('\\') && !path.posix.isAbsolute(name) && path.posix.normalize(name) === name && !name.split('/').some(p => !p || p === '.' || p === '..');
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function check(condition, message) { if (!condition) throw new Error(message); }
function fileMap(directory, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    check(safePath(name), 'Unsafe release path');
    const absolute = path.join(directory, entry.name);
    const stat = fs.lstatSync(absolute);
    check(!stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile()), 'Release links/special files are unsupported');
    if (stat.isDirectory()) Object.assign(result, fileMap(absolute, name + '/'));
    else { check(stat.nlink === 1 && stat.size <= 64 * 1024 * 1024, 'Release hard links/oversized files are unsupported'); result[name] = hash(fs.readFileSync(absolute)); }
  }
  return result;
}
function manifestAt(directory) {
  check(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(), 'Release root must be a real directory');
  const actual = fileMap(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release-manifest.json'), 'utf8'));
  const { identity, ...body } = manifest;
  check(manifest.schemaVersion === 1 && /^[0-9a-f]{64}$/.test(identity) && hash(canonical(body)) === identity, 'Unsupported manifest schema or invalid identity');
  delete actual['release-manifest.json'];
  check(canonical(actual) === canonical(manifest.files), 'Release file set/checksum mismatch');
  return manifest;
}
function provenance(manifest) {
  check(/^[0-9a-f]{40}$/.test(manifest.sourceRevision), 'Invalid source revision');
  check(manifest.sourceFiles && Object.keys(manifest.sourceFiles).length && Object.entries(manifest.sourceFiles).every(([p, h]) => safePath(p) && /^[0-9a-f]{64}$/.test(h)), 'Invalid source file provenance');
}
export function validateCatalog(catalog) {
  check(catalog && typeof catalog === 'object' && !Array.isArray(catalog) && Object.keys(catalog).length, 'Invalid module catalog');
  for (const [name, module] of Object.entries(catalog)) {
    check(safeName(name) && !['constructor', 'prototype', 'hasOwnProperty'].includes(name) && Array.isArray(module.type) && module.type.length === 1 && module.type[0] === name, 'Invalid module type');
    check(Array.isArray(module.filename) && module.filename.length && module.filename.every(safePath), 'Invalid module source paths');
    for (const field of ['pub', 'sub']) {
      const parameters = module[field] || [];
      check(Array.isArray(parameters), 'Invalid parameters');
      for (const p of parameters) {
        check(p && Number.isInteger(p.address) && p.address >= 0 && p.address <= 255 && Number.isInteger(p.numValues) && p.numValues >= 1 && p.numValues <= 16 && ['u8', 'u32', 'f', 'c', 'addr'].includes(p.type) && typeof p.name === 'string' && p.name.length && typeof p.description === 'string' && p.description.length, 'Malformed module parameter');
        check(field === 'pub' ? typeof p.writeable === 'boolean' : Number.isInteger(p.addrAddress) && p.addrAddress >= 0 && p.addrAddress <= 255, 'Malformed parameter access/address');
      }
      check(new Set(parameters.map(p => p.address)).size === parameters.length && new Set(parameters.map(p => p.name)).size === parameters.length, 'Ambiguous module parameters');
    }
    const seen = new Set([name]);
    let current = module;
    while (current.inherits) {
      check(Array.isArray(current.inherits) && current.inherits.length === 1 && safeName(current.inherits[0]) && Object.hasOwn(catalog, current.inherits[0]) && !seen.has(current.inherits[0]), 'Invalid module inheritance');
      seen.add(current.inherits[0]); current = catalog[current.inherits[0]];
    }
  }
  return catalog;
}
function verifyExport(directory) {
  const m = manifestAt(directory); provenance(m);
  const names = Object.keys(m.files).sort();
  if (m.kind === 'metadata') {
    check(canonical(names) === canonical(['moduleInfo.json']), 'Invalid metadata payload');
    validateCatalog(JSON.parse(fs.readFileSync(path.join(directory, 'moduleInfo.json'), 'utf8')));
  } else {
    check(m.kind === 'firmware' && canonical(names) === canonical(['firmware.bin', 'firmware.ver']), 'Invalid firmware payload');
    check(/^[0-9a-f]{4,40}$/.test(m.buildMarker) && m.sourceRevision.startsWith(m.buildMarker) && m.environment === 'esp32doit-devkit-v1' && m.board === m.environment && /^[0-9a-f]{64}$/.test(m.metadataIdentity) && m.buildTools?.platformio && m.buildTools?.resolvedPackages && Array.isArray(m.buildFlags), 'Invalid firmware provenance/environment');
    check(fs.statSync(path.join(directory, 'firmware.bin')).size > 0 && fs.readFileSync(path.join(directory, 'firmware.ver'), 'utf8') === m.buildMarker, 'Invalid firmware version/image');
  }
  return m;
}
export function verifyRelease(directory) {
  const m = manifestAt(directory);
  check(m.kind === 'prepared' && m.exports?.firmware && m.exports?.metadata && m.renderer, 'Invalid prepared release');
  // Retain complete input manifests, not merely asserted identity strings.
  const firmware = m.exports.firmware.manifest, metadata = m.exports.metadata.manifest;
  for (const input of [m.exports.firmware, m.exports.metadata]) {
    check(/^[0-9a-f]{64}$/.test(input.archiveSha256), 'Invalid input archive digest');
    const { identity, ...body } = input.manifest;
    check(body.schemaVersion === 1 && hash(canonical(body)) === identity, 'Invalid input identity'); provenance(input.manifest);
  }
  check(firmware.kind === 'firmware' && metadata.kind === 'metadata' && firmware.metadataIdentity === metadata.identity && firmware.sourceRevision === metadata.sourceRevision, 'Mismatched firmware/metadata');
  check(/^[0-9a-f]{4,40}$/.test(firmware.buildMarker) && firmware.sourceRevision.startsWith(firmware.buildMarker) && firmware.environment === 'esp32doit-devkit-v1' && firmware.board === firmware.environment && firmware.buildTools?.platformio && firmware.buildTools?.resolvedPackages && Array.isArray(firmware.buildFlags), 'Unsupported build provenance');
  check(canonical(Object.keys(firmware.files).sort()) === canonical(['firmware.bin', 'firmware.ver']) && canonical(Object.keys(metadata.files)) === canonical(['moduleInfo.json']), 'Invalid embedded export payload');
  for (const [name, checksum] of Object.entries({ ...firmware.files, ...metadata.files })) check(m.files[name] === checksum, 'Prepared payload differs from export');
  check(fs.readFileSync(path.join(directory, 'firmware.ver'), 'utf8') === firmware.buildMarker, 'Invalid firmware marker');
  const catalog = validateCatalog(JSON.parse(fs.readFileSync(path.join(directory, 'moduleInfo.json'), 'utf8')));
  provenance(m.renderer);
  const help = ['index', ...Object.keys(catalog), 'firmwareSetupGuide', 'sailingBoatSetup', 'pins'].map(n => `help/${n}.html`);
  check(canonical(Object.keys(m.files).sort()) === canonical(['firmware.bin', 'firmware.ver', 'moduleInfo.json', ...help].sort()), 'Invalid prepared payload layout');
  return m;
}
export function prepareRelease({ firmware, metadata, output }) {
  output = path.resolve(output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const lock = output + '.prepare-lock';
  fs.mkdirSync(lock); // Fail closed on another preparation or abandoned reservation.
  let staging;
  try {
    check(!fs.existsSync(output), 'Output already exists; choose a new release directory');
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: serverRoot, encoding: 'utf8' }).trim();
    check(!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: serverRoot, encoding: 'utf8' }).trim(), 'Release preparation requires clean committed Server source');
    staging = fs.mkdtempSync(path.join(path.dirname(output), '.release-'));
    const inputs = {};
    for (const [kind, archive] of Object.entries({ firmware, metadata })) {
      const input = path.join(staging, kind); fs.mkdirSync(input);
      const archiveSha256 = execFileSync('python3', [path.join(serverRoot, 'scripts/read-release-archive.py'), path.resolve(archive), input], { encoding: 'utf8' }).trim();
      const manifest = verifyExport(input); check(manifest.kind === kind, 'Wrong export kind');
      inputs[kind] = { manifest, archiveSha256, directory: input };
    }
    check(inputs.firmware.manifest.sourceRevision === inputs.metadata.manifest.sourceRevision && inputs.firmware.manifest.metadataIdentity === inputs.metadata.manifest.identity, 'Firmware does not pin this metadata');
    const prepared = path.join(staging, 'prepared'); fs.mkdirSync(prepared); fs.mkdirSync(path.join(prepared, 'help'));
    for (const input of Object.values(inputs)) for (const name of Object.keys(input.manifest.files)) fs.copyFileSync(path.join(input.directory, name), path.join(prepared, name));
    const catalog = JSON.parse(fs.readFileSync(path.join(prepared, 'moduleInfo.json'), 'utf8'));
    const templateFiles = ['templates/help/index.mustache', 'templates/help/module.mustache'];
    const guides = ['firmwareSetupGuide', 'sailingBoatSetup', 'pins'];
    const rendererInputs = [...templateFiles, ...guides.map(n => `public/help/${n}.html`), 'scripts/release.mjs', 'scripts/read-release-archive.py', 'package.json', 'package-lock.json'];
    const sourceFiles = Object.fromEntries(rendererInputs.map(p => [p, hash(fs.readFileSync(path.join(serverRoot, p)))]));
    for (const [name, checksum] of Object.entries(sourceFiles)) {
      const committed = execFileSync('git', ['show', `${revision}:${name}`], { cwd: serverRoot });
      check(hash(committed) === checksum, `Renderer input differs from committed revision: ${name}`);
    }
    const moduleTemplate = fs.readFileSync(path.join(serverRoot, templateFiles[1]), 'utf8');
    const modules = Object.keys(catalog).sort().map(name => {
      fs.writeFileSync(path.join(prepared, 'help', `${name}.html`), Mustache.render(moduleTemplate, catalog[name]));
      return { name, description: catalog[name].description };
    });
    fs.writeFileSync(path.join(prepared, 'help/index.html'), Mustache.render(fs.readFileSync(path.join(serverRoot, templateFiles[0]), 'utf8'), { modules }));
    for (const name of guides) fs.copyFileSync(path.join(serverRoot, `public/help/${name}.html`), path.join(prepared, `help/${name}.html`));
    for (const [p, checksum] of Object.entries(sourceFiles)) check(hash(fs.readFileSync(path.join(serverRoot, p))) === checksum, 'Renderer inputs changed during preparation');
    check(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: serverRoot, encoding: 'utf8' }).trim() === revision && !execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: serverRoot, encoding: 'utf8' }).trim(), 'Server source changed during preparation');
    const manifest = { schemaVersion: 1, kind: 'prepared', exports: Object.fromEntries(Object.entries(inputs).map(([kind, { manifest, archiveSha256 }]) => [kind, { manifest, archiveSha256 }])), renderer: { sourceRevision: revision, sourceFiles }, files: fileMap(prepared) };
    manifest.identity = hash(canonical(manifest));
    fs.writeFileSync(path.join(prepared, 'release-manifest.json'), canonical(manifest));
    verifyRelease(prepared);
    fs.renameSync(prepared, output);
    return output;
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    fs.rmdirSync(lock);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'verify' && args.length === 1) console.log(JSON.stringify(verifyRelease(path.resolve(args[0])), null, 2));
    else if (command === 'prepare' && args.length === 6) {
      const flags = Object.fromEntries([0, 2, 4].map(i => [args[i], args[i + 1]]));
      check(Object.keys(flags).sort().join(',') === '--firmware,--metadata,--output', 'Expected --firmware, --metadata and --output');
      console.log(prepareRelease({ firmware: flags['--firmware'], metadata: flags['--metadata'], output: flags['--output'] }));
    } else throw new Error('Use prepare --firmware <archive> --metadata <archive> --output <new-directory>, or verify <directory>');
  } catch (error) { console.error(`Release failed: ${error.message}`); process.exitCode = 1; }
}
