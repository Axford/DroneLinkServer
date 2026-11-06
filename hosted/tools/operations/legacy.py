#!/usr/bin/env python3
"""Archive and cleanse the explicitly selected legacy staging database. Dry run by default."""
import argparse, base64, hashlib, json, os, pathlib, subprocess, urllib.request, urllib.parse, zipfile
from concurrent.futures import ThreadPoolExecutor
PROJECT = 'dronelink-25dbc'
BUCKET = PROJECT + '.appspot.com'

def run(*args):
    return subprocess.check_output(['gcloud', *args], text=True).strip()

_token = None
def access_token():
    global _token
    if _token is None: _token = run('auth', 'print-access-token')
    return _token

def api(url, body=None):
    token = access_token()
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)

def database(project): return f'projects/{project}/databases/(default)'
def scan(project):
    root = database(project) + '/documents'
    rows = []
    def visit(parent):
        page = None
        while True:
            result = api('https://firestore.googleapis.com/v1/' + parent + ':listCollectionIds', {'pageSize': 1000, **({'pageToken': page} if page else {})})
            for collection in result.get('collectionIds', []):
                token = None
                while True:
                    query = urllib.parse.urlencode({'pageSize': 1000, 'showMissing': 'true', **({'pageToken': token} if token else {})})
                    docs = api('https://firestore.googleapis.com/v1/' + parent + '/' + urllib.parse.quote(collection, safe='') + '?' + query)
                    for doc in docs.get('documents', []):
                        if 'createTime' in doc: rows.append(doc)
                        visit(doc['name'])
                    token = docs.get('nextPageToken')
                    if not token: break
            page = result.get('nextPageToken')
            if not page: break
    visit(root)
    return rows

def objects(bucket, prefix):
    rows = []; page = None
    while True:
        query = urllib.parse.urlencode({'prefix': prefix, **({'pageToken': page} if page else {})})
        result = api(f'https://storage.googleapis.com/storage/v1/b/{bucket}/o?' + query)
        rows.extend(result.get('items', [])); page = result.get('nextPageToken')
        if not page: return rows

