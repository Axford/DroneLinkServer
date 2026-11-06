import importlib.util, io, json, pathlib, sys, tarfile, tempfile, types, unittest
from unittest.mock import patch
TOOLS = pathlib.Path(__file__).resolve().parents[2] / 'tools/operations'
sys.path.insert(0, str(TOOLS))
import legacy, release, staging
class Operations(unittest.TestCase):
    def test_archive_verification_requires_complete_checksum_inventory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            doc = {'name': 'projects/dronelink-25dbc/databases/(default)/documents/nodes/one', 'fields': {'packet': {'bytesValue': 'AQI='}}, 'createTime': '2020-01-01T00:00:00Z', 'updateTime': '2020-01-01T00:00:00Z'}
            (root / 'firestore-typed.jsonl').write_text(json.dumps(doc) + '\n')
            (root / 'logs-inventory.json').write_text('[]')
            (root / 'native').mkdir(); (root / 'native/snapshot.overall_export_metadata').write_bytes(b'native')
            legacy.save_json(root / 'native-inventory.json', [{'name': 'sep06/native/snapshot.overall_export_metadata', 'size': '6', 'generation': '1'}])
            legacy.save_json(root / 'native-export-operation.json', {'done': True, 'metadata': {'outputUriPrefix': 'gs://private-export/sep06/native', 'progressDocuments': {'completedWork': '1'}}})
            legacy.save_json(root / 'database-before.json', {'name': legacy.database(legacy.PROJECT), 'uid': 'preserved-resource', 'type': 'FIRESTORE_NATIVE', 'locationId': 'eur3'})
            legacy.save_json(root / 'legacy-functions.json', [])
            legacy.save_json(root / 'quiescence.json', {'project': legacy.PROJECT, 'remainingFunctions': [], 'retiredFunctions': []})
            legacy.save_json(root / 'export-bucket.json', {'name': 'private-export', 'public_access_prevention': 'enforced', 'uniform_bucket_level_access': True, 'location': 'EU'})
            manifest = {'project': legacy.PROJECT, 'database': '(default)', 'nativePrefix': 'gs://private-export/sep06/native', 'documentCount': 1, 'logCount': 0, 'files': {str(p.relative_to(root)): legacy.sha(p) for p in root.rglob('*') if p.is_file()}}
            legacy.save_json(root / 'archive-manifest.json', manifest)
            args = types.SimpleNamespace(archive=str(root), project=legacy.PROJECT)
            self.assertEqual(legacy.verify(args), [doc])
            operation = json.loads((root / 'native-export-operation.json').read_text())
            operation['metadata']['progressDocuments']['completedWork'] = '2'
            legacy.save_json(root / 'native-export-operation.json', operation)
            manifest['files']['native-export-operation.json'] = legacy.sha(root / 'native-export-operation.json')
            legacy.save_json(root / 'archive-manifest.json', manifest)
            with self.assertRaisesRegex(ValueError, 'document count differs'): legacy.verify(args)
            operation['metadata']['progressDocuments']['completedWork'] = '1'
            legacy.save_json(root / 'native-export-operation.json', operation)
            manifest['files']['native-export-operation.json'] = legacy.sha(root / 'native-export-operation.json')
            legacy.save_json(root / 'archive-manifest.json', manifest)
            (root / 'firestore-typed.jsonl').write_text('')
            with self.assertRaisesRegex(ValueError, 'checksum'): legacy.verify(args)
    def test_incomplete_archive_is_rejected_before_delete(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            legacy.save_json(root / 'archive-manifest.json', {'project': legacy.PROJECT, 'database': '(default)', 'files': {}})
            args = types.SimpleNamespace(archive=str(root), project=legacy.PROJECT)
            with patch.object(legacy, 'api') as api:
                with self.assertRaisesRegex(ValueError, 'mandatory'): legacy.cleanse(args)
                api.assert_not_called()
    def test_missing_function_source_prevents_writer_retirement(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary) / 'archive'
            args = types.SimpleNamespace(archive=str(root), project=legacy.PROJECT, export_bucket='gs://private-export')
            calls = []
            def run(*values):
                calls.append(values)
                if values[:3] == ('storage', 'buckets', 'describe'): return json.dumps({'name': 'private-export', 'public_access_prevention': 'enforced', 'uniform_bucket_level_access': True, 'location': 'EU'})
                if values[:2] == ('functions', 'list'): return json.dumps([{'name': 'projects/dronelink-25dbc/locations/us-central1/functions/addRxPacket'}])
                raise AssertionError(values)
            with patch.object(legacy, 'run', run):
                with self.assertRaisesRegex(ValueError, 'source metadata missing'): legacy.archive(args)
            self.assertFalse(any(call[:2] == ('functions', 'delete') for call in calls))
    def test_recursive_extract_visits_missing_parent_documents(self):
        root = legacy.database(legacy.PROJECT) + '/documents'
        doc = {'name': root + '/nodes/missing/params/value', 'createTime': '2020', 'updateTime': '2020', 'fields': {'x': {'integerValue': '4'}}}
        def api(url, body=None):
            if url.endswith(':listCollectionIds'):
                parent = url.removeprefix('https://firestore.googleapis.com/v1/').removesuffix(':listCollectionIds')
                return {'collectionIds': {root: ['nodes'], root + '/nodes/missing': ['params']}.get(parent, [])}
            if '/nodes?' in url: return {'documents': [{'name': root + '/nodes/missing'}]}
            if '/params?' in url: return {'documents': [doc]}
            raise AssertionError(url)
        with patch.object(legacy, 'api', api): self.assertEqual(legacy.scan(legacy.PROJECT), [doc])
    def test_cleanse_never_deletes_unarchived_or_changed_documents(self):
        original = {'name': 'document', 'updateTime': 'before'}
        args = types.SimpleNamespace(archive='unused', project=legacy.PROJECT)
        with patch.object(legacy, 'verify', return_value=[original]), patch.object(legacy, 'scan', return_value=[{**original, 'updateTime': 'after'}]), patch.object(legacy, 'api') as api:
            with self.assertRaisesRegex(ValueError, 'differs'): legacy.cleanse(args)
            api.assert_not_called()
    def test_release_verify_detects_changed_and_extra_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary); (root / 'index.js').write_text('ready')
            manifest = {'schemaVersion': 1, 'accessPolicyVersion': 1, 'storageFormat': {'adapter': 'native-firestore', 'schemaVersion': 1}, 'serverRevision': 'a'*40, 'clientRevision': 'b'*40, 'files': {'index.js': release.digest(b'ready')}}
            (root / 'hosted-release.json').write_text(json.dumps(manifest))
            release.verify(root)
            (root / 'config.json').write_text('must not enter image')
            with self.assertRaisesRegex(ValueError, 'file set'): release.verify(root)
    def test_client_path_and_target_validation(self):
        for value in ['../secret', '/absolute', 'build/../config', 'build//index.html', 'C:config']:
            with self.assertRaises(ValueError): release.safe(value)
        with tempfile.TemporaryDirectory() as temporary:
            path = pathlib.Path(temporary) / 'settings.json'; path.write_text(json.dumps({'project': 'production'}))
            with self.assertRaisesRegex(ValueError, 'target differs'): staging.settings(path)

