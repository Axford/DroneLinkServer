#!/usr/bin/env python3
"""Explicit manual staging deployment/rollback. Cloud mutation requires --apply."""
import argparse, hashlib, json, pathlib, re, subprocess, tempfile, urllib.request, time
from release import verify
PROJECT = 'dronelink-25dbc'; REGION = 'europe-west1'; SERVICE = 'dronewright-staging'

def run(*args): return subprocess.check_output(['gcloud', *args], text=True).strip()
def api(path, body=None, method=None):
    token = run('auth', 'print-access-token')
    request = urllib.request.Request('https://firebasehosting.googleapis.com/v1beta1/' + path, data=None if body is None else json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT}, method=method)
    with urllib.request.urlopen(request, timeout=120) as response: return json.load(response)

def publish_hosting(config, message):
    version = api(f'sites/{PROJECT}/versions', {'config': config})
    api(version['name'] + ':populateFiles', {'files': {}})
    api(version['name'] + '?updateMask=status', {'status': 'FINALIZED'}, 'PATCH')
    release = api(f'sites/{PROJECT}/releases?versionName=' + version['name'], {'message': message})
    return version, release

def settings(path):
    config = json.loads(pathlib.Path(path).read_text())
    if config.get('project') != PROJECT or config.get('region') != REGION or config.get('service') != SERVICE or config.get('publicOrigin') != 'https://staging.dronewright.com': raise ValueError('Settings target differs from agreed staging')
    for field in ['googleSecret', 'sessionSecret']:
        if not re.fullmatch(r'[a-zA-Z0-9_-]+:[1-9][0-9]*', config[field]): raise ValueError('Pin a numbered Secret Manager version')
    if config['serviceAccount'] != f'{SERVICE}@{PROJECT}.iam.gserviceaccount.com': raise ValueError('Unexpected service identity')
    return config

def route_compatible_revision(revision_name):
    run('run', 'services', 'update-traffic', SERVICE, '--project', PROJECT, '--region', REGION, '--to-revisions', revision_name + '=100', '--clear-tags', '--quiet')
    service = json.loads(run('run', 'services', 'describe', SERVICE, '--project', PROJECT, '--region', REGION, '--format=json'))
    traffic = service['status'].get('traffic', [])
    if any(row.get('tag') for row in traffic) or sum(row.get('percent', 0) for row in traffic if row.get('revisionName') == revision_name) != 100: raise ValueError('New revision is not serving all traffic')
    run('run', 'services', 'update', SERVICE, '--project', PROJECT, '--region', REGION, '--ingress', 'all', '--quiet')

def deploy(args):
    manifest = verify(args.release); config = settings(args.settings)
    image = f'{REGION}-docker.pkg.dev/{PROJECT}/dronewright/hosted:{manifest["serverRevision"][:12]}-{manifest["clientRevision"][:12]}'
    if not args.apply:
        print(json.dumps({'dryRun': True, 'project': PROJECT, 'region': REGION, 'service': SERVICE, 'image': image, 'billing': 'instance', 'min': 0, 'max': 1, 'cpu': 1, 'memory': '512Mi', 'concurrency': 32})); return
    if not args.maintenance: raise ValueError('M1 deployment requires explicit --maintenance for the old-runtime traffic cutover')
    evidence = pathlib.Path(args.evidence)
    if evidence.exists(): raise ValueError('Evidence destination already exists')
    # Build only the independently verified release directory, with no local config/secrets.
    if args.build:
        if not re.fullmatch(r'[a-f0-9-]{36}', args.build): raise ValueError('Invalid build identity')
        build_id = args.build
    else:
        queued = json.loads(run('builds', 'submit', str(pathlib.Path(args.release).resolve()), '--tag', image, '--project', PROJECT, '--region', REGION, '--format=json', '--quiet', '--async'))
        build_id = queued['id']
    print(json.dumps({'buildId': build_id}), flush=True)
    deadline = time.monotonic() + 900
    while True:
        built = json.loads(run('builds', 'describe', build_id, '--project', PROJECT, '--region', REGION, '--format=json'))
        if built['status'] == 'SUCCESS': break
        if built['status'] not in ['QUEUED', 'WORKING', 'PENDING'] or time.monotonic() > deadline: raise ValueError('Cloud Build did not succeed: ' + built['status'])
        time.sleep(3)
    images = built['results']['images']
    if images[0]['name'] != image: raise ValueError('Build image does not match release identity')
    image = image.split(':')[0] + '@' + images[0]['digest']
    if not re.search(r'@sha256:[a-f0-9]{64}$', image): raise ValueError('Build did not produce a digest')
    # Remove old public/tagged paths before the new policy can become reachable.
    run('run', 'services', 'update', SERVICE, '--project', PROJECT, '--region', REGION, '--ingress', 'internal', '--quiet')
    run('run', 'services', 'update-traffic', SERVICE, '--project', PROJECT, '--region', REGION, '--clear-tags', '--quiet')
    env = {'GOOGLE_CLOUD_PROJECT': PROJECT, 'FIRESTORE_DATABASE': '(default)', 'PUBLIC_ORIGIN': config['publicOrigin'], 'GOOGLE_CLIENT_ID': config['googleClientID'], 'MAPBOX_ACCESS_TOKEN': config.get('mapboxAccessToken', '')}
    with tempfile.TemporaryDirectory(prefix='dronewright-deploy-') as temporary:
        envfile = pathlib.Path(temporary) / 'env.json'; envfile.write_text(json.dumps(env))
        run('run', 'deploy', SERVICE, '--project', PROJECT, '--region', REGION, '--image', image, '--service-account', config['serviceAccount'], '--no-cpu-throttling', '--min', '0', '--max', '1', '--cpu', '1', '--memory', '512Mi', '--concurrency', '32', '--timeout', '60', '--port', '8080', '--ingress', 'internal', '--no-traffic', '--allow-unauthenticated', '--env-vars-file', str(envfile), '--set-secrets', f'GOOGLE_CLIENT_SECRET={config["googleSecret"]},SESSION_SECRET={config["sessionSecret"]}', '--quiet')
    service = json.loads(run('run', 'services', 'describe', SERVICE, '--project', PROJECT, '--region', REGION, '--format=json'))
    revision_name = service['status']['latestCreatedRevisionName']
    revision = json.loads(run('run', 'revisions', 'describe', revision_name, '--project', PROJECT, '--region', REGION, '--format=json'))
    if revision['status']['imageDigest'] != image: raise ValueError('Created revision image differs from verified build')
    route_compatible_revision(revision_name)
    version, hosting = publish_hosting({'rewrites': [{'glob': '**', 'run': {'serviceId': SERVICE, 'region': REGION}}]}, 'Dronewright matched release ' + manifest['serverRevision'][:12])
    result = {'schemaVersion': 1, 'accessPolicyVersion': manifest['accessPolicyVersion'], 'telemetryPolicyVersion': manifest['telemetryPolicyVersion'], 'project': PROJECT, 'region': REGION, 'service': SERVICE, 'image': image, 'revision': revision_name, 'hostingRelease': hosting['name'], 'hostingVersion': version['name'], 'storageFormat': manifest['storageFormat'], 'releaseManifestSha256': hashlib.sha256((pathlib.Path(args.release) / 'hosted-release.json').read_bytes()).hexdigest(), 'serverRevision': manifest['serverRevision'], 'clientRevision': manifest['clientRevision'], 'settings': config}
    evidence.parent.mkdir(parents=True, exist_ok=True); evidence.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['image', 'revision', 'hostingRelease']}))

