#!/usr/bin/env python3
"""Approved M1-C staging gate. Exact frozen release/target; no production or rollback."""
import argparse,hashlib,json,os,pathlib,subprocess,sys,urllib.parse,urllib.error
os.umask(0o077)
os.environ.setdefault('SSL_CERT_FILE','/opt/homebrew/etc/ca-certificates/cert.pem')
HOSTED=pathlib.Path(__file__).resolve().parents[2]
OPS=HOSTED/'tools/operations'
sys.path.insert(0,str(OPS))
import legacy
from release import verify
PROJECT='dronelink-25dbc';REGION='europe-west1';SERVICE='dronewright-staging'
SERVER_REV='1a5152b33a3c645b83e34916cdbc7f1a535c9e09'
CLIENT_REV='2631beea5cecab02a8e65d869e4ce4e69127ebe8'
EXPECTED='05d1e698bebb39acaff70fbab01503efb94ba0d0c631237be7acea92b06de39a'
ROOT=HOSTED/'.cache/m1-c';RELEASE=ROOT/('release-'+SERVER_REV)
FIELDS=[('observationChannels','params'),('observationUpdates','channels'),('observationUpdates','nodes'),('observationControl','retained')]
def output(name,value):
 (ROOT/name).write_text(json.dumps(value,indent=2)+'\n');print(json.dumps(value),flush=True)
def gcloud(*args):return json.loads(subprocess.check_output(['gcloud',*args,'--project',PROJECT,'--format=json'],text=True))
def validate():
 if hashlib.sha256((RELEASE/'hosted-release.json').read_bytes()).hexdigest()!=EXPECTED:raise RuntimeError('Frozen release hash differs')
 manifest=verify(RELEASE)
 if manifest['serverRevision']!=SERVER_REV or manifest['clientRevision']!=CLIENT_REV or manifest.get('observationPolicyVersion')!=1 or manifest['persistenceVersion']!='0.5.0':raise RuntimeError('Unapproved release')
 return manifest
def hashes():
 rows=[]
 for collection in ['domains','packetChunks']:
  token=None
  while True:
   query=urllib.parse.urlencode({'pageSize':100,**({'pageToken':token} if token else {})})
   page=legacy.api('https://firestore.googleapis.com/v1/'+legacy.database(PROJECT)+'/documents/'+collection+'?'+query)
   for doc in page.get('documents',[]):rows.append({'name':doc['name'],'fieldsSha256':hashlib.sha256(json.dumps(doc.get('fields',{}),sort_keys=True,separators=(',',':')).encode()).hexdigest()})
   if len(rows)>10000:raise RuntimeError('Hash-only inventory exceeds approved bound')
   token=page.get('nextPageToken')
   if not token:break
 return rows
def field_config(group,field):
 url=f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/collectionGroups/{group}/fields/{field}'
 try:return legacy.api(url)
 except urllib.error.HTTPError as error:
  if error.code==404:return {'name':url.split('/v1/')[1]}
  raise

def readiness():
 script="""const {openFirestoreStore}=require('@dronelink/persistence');const {openAccessOperatorStore}=require('@dronelink/persistence/operator');(async()=>{const runtime=await openFirestoreStore({projectId:'dronelink-25dbc',databaseId:'(default)'});const operator=await openAccessOperatorStore({projectId:'dronelink-25dbc',databaseId:'(default)'});try{const control=await runtime.access.getControl();const person=await runtime.users.getById(control.soleAdmin.userId);if(person.email!=='damian@axford.me.uk'||!person.emailVerified)throw Error('Unexpected Admin identity');const result=await operator.checkMigration({planDigest:control.planDigest});if(result.issues.length||!result.indexes.ready)throw Error('Readiness issues');console.log(JSON.stringify({state:result.state,schemaVersion:result.schemaVersion,revision:result.revision,managedIndexesReady:result.indexes.ready,issues:result.issues,soleAdminVerified:true}));}finally{await runtime.close();await operator.close();}})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});"""
 return json.loads(subprocess.check_output(['node','-e',script],cwd=HOSTED,text=True))
