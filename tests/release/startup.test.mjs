import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { fixture } from './helpers.mjs';
import { serverRoot } from '../../scripts/release.mjs';

test('actual gateway entrypoint starts for valid, missing and invalid release with simulated physical transports',async t=>{
 const f=fixture();t.after(f.cleanup);const release=f.prepare();
 fs.copyFileSync(path.join(serverRoot,'index.mjs'),path.join(f.project,'index.mjs'));
 fs.cpSync(path.join(serverRoot,'public/modules'),path.join(f.project,'public/modules'),{recursive:true});
 fs.mkdirSync(path.join(f.project,'public/nodes/synthetic'),{recursive:true});fs.writeFileSync(path.join(f.project,'public/nodes/synthetic/config.ini'),'node=2');
 for(const mode of ['valid','missing','invalid']){
  if(mode==='invalid')fs.writeFileSync(path.join(release,'moduleInfo.json'),'corrupt');
  fs.writeFileSync(path.join(f.project,'config.json'),JSON.stringify({[os.hostname()]:{id:250,releaseDir:mode==='missing'?'':release,telemetryPort:'',domain:'',apiKey:'',logFilePath:''},firebase:{apiKey:''}}));
  const child=spawn(process.execPath,['--experimental-loader',path.join(serverRoot,'tests/release/hardware-loader.mjs'),'index.mjs'],{cwd:f.project,env:{...process.env,TERM:'xterm'},stdio:['pipe','pipe','pipe','ipc']});
  let errors='';child.stdout.resume();child.stderr.on('data',bytes=>{errors+=bytes;});
  try{
   const message=await Promise.race([once(child,'message').then(([m])=>m),once(child,'exit').then(([code])=>{throw new Error(`Gateway exited ${code}: ${errors}`);}),new Promise((_r,reject)=>{const timer=setTimeout(()=>reject(new Error('Gateway startup timeout')),10000);timer.unref();})]);
   const base=`http://127.0.0.1:${message.port}`;
   const status=await (await fetch(base+'/release-status')).json();assert.equal(status.available,mode==='valid');
   assert.equal((await fetch(base+'/firmware')).status,mode==='valid'?200:503);
   assert.equal((await fetch(base+'/routes')).status,200);assert.equal((await fetch(base+'/nodeFiles')).status,200);
   const socket=io(base,{transports:['websocket'],autoConnect:false});
   try{const connected=new Promise((resolve,reject)=>{socket.once('release.status',resolve);socket.once('connect_error',reject);});socket.connect();assert.deepEqual(await connected,status);}finally{socket.disconnect();}
  }finally{const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}
 }
});
