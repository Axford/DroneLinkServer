import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { canonical, serverRoot } from '../../scripts/release.mjs';
export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const catalog = { Drone: { type: ['Drone'], filename: ['src/DroneModule.h'], description: ['Base module'], pub: [{address: 1, type: 'u8', numValues: 1, writeable: true, name: 'status', description: 'Enabled'}] } };
export function archive(file, manifest, payload, extra = []) {
  manifest = { ...manifest, files: Object.fromEntries(Object.entries(payload).map(([p, bytes]) => [p, hash(bytes)])) };
  manifest.identity = hash(canonical(manifest));
  const members = [...Object.entries(payload).map(([name, data]) => ({name, data: Buffer.from(data).toString('base64')})), {name:'release-manifest.json', data:Buffer.from(canonical(manifest)).toString('base64')}, ...extra];
  execFileSync('python3', ['-c', `import sys,json,tarfile,io,base64
items=json.load(sys.stdin)
with tarfile.open(sys.argv[1],'w:gz') as tar:
 for item in items:
  entry=tarfile.TarInfo(item['name']); data=base64.b64decode(item.get('data','')); entry.size=len(data)
  if item.get('type'): entry.type=item['type'].encode();entry.linkname=item.get('link','');entry.size=0
  tar.addfile(entry,io.BytesIO(data))`, file], {input:JSON.stringify(members)});
  fs.writeFileSync(file+'.sha256',hash(fs.readFileSync(file)));
  return manifest;
}
export function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gateway-release-test-'));
  const project=path.join(root,'server');fs.mkdirSync(project);
  const files=['scripts/release.mjs','scripts/read-release-archive.py','scripts/gateway-release.mjs','package.json','package-lock.json','templates/help/module.mustache','templates/help/index.mustache','public/help/firmwareSetupGuide.html','public/help/sailingBoatSetup.html','public/help/pins.html'];
  for(const file of files){fs.mkdirSync(path.dirname(path.join(project,file)),{recursive:true});fs.copyFileSync(path.join(serverRoot,file),path.join(project,file));}
  fs.symlinkSync(path.join(serverRoot,'node_modules'),path.join(project,'node_modules'),'dir');
  fs.writeFileSync(path.join(project,'.gitignore'),'node_modules/\n');
  execFileSync('git',['init','--quiet',project]);
  execFileSync('git',['add','.'],{cwd:project});
  execFileSync('git',['-c','user.name=Release Test','-c','user.email=release-test@example.invalid','commit','--quiet','-m','Synthetic isolated release renderer'],{cwd:project});
  const source={schemaVersion:1,sourceRevision:'a'.repeat(40),sourceFiles:{'src/DroneModule.h':'b'.repeat(64)}};
  const metadata=path.join(root,'metadata.tgz'),firmware=path.join(root,'firmware.tgz');
  const meta=archive(metadata,{...source,kind:'metadata'},{'moduleInfo.json':canonical(catalog)});
  const fw={...source,kind:'firmware',metadataIdentity:meta.identity,environment:'esp32doit-devkit-v1',board:'esp32doit-devkit-v1',buildMarker:'a'.repeat(7),buildFlags:[],buildTools:{platformio:'synthetic',resolvedPackages:[]}};
  archive(firmware,fw,{'firmware.bin':Buffer.from([0xe9,1,2,3]),'firmware.ver':'a'.repeat(7)});
  const prepare=(output=path.join(root,'selected'))=>{execFileSync(process.execPath,['scripts/release.mjs','prepare','--firmware',firmware,'--metadata',metadata,'--output',output],{cwd:project,stdio:'pipe'});return output;};
  return {root,project,source,fw,metadata,firmware,prepare,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