def save_json(path, data): path.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def download_object(bucket, item, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    source = f'https://storage.googleapis.com/storage/v1/b/{bucket}/o/' + urllib.parse.quote(item['name'], safe='') + '?alt=media&generation=' + item['generation']
    request = urllib.request.Request(source, headers={'Authorization': 'Bearer ' + access_token()})
    if not target.exists():
        with urllib.request.urlopen(request, timeout=120) as response:
            with target.open('xb') as output: output.write(response.read())
    raw = target.read_bytes()
    if len(raw) != int(item['size']): raise ValueError('Object size differs')
    if item.get('md5Hash') and base64.b64encode(hashlib.md5(raw).digest()).decode() != item['md5Hash']: raise ValueError('Object checksum differs')

def archive(args):
    bucket = args.export_bucket.removeprefix('gs://').rstrip('/')
    if not bucket or '/' in bucket or bucket == BUCKET: raise ValueError('Select a separate private export bucket')
    bucket_info = json.loads(run('storage', 'buckets', 'describe', 'gs://' + bucket, '--format=json'))
    if bucket_info.get('public_access_prevention') != 'enforced' or bucket_info.get('uniform_bucket_level_access') is not True or bucket_info.get('location', '').upper() != 'EU': raise ValueError('Export bucket must enforce public-access prevention, uniform access and EU location')
    root = pathlib.Path(args.archive).resolve()
    prefix = 'sep06-archive/' + root.name + '/native'
    if getattr(args, 'resume', False):
        if (root / 'archive-manifest.json').exists(): return verify(args)
        before = json.loads((root / 'database-before.json').read_text())
        quiescence = json.loads((root / 'quiescence.json').read_text())
        if before.get('name') != database(args.project) or quiescence.get('project') != args.project or quiescence.get('remainingFunctions') != []: raise ValueError('Incomplete archive cannot be resumed automatically')
        if json.loads(run('functions', 'list', '--project', args.project, '--format=json')): raise ValueError('Legacy writers remain')
        operation = json.loads((root / 'native-export-operation.json').read_text())
        if operation.get('metadata', {}).get('outputUriPrefix') != f'gs://{bucket}/{prefix}': raise ValueError('Resume export target differs')
    else:
        if root.exists(): raise ValueError('Archive destination must be new; use --resume only for a quiesced archive')
        root.mkdir(parents=True, mode=0o700)
        os.chmod(root, 0o700)
        save_json(root / 'export-bucket.json', bucket_info)
        functions = json.loads(run('functions', 'list', '--project', args.project, '--format=json'))
        save_json(root / 'legacy-functions.json', functions)
        for function in functions:
            if function['name'].split('/')[-1] != 'addRxPacket': raise ValueError('Unexpected legacy function: review writer inventory')
            source = function.get('buildConfig', {}).get('sourceProvenance', {}).get('resolvedStorageSource')
            if not source or not all(source.get(key) for key in ['bucket', 'object', 'generation']): raise ValueError('Legacy Function source metadata missing; writer retained')
            target = root / 'addRxPacket-source.zip'
            run('storage', 'cp', f'gs://{source["bucket"]}/{source["object"]}#{source["generation"]}', str(target), '--quiet')
            with zipfile.ZipFile(target) as archive:
                if not archive.namelist() or archive.testzip() is not None: raise ValueError('Legacy Function source archive is incomplete; writer retained')
        save_json(root / 'database-before.json', json.loads(run('firestore', 'databases', 'describe', '--project', args.project, '--database', '(default)', '--format=json')))
        # Preflight TLS/authentication before changing the deployed writer.
        api('https://firestore.googleapis.com/v1/' + database(args.project))
        # Preserve the deployed source/configuration before retiring the only legacy writer.
        for function in functions:
            if function['name'].split('/')[-1] != 'addRxPacket': raise ValueError('Unexpected legacy function: review writer inventory')
            region = function['name'].split('/')[3]
            run('functions', 'delete', 'addRxPacket', '--region', region, '--project', args.project, '--quiet')
        remaining = json.loads(run('functions', 'list', '--project', args.project, '--format=json'))
        if remaining: raise ValueError('Legacy writers remain')
        save_json(root / 'quiescence.json', {'project': args.project, 'retiredFunctions': [f['name'] for f in functions], 'remainingFunctions': remaining})
        prefix = 'sep06-archive/' + root.name + '/native'
        result = run('firestore', 'export', f'gs://{bucket}/{prefix}', '--database', '(default)', '--project', args.project, '--format=json')
        (root / 'native-export-operation.json').write_text(result + '\n')
        operation = json.loads((root / 'native-export-operation.json').read_text())
    if not operation.get('name', '').startswith(database(args.project) + '/operations/'): raise ValueError('Export operation target differs')
    completed = api('https://firestore.googleapis.com/v1/' + operation['name'])
    save_json(root / 'native-export-operation.json', completed)
    if completed.get('done') is not True or completed.get('error'): raise ValueError('Native export has not completed successfully')
    documents = scan(args.project)
    with (root / 'firestore-typed.jsonl').open('w') as output:
        for doc in sorted(documents, key=lambda d: d['name']): output.write(json.dumps(doc, sort_keys=True) + '\n')
    again = scan(args.project)
    if sorted(documents, key=lambda d: d['name']) != sorted(again, key=lambda d: d['name']): raise ValueError('Firestore changed during archive')
    inventories = {'logs': objects(BUCKET, 'logs/'), 'native': objects(bucket, prefix + '/')}
    if not inventories['native'] or not any(o['name'].endswith('.overall_export_metadata') for o in inventories['native']): raise ValueError('Native export metadata missing')
    for kind, items in inventories.items():
        save_json(root / (kind + '-inventory.json'), items)
        downloads = []
        for item in items:
            relative = item['name'][len('logs/'):] if kind == 'logs' else item['name'][len(prefix) + 1:]
            target = root / kind / relative
            if not target.resolve().is_relative_to(root / kind): raise ValueError('Unsafe object path')
            downloads.append((BUCKET if kind == 'logs' else bucket, item, target))
        with ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(lambda values: download_object(*values), downloads))
        print(json.dumps({'downloaded': kind, 'objects': len(items)}), flush=True)
        if [(x['name'], x['generation']) for x in items] != [(x['name'], x['generation']) for x in objects(BUCKET if kind == 'logs' else bucket, 'logs/' if kind == 'logs' else prefix + '/')]: raise ValueError('Archive inventory changed')
    manifest = {'schemaVersion': 1, 'project': args.project, 'database': '(default)', 'documentCount': len(documents), 'nativePrefix': f'gs://{bucket}/{prefix}', 'logCount': len(inventories['logs']), 'files': {str(p.relative_to(root)): sha(p) for p in sorted(root.rglob('*')) if p.is_file()}}
    save_json(root / 'archive-manifest.json', manifest)
    verify(args)