def preflight():
 validate();ROOT.mkdir(parents=True,exist_ok=True)
 target=ROOT/'preservation-before.json'
 if not target.exists():
  rows=hashes();target.write_text(json.dumps(rows,indent=2)+'\n')
 else:rows=json.loads(target.read_text())
 service=gcloud('run','services','describe',SERVICE,'--region',REGION)
 fields=[{'collectionGroup':group,'field':field,'indexConfig':field_config(group,field).get('indexConfig',{})} for group,field in FIELDS]
 output('preflight.json',{'preservedRecords':len(rows),'readiness':readiness(),'revision':service['status']['latestReadyRevisionName'],'traffic':service['status'].get('traffic',[]),'fieldExemptions':fields,'releaseManifestSha256':EXPECTED})
def indexes():
 validate();results=[]
 for group,field in FIELDS:
  before=field_config(group,field).get('indexConfig',{})
  if before.get('indexes') or before.get('usesAncestorConfig',True):
   subprocess.run(['gcloud','firestore','indexes','fields','update',field,'--collection-group='+group,'--database=(default)','--project='+PROJECT,'--disable-indexes','--quiet'],check=True)
  after=field_config(group,field).get('indexConfig',{})
  if after.get('indexes'):raise RuntimeError('Field remains indexed')
  results.append({'collectionGroup':group,'field':field,'indexesDisabled':True,'ttlChanged':False})
 output('field-exemptions.json',{'fields':results})
def deploy():
 validate()
 if not (ROOT/'preservation-before.json').exists() or not (ROOT/'field-exemptions.json').exists():raise RuntimeError('Run approved preflight/index gates first')
 if (ROOT/'deployment.json').exists():raise RuntimeError('Deployment already recorded; use verify instead')
 subprocess.run([sys.executable,str(OPS/'staging.py'),'deploy','--project',PROJECT,'--release',str(RELEASE),'--settings',str(HOSTED/'.cache/m1-b-closeout-20261106/staging-settings.json'),'--evidence',str(ROOT/'deployment.json'),'--maintenance','--apply'],cwd=HOSTED,check=True)
def check():
 validate();expected=json.loads((ROOT/'deployment.json').read_text());service=gcloud('run','services','describe',SERVICE,'--region',REGION)
 traffic=service['status'].get('traffic',[])
 if any(row.get('tag') for row in traffic) or sum(row.get('percent',0) for row in traffic if row.get('revisionName')==expected['revision'])!=100:raise RuntimeError('Unexpected traffic selection')
 revision=gcloud('run','revisions','describe',expected['revision'],'--region',REGION)
 if revision['status']['imageDigest']!=expected['image']:raise RuntimeError('Image differs')
 output('managed-readiness.json',{'revision':expected['revision'],'image':expected['image'],'trafficPercent':100,'oldTags':0,'observationPolicyVersion':1,'readiness':readiness()})
def preserve():
 baseline=json.loads((ROOT/'preservation-before.json').read_text());current=hashes();lookup={row['name']:row['fieldsSha256'] for row in current}
 if not all(lookup.get(row['name'])==row['fieldsSha256'] for row in baseline):raise RuntimeError('Original Domain/history hashes changed')
 output('preservation-after.json',{'allOriginalHashesMatch':True,'originalRecords':len(baseline),'newRecords':len(current)-len(baseline)})
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('phase',choices=['preflight','indexes','deploy','verify','preserve']);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
 if args.phase in ['indexes','deploy'] and not args.apply:parser.error('The approved managed mutation requires --apply')
 {'preflight':preflight,'indexes':indexes,'deploy':deploy,'verify':check,'preserve':preserve}[args.phase]()
if __name__=='__main__':main()
