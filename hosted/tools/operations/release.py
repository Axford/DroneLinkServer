#!/usr/bin/env python3
"""Prepare and verify a matched, committed-source hosted release without deploying."""
import argparse, base64, hashlib, io, json, pathlib, re, subprocess, tarfile
ROOT = pathlib.Path(__file__).resolve().parents[2]

def digest(raw): return hashlib.sha256(raw).hexdigest()
def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()
def safe(name):
    if not isinstance(name, str) or not name or any(part in ['', '.', '..'] for part in name.split('/')) or '\\' in name or ':' in name: raise ValueError('Unsafe archive path')
    return name

def client_files(archive):
    raw = archive.read_bytes()
    if pathlib.Path(str(archive) + '.sha256').read_text().strip() != f'{digest(raw)}  {archive.name}': raise ValueError('Client archive checksum differs')
    files = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar:
        for entry in tar:
            name = safe(entry.name)
            if name in files or not entry.isfile(): raise ValueError('Duplicate or non-regular Client entry')
            files[name] = tar.extractfile(entry).read()
    manifest = json.loads(files.pop('release-manifest.json'))
    if manifest.get('accessPolicyVersion') != 1: raise ValueError('Client requires M1 access policy version1')
    if manifest.get('observationPolicyVersion') != 1: raise ValueError('Client requires M1-C observation policy version1')
    if manifest.get('schemaVersion') != 1 or not re.fullmatch('[a-f0-9]{40}', manifest.get('clientRevision', '')): raise ValueError('Invalid Client identity')
    expected = {'build/' + safe(name): sha for name, sha in manifest['files'].items()}
    if set(files) != set(expected) or any(digest(files[name]) != sha for name, sha in expected.items()): raise ValueError('Client files differ')
    if 'build/index.html' not in files or not any(name.startswith('build/static/') for name in files): raise ValueError('Client shell missing')
    if not {'build/design-tokens.css', 'build/design-system.css'}.issubset(files): raise ValueError('Client design-system assets missing')
    identity = f'dronelink-client-{manifest["packageVersion"]}-{manifest["clientRevision"]}.tgz'
    if archive.name != identity: raise ValueError('Client archive identity differs')
    return manifest, files