def verify(args):
    root = pathlib.Path(args.archive).resolve(); manifest = json.loads((root / 'archive-manifest.json').read_text())
    if manifest['project'] != args.project or manifest['database'] != '(default)': raise ValueError('Archive target differs')
    mandatory = {'firestore-typed.jsonl', 'logs-inventory.json', 'native-inventory.json', 'native-export-operation.json', 'database-before.json', 'legacy-functions.json', 'quiescence.json', 'export-bucket.json'}
    if not mandatory.issubset(manifest['files']): raise ValueError('Missing mandatory archive components')
    files = set()
    for path in root.rglob('*'):
        if path.is_symlink(): raise ValueError('Archive contains symlink')
        if path.is_file() and path not in [root / 'archive-manifest.json', root / 'cleanse-evidence.json']: files.add(str(path.relative_to(root)))
    if files != set(manifest['files']): raise ValueError('Archive file inventory differs')
    for name, digest in manifest['files'].items():
        path = (root / name).resolve()
        if not path.is_relative_to(root) or sha(path) != digest: raise ValueError('Archive checksum differs')
    before = json.loads((root / 'database-before.json').read_text())
    if before.get('name') != database(args.project) or not before.get('uid') or before.get('type') != 'FIRESTORE_NATIVE' or before.get('locationId') != 'eur3': raise ValueError('Archived database identity differs')
    bucket = json.loads((root / 'export-bucket.json').read_text())
    if bucket.get('public_access_prevention') != 'enforced' or bucket.get('uniform_bucket_level_access') is not True or bucket.get('location', '').upper() != 'EU': raise ValueError('Private export bucket evidence missing')
    prefix = manifest['nativePrefix'].removeprefix('gs://').split('/', 1)
    if len(prefix) != 2 or prefix[0] != bucket.get('name') or prefix[0] == BUCKET: raise ValueError('Native export target differs')
    operation = json.loads((root / 'native-export-operation.json').read_text())
    if operation.get('error') or not (operation.get('done') is True or operation.get('metadata', {}).get('operationState') == 'SUCCESSFUL' or operation.get('operationState') == 'SUCCESSFUL'): raise ValueError('Native export did not complete')
    metadata = operation.get('metadata', {})
    if metadata.get('outputUriPrefix') != manifest['nativePrefix'] or operation.get('response', {}).get('outputUriPrefix', manifest['nativePrefix']) != manifest['nativePrefix']: raise ValueError('Native export output target differs')
    progress = metadata.get('progressDocuments', {})
    completed = progress.get('completedWork', progress.get('workCompleted', 0))
    if int(completed) != manifest['documentCount']: raise ValueError('Native export document count differs from readable extract')
    functions = json.loads((root / 'legacy-functions.json').read_text()); quiescence = json.loads((root / 'quiescence.json').read_text())
    if quiescence.get('project') != args.project or quiescence.get('remainingFunctions') != [] or quiescence.get('retiredFunctions') != [f['name'] for f in functions]: raise ValueError('Quiescence evidence differs')
    for function in functions:
        if function['name'].split('/')[-1] != 'addRxPacket' or not (root / 'addRxPacket-source.zip').is_file(): raise ValueError('Legacy Function source missing')
    docs = [json.loads(line) for line in (root / 'firestore-typed.jsonl').read_text().splitlines()]
    if len(docs) != manifest['documentCount'] or len({d['name'] for d in docs}) != len(docs): raise ValueError('Readable extract count differs')
    for doc in docs:
        if not doc['name'].startswith(database(args.project) + '/documents/') or not doc.get('createTime') or not doc.get('updateTime') or not isinstance(doc.get('fields', {}), dict): raise ValueError('Readable extract identity/types missing')
    for kind in ['logs', 'native']:
        inventory = json.loads((root / (kind + '-inventory.json')).read_text())
        if kind == 'logs' and len(inventory) != manifest['logCount']: raise ValueError('Log inventory count differs')
        if kind == 'native' and (not inventory or not any(o['name'].endswith('.overall_export_metadata') for o in inventory)): raise ValueError('Native metadata missing')
        expected_files = set()
        for item in inventory:
            source_prefix = 'logs/' if kind == 'logs' else prefix[1] + '/'
            if not item['name'].startswith(source_prefix): raise ValueError('Object outside archive prefix')
            relative = item['name'][len(source_prefix):]
            target = (root / kind / relative).resolve()
            if not target.is_relative_to(root / kind) or not target.is_file(): raise ValueError('Downloaded object missing')
            expected_files.add(str(target.relative_to(root)))
            raw = target.read_bytes()
            if len(raw) != int(item['size']) or item.get('md5Hash') and base64.b64encode(hashlib.md5(raw).digest()).decode() != item['md5Hash']: raise ValueError('Downloaded object checksum differs')
        if {name for name in manifest['files'] if name.startswith(kind + '/')} != expected_files: raise ValueError('Downloaded inventory differs')
    print(json.dumps({'verified': True, 'documents': len(docs), 'logs': manifest['logCount'], 'manifestSha256': sha(root / 'archive-manifest.json')}))
    return docs