class StagingDeployment(unittest.TestCase):
    def test_deployment_uses_structured_build_metadata_and_routes_new_revision(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary); context = root / 'release'; context.mkdir(); (context / 'hosted-release.json').write_text('verified')
            config = {'project': staging.PROJECT, 'region': staging.REGION, 'service': staging.SERVICE, 'publicOrigin': 'https://staging.dronewright.com', 'serviceAccount': f'{staging.SERVICE}@{staging.PROJECT}.iam.gserviceaccount.com', 'googleClientID': 'public-client-id', 'googleSecret': 'google:1', 'sessionSecret': 'session:1'}
            settings = root / 'settings.json'; settings.write_text(json.dumps(config))
            manifest = {'accessPolicyVersion': 1, 'serverRevision': 'a'*40, 'clientRevision': 'b'*40, 'storageFormat': {'adapter': 'native-firestore', 'schemaVersion': 1}}
            image = f'{staging.REGION}-docker.pkg.dev/{staging.PROJECT}/dronewright/hosted:' + 'a'*12 + '-' + 'b'*12
            calls = []
            def run(*args):
                calls.append(args)
                if args[:2] == ('builds', 'submit'):
                    self.assertIn('--async', args)
                    return json.dumps({'id': '12345678-1234-1234-1234-123456789012'})
                if args[:2] == ('builds', 'describe'): return json.dumps({'status': 'SUCCESS', 'results': {'images': [{'name': image, 'digest': 'sha256:'+'c'*64}]}})
                if args[:3] == ('run', 'revisions', 'describe'): return json.dumps({'status': {'imageDigest': image.split(':')[0]+'@sha256:'+'c'*64}})
                if args[:3] == ('run', 'services', 'describe'):
                    routed = any(call[:3] == ('run', 'services', 'update-traffic') for call in calls)
                    return json.dumps({'status': {'latestCreatedRevisionName': staging.SERVICE+'-new', 'latestReadyRevisionName': staging.SERVICE+('-new' if routed else '-old'), 'traffic': [{'revisionName': staging.SERVICE+('-new' if routed else '-old'), 'percent': 100}]}})
                return ''
            def api(path, body=None, method=None):
                if path.endswith('/versions'): return {'name': 'sites/'+staging.PROJECT+'/versions/new'}
                return {'name': 'sites/'+staging.PROJECT+'/releases/new'}
            args = types.SimpleNamespace(release=str(context), settings=str(settings), evidence=str(root/'evidence.json'), apply=True, build=None, maintenance=True)
            with patch.object(staging, 'verify', return_value=manifest), patch.object(staging, 'run', run), patch.object(staging, 'api', api): staging.deploy(args)
            traffic = next(call for call in calls if call[:3] == ('run', 'services', 'update-traffic') and '--to-revisions' in call)
            self.assertIn(staging.SERVICE+'-new=100', traffic)
            self.assertIn('--clear-tags', traffic)
            deploy = next(call for call in calls if call[:3] == ('run', 'deploy', staging.SERVICE))
            self.assertIn('--no-traffic', deploy)
            self.assertIn('internal', deploy)
            evidence = json.loads((root/'evidence.json').read_text())
            self.assertEqual(evidence['image'], image.split(':')[0]+'@sha256:'+'c'*64)