def prepare(args):
    if git('status', '--porcelain', '--untracked-files=all'): raise ValueError('Commit Server sources before preparing a release')
    revision = git('rev-parse', 'HEAD'); manifest, client = client_files(pathlib.Path(args.client).resolve())
    package = json.loads((ROOT / 'package.json').read_text()); pin = package['dependencies']['@dronelink/persistence']
    if not pin.startswith('file:vendor/'): raise ValueError('Persistence must use an immutable archive')
    archive = ROOT / pin[5:]; raw = archive.read_bytes()
    lock = json.loads((ROOT / 'package-lock.json').read_text())['packages']['node_modules/@dronelink/persistence']
    if lock['resolved'] != pin or lock['integrity'] != 'sha512-' + base64.b64encode(hashlib.sha512(raw).digest()).decode(): raise ValueError('Persistence lock integrity differs')
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as tar: provenance = json.load(tar.extractfile('package/provenance.json'))
    version = provenance.get('version')
    if version not in ('0.8.0', '0.8.1') or archive.name != f'dronelink-persistence-{version}.tgz':
        raise ValueError('Unsupported M2 persistence release')
    command_format = provenance.get('storageFormat', {})
    if (command_format.get('commandContract') != 'm2-a-1' or command_format.get('commandMutationAPIs') is not True
            or command_format.get('peerCommandPoll') is not True
            or command_format.get('supportedWriterSchemas') != [1, 2]):
        raise ValueError('Persistence lacks the M2 writer contract')
    if provenance.get('storageFormat', {}).get('schemaVersion') != 1 or provenance['storageFormat']['adapter'] != 'native-firestore': raise ValueError('Incompatible storage format')
    files = {}
    tracked = git('ls-files', '--', 'app.js', 'index.js', 'lib', 'middleware', 'public', 'package.json', 'package-lock.json').splitlines()
    for name in tracked: files[name] = (ROOT / name).read_bytes()
    files[pin[5:]] = raw
    protocol_pin = package['dependencies'].get('@dronelink/protocol')
    if protocol_pin != 'file:vendor/dronelink-protocol-0.2.0.tgz': raise ValueError('M1-F requires pinned protocol0.2.0')
    protocol_raw = (ROOT / protocol_pin[5:]).read_bytes()
    if manifest.get('protocolVersion') != '0.2.0' or manifest.get('protocolArchiveSha256') != digest(protocol_raw): raise ValueError('Client and Server protocol releases differ')
    protocol_lock = json.loads((ROOT / 'package-lock.json').read_text())['packages']['node_modules/@dronelink/protocol']
    if protocol_lock['resolved'] != protocol_pin or protocol_lock['integrity'] != 'sha512-' + base64.b64encode(hashlib.sha512(protocol_raw).digest()).decode(): raise ValueError('Protocol lock integrity differs')
    files[protocol_pin[5:]] = protocol_raw
    files.update({'private/' + name: data for name, data in client.items()})
    files['client-release-manifest.json'] = json.dumps(manifest, sort_keys=True).encode()
    files['Dockerfile'] = b'FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY package*.json ./\nCOPY vendor ./vendor\nRUN npm ci --omit=dev --ignore-scripts && npm cache clean --force\nCOPY . .\nENV NODE_ENV=production\nUSER node\nCMD ["node", "index.js"]\n'
    files['.dockerignore'] = b'config.json\nnode_modules\n**/.cache\n'
    if git('rev-parse', 'HEAD') != revision or git('status', '--porcelain', '--untracked-files=all'): raise ValueError('Server changed during preparation')
    output = pathlib.Path(args.release).resolve()
    if output.exists(): raise ValueError('Release destination already exists')
    output.mkdir(parents=True)
    for name, data in files.items():
        target = output / safe(name); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    result = {'schemaVersion': 1, 'accessPolicyVersion': 1, 'telemetryPolicyVersion': 1, 'observationPolicyVersion': 1, 'serverRevision': revision, 'clientRevision': manifest['clientRevision'], 'clientArchiveSha256': digest(pathlib.Path(args.client).read_bytes()), 'protocolVersion': '0.2.0', 'protocolArchiveSha256': digest(protocol_raw), 'persistenceVersion': provenance['version'], 'persistenceSha256': digest(raw), 'storageFormat': provenance['storageFormat'], 'files': {name: digest(data) for name, data in files.items()}}
    (output / 'hosted-release.json').write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
    verify(output)

def verify(output):
    output = pathlib.Path(output).resolve(); manifest = json.loads((output / 'hosted-release.json').read_text())
    if manifest.get('accessPolicyVersion') != 1: raise ValueError('M1 access policy version1 is required; old membership-only releases are unsafe')
    if manifest.get('telemetryPolicyVersion') != 1: raise ValueError('M1-B telemetry policy version1 is required; use maintenance and roll forward')
    if manifest['schemaVersion'] != 1 or manifest['storageFormat']['adapter'] != 'native-firestore' or manifest['storageFormat']['schemaVersion'] != 1: raise ValueError('Incompatible release format')
    actual = set()
    for path in output.rglob('*'):
        if path.is_symlink(): raise ValueError('Release contains a symlink')
        if path.is_file() and path.name != 'hosted-release.json': actual.add(str(path.relative_to(output)))
    if actual != set(manifest['files']): raise ValueError('Release file set differs')
    for name, sha in manifest['files'].items():
        if digest((output / safe(name)).read_bytes()) != sha: raise ValueError('Release checksum differs')
    print(json.dumps({'verified': True, 'serverRevision': manifest['serverRevision'], 'clientRevision': manifest['clientRevision'], 'releaseSha256': digest((output / 'hosted-release.json').read_bytes())}))
    return manifest

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('action', choices=['prepare', 'verify']); parser.add_argument('--release', required=True); parser.add_argument('--client')
    args = parser.parse_args()
    if args.action == 'prepare':
        if not args.client: parser.error('--client is required for preparation')
        prepare(args)
    else: verify(args.release)
if __name__ == '__main__': main()
