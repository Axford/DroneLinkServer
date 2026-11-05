import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import express from 'express';
import blessed from 'neo-blessed';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { fixture, archive } from './helpers.mjs';
import { verifyRelease, serverRoot } from '../../scripts/release.mjs';
import { loadGatewayRelease, mountReleaseRoutes, applyReleaseToTerminal } from '../../scripts/gateway-release.mjs';
import DroneLinkManager from '../../public/modules/DroneLinkManager.mjs';

test('actual preparation, input matching, renderer provenance, no overwrite and rollback',()=>{
 const f=fixture();try{
  const first=f.prepare();
  archive(f.firmware,f.fw,{'firmware.bin':Buffer.from([0xe9,5,6,7]),'firmware.ver':'a'.repeat(7)});
  const second=f.prepare(path.join(f.root,'second'));
  const manifest=verifyRelease(first);assert.notEqual(manifest.identity,verifyRelease(second).identity);
  assert.match(fs.readFileSync(path.join(first,'help/Drone.html'),'utf8'),/Base module/);
  assert.equal(manifest.exports.firmware.manifest.metadataIdentity,manifest.exports.metadata.manifest.identity);
  assert.throws(()=>f.prepare(first));
  assert.equal(loadGatewayRelease({releaseDir:first}).status.available,true);
  assert.equal(loadGatewayRelease({releaseDir:second}).status.available,true);
  assert.equal(loadGatewayRelease({releaseDir:first}).status.identity,manifest.identity);
  assert.deepEqual(loadGatewayRelease({releaseDir:first}).firmware.image,Buffer.from([0xe9,1,2,3]));
 }finally{f.cleanup();}
});
test('corruption of each prepared component disables the complete set but returns startup status',()=>{
 const f=fixture();try{
  const release=f.prepare();
  for(const file of ['firmware.bin','moduleInfo.json','help/index.html']){
   const target=path.join(release,file),before=fs.readFileSync(target);fs.writeFileSync(target,'corrupt');
   const selected=loadGatewayRelease({releaseDir:release});assert.equal(selected.status.available,false);assert.equal(selected.firmware,null);assert.equal(selected.assets.size,0);assert.match(selected.status.warning,/unavailable/);
   fs.writeFileSync(target,before);
  }
  fs.symlinkSync('/tmp',path.join(release,'unexpected-link'));assert.throws(()=>verifyRelease(release));
 }finally{f.cleanup();}
});
test('wrong pins, malformed metadata, unsafe/duplicate/link members fail without changing selected release',()=>{
 const f=fixture();try{
  const selected=f.prepare();const id=verifyRelease(selected).identity;
  const cases=[{...f.fw,metadataIdentity:'c'.repeat(64)},{...f.fw,board:'wrong'}];
  for(const fw of cases){archive(f.firmware,fw,{'firmware.bin':'image','firmware.ver':'a'.repeat(7)});assert.throws(()=>f.prepare(path.join(f.root,'failure')));assert.equal(fs.existsSync(path.join(f.root,'failure')),false);}
  // Start fresh for each malformed archive rather than accepting the earlier bad pin.
  for(const member of [{name:'../escape',data:''},{name:'firmware.bin',data:''},{name:'link',type:'2',link:'/tmp'}]){
   archive(f.firmware,f.fw,{'firmware.bin':'image','firmware.ver':'a'.repeat(7)},[member]);assert.throws(()=>f.prepare(path.join(f.root,'failure')));
  }
  archive(f.firmware,f.fw,{'firmware.bin':'image','firmware.ver':'a'.repeat(7)});
  archive(f.metadata,{...f.source,kind:'metadata'},{'moduleInfo.json':JSON.stringify({Drone:{type:['Drone'],filename:['src/DroneModule.h'],pub:[{address:1,type:'unknown',numValues:1,writeable:true,name:'status',description:'Status'}]}})});
  assert.throws(()=>f.prepare(path.join(f.root,'failure')));
  assert.equal(verifyRelease(selected).identity,id);
 }finally{f.cleanup();}
});
test('HTTP release mounts block legacy static fallbacks; diagnostics and raw node-file routes remain usable',async t=>{
 const f=fixture();t.after(f.cleanup);
 const prepared=f.prepare();const app=express();let selected=loadGatewayRelease({releaseDir:prepared});
 mountReleaseRoutes(app,selected);app.get('/diagnostics',(_q,r)=>r.json({telemetry:true}));app.get('/node-file',(_q,r)=>r.send('raw config'));
 app.use(express.static(path.join(serverRoot,'public')));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/firmware')).status,200);assert.equal((await fetch(base+'/firmware/firmware.ver')).status,200);assert.equal((await fetch(base+'/moduleInfo.json')).status,200);
 assert.equal((await fetch(base+'/help/Drone.html')).status,200);assert.equal((await fetch(base+'/firmware/firmware%204.bin')).status,404);
 // Active bytes are fixed; external edits cannot mix the selected assets during serving.
 fs.writeFileSync(path.join(prepared,'firmware.bin'),'changed');assert.deepEqual(Buffer.from(await (await fetch(base+'/firmware')).arrayBuffer()),Buffer.from([0xe9,1,2,3]));
 const unavailable=loadGatewayRelease({releaseDir:prepared});const app2=express();mountReleaseRoutes(app2,unavailable);app2.get('/diagnostics',(_q,r)=>r.send('live'));app2.get('/node-file',(_q,r)=>r.send('raw config'));app2.use(express.static(path.join(serverRoot,'public')));
 const s2=app2.listen(0,'127.0.0.1');await once(s2,'listening');t.after(()=>new Promise(resolve=>s2.close(resolve)));
 const b2=`http://127.0.0.1:${s2.address().port}`;
 for(const url of ['/firmware','/firmware/firmware.bin','/moduleInfo.json','/help/index.html','/module%49nfo.json','/HELP/index.html','/firmware%2ffirmware.bin'])assert.equal((await fetch(b2+url)).status,503);
 assert.equal(await (await fetch(b2+'/diagnostics')).text(),'live');assert.equal(await (await fetch(b2+'/node-file')).text(),'raw config');
 assert.equal((await (await fetch(b2+'/release-status')).json()).available,false);
 assert.equal(loadGatewayRelease({}).status.available,false);assert.match(loadGatewayRelease({firmwarePath:'/unused'}).status.warning,/No release configured.*Obsolete firmwarePath/);
});
test('real terminal widgets persist warning/disabled state and distribution execution rejects missing release',t=>{
 t.mock.method(globalThis,'setInterval',()=>0);
 const input=new PassThrough(),output=new PassThrough();input.isTTY=true;input.setRawMode=()=>{};output.columns=100;output.rows=30;output.isTTY=true;
 const screen=blessed.screen({input,output,terminal:'xterm'});t.after(()=>screen.destroy());
 const warning=blessed.box({parent:screen,width:100,height:3});const prime=blessed.button({parent:screen});const start=blessed.button({parent:screen});
 const missing=loadGatewayRelease({});applyReleaseToTerminal(missing.status,warning,[prime,start]);screen.render();
 assert.equal(warning.hidden,false);assert.match(warning.getContent(),/No release configured/);assert.equal(prime.disabled,true);
 const manager=new DroneLinkManager(250,()=>{},'','');manager.primeFirmwareUpdate();manager.startFirmwareUpdate();manager.transmitFirmware();assert.equal(manager.firmwareSending,false);
 applyReleaseToTerminal({available:true,warning:''},warning,[prime,start]);screen.render();assert.equal(warning.hidden,true);assert.equal(prime.disabled,false);
 manager.firmwareRelease={image:Buffer.from([1,2,3])};manager.primeFirmwareUpdate();assert.equal(manager.firmwareSize,3);manager.startFirmwareUpdate();assert.equal(manager.firmwareSending,true);
});
test('retired integration has no UI events/controls, source mutation or process launcher',()=>{
 const index=fs.readFileSync(path.join(serverRoot,'index.mjs'),'utf8');const management=fs.readFileSync(path.join(serverRoot,'public/modules/oui/interfaces/Management.mjs'),'utf8');
 assert.doesNotMatch(index+management,/setVSCIP|VSCIPUpdated|VSCIPError|VSCUpload|hasRequestedCSVIP|pio run -t upload|\.\.\/DroneNode/);
 assert.doesNotMatch(index,/child_process/);assert.equal(fs.existsSync(path.join(serverRoot,'parseModules.js')),false);
 assert.match(management,/getIpString/);assert.match(index,/fs\.write\.request/);
});