def cleanse(args):
    documents = verify(args)
    current = scan(args.project)
    if sorted(documents, key=lambda d: d['name']) != sorted(current, key=lambda d: d['name']): raise ValueError('Database differs from verified archive')
    if json.loads(run('functions', 'list', '--project', args.project, '--format=json')): raise ValueError('Legacy writer is still deployed')
    for start in range(0, len(documents), 100):
        writes = [{'delete': doc['name'], 'currentDocument': {'updateTime': doc['updateTime']}} for doc in documents[start:start+100]]
        api('https://firestore.googleapis.com/v1/' + database(args.project) + '/documents:commit', {'writes': writes})
    if scan(args.project): raise ValueError('Database not empty after cleanse')
    after = json.loads(run('firestore', 'databases', 'describe', '--project', args.project, '--database', '(default)', '--format=json'))
    root = pathlib.Path(args.archive).resolve(); before = json.loads((root / 'database-before.json').read_text())
    for key in ['name', 'uid', 'createTime', 'locationId', 'type']:
        if after.get(key) != before.get(key): raise ValueError('Database resource identity differs')
    save_json(root / 'cleanse-evidence.json', {'project': args.project, 'deletedDocuments': len(documents), 'remainingDocuments': 0, 'database': after})
    print('Database cleansed; existing resource and archive retained')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['archive', 'verify', 'cleanse']); parser.add_argument('--project', required=True); parser.add_argument('--archive', required=True); parser.add_argument('--apply', action='store_true'); parser.add_argument('--export-bucket'); parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    if args.project != PROJECT: parser.error('Only the explicitly agreed staging project is supported')
    if args.action == 'verify': return verify(args)
    if args.action == 'archive' and not args.export_bucket: parser.error('--export-bucket is required')
    if not args.apply:
        print(json.dumps({'dryRun': True, 'action': args.action, 'project': args.project, 'archive': str(pathlib.Path(args.archive).resolve()), 'effects': 'Archive: preserve Function source/config, retire legacy writer, native export, typed extract and logs download. Cleanse: delete only unchanged archived documents after verification.'})); return
    return {'archive': archive, 'cleanse': cleanse}[args.action](args)
if __name__ == '__main__': main()