def rollback(args):
    if args.maintenance:
        if not args.apply: print(json.dumps({'dryRun': True, 'action': 'disable external staging service', 'project': PROJECT})); return
        run('run', 'services', 'update', SERVICE, '--project', PROJECT, '--region', REGION, '--ingress', 'internal', '--quiet')
        print('External staging access disabled; Firestore retained'); return
    prior = json.loads(pathlib.Path(args.deployment).read_text())
    if prior.get('accessPolicyVersion') != 1: raise ValueError('Unsafe membership-only rollback; use maintenance and a compatible M1 release')
    if prior.get('telemetryPolicyVersion') != 1: raise ValueError('Unsafe permissive-ingress rollback; use maintenance and a compatible M1-B release')
    if prior['project'] != PROJECT or prior['region'] != REGION or prior['service'] != SERVICE or prior['storageFormat']['schemaVersion'] != 1 or prior['storageFormat']['adapter'] != 'native-firestore' or not re.fullmatch(SERVICE + r'-[a-z0-9-]+', prior['revision']): raise ValueError('Incompatible rollback target')
    if not re.fullmatch(r'sites/' + PROJECT + r'/versions/[A-Za-z0-9_-]+', prior['hostingVersion']) or not re.fullmatch(REGION + r'-docker.pkg.dev/' + PROJECT + r'/dronewright/hosted@sha256:[a-f0-9]{64}', prior['image']): raise ValueError('Rollback resource target differs')
    if not args.apply: print(json.dumps({'dryRun': True, 'revision': prior['revision'], 'hostingVersion': prior['hostingVersion'], 'data': 'retained'})); return
    revision = json.loads(run('run', 'revisions', 'describe', prior['revision'], '--project', PROJECT, '--region', REGION, '--format=json'))
    if revision['status']['imageDigest'] != prior['image']: raise ValueError('Rollback image differs')
    hosting = api(prior['hostingVersion'])
    inventory = api(prior['hostingVersion'] + '/files?pageSize=10')
    reserved = {'/__/firebase/init.js', '/__/firebase/init.json'}
    if inventory.get('nextPageToken') or any(file['path'] not in reserved for file in inventory.get('files', [])): raise ValueError('Expected container-only Hosting version')
    run('run', 'services', 'update', SERVICE, '--project', PROJECT, '--region', REGION, '--ingress', 'internal', '--quiet')
    route_compatible_revision(prior['revision'])
    publish_hosting(hosting['config'], 'Data-preserving application rollback')
    print('Compatible application revision restored; Firestore retained')

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('action', choices=['deploy', 'rollback']); parser.add_argument('--project', required=True); parser.add_argument('--release'); parser.add_argument('--settings'); parser.add_argument('--evidence'); parser.add_argument('--deployment'); parser.add_argument('--maintenance', action='store_true'); parser.add_argument('--apply', action='store_true'); parser.add_argument('--build', help='Resume a completed build of this exact release')
    args = parser.parse_args()
    if args.project != PROJECT: parser.error('Only agreed staging project supported')
    if args.action == 'deploy':
        if not all([args.release, args.settings, args.evidence]): parser.error('Deployment requires --release --settings --evidence')
        deploy(args)
    else:
        if not args.maintenance and not args.deployment: parser.error('Rollback requires --deployment or --maintenance')
        rollback(args)
if __name__ == '__main__': main()