class AccessPolicyRelease(unittest.TestCase):
    def test_old_membership_only_rollback_is_rejected_before_any_cloud_call(self):
        with tempfile.TemporaryDirectory() as temporary:
            deployment = pathlib.Path(temporary) / 'old.json'; deployment.write_text(json.dumps({'schemaVersion': 1}))
            args = types.SimpleNamespace(maintenance=False, deployment=str(deployment), apply=True)
            with patch.object(staging, 'run') as run:
                with self.assertRaisesRegex(ValueError, 'Unsafe membership-only'): staging.rollback(args)
                run.assert_not_called()
    def test_old_release_policy_is_rejected_before_source_or_cloud_use(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary); (root / 'hosted-release.json').write_text(json.dumps({'schemaVersion': 1}))
            with self.assertRaisesRegex(ValueError, 'access policy version1'): release.verify(root)

class AccessTrafficGate(unittest.TestCase):
    def test_failed_traffic_verification_never_reopens_public_ingress(self):
        calls = []
        def run(*args):
            calls.append(args)
            if args[:3] == ('run', 'services', 'describe'):
                return json.dumps({'status': {'traffic': [{'revisionName': 'old-revision', 'percent': 100, 'tag': 'retained-old'}]}})
            return ''
        with patch.object(staging, 'run', run):
            with self.assertRaisesRegex(ValueError, 'not serving all traffic'): staging.route_compatible_revision('safe-revision')
        self.assertIn('--clear-tags', calls[0])
        self.assertFalse(any('--ingress' in call and 'all' in call for call in calls))

if __name__ == '__main__': unittest.main()
