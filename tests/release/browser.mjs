/** Real browser component acceptance; all provider/device connections intercepted. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import express from 'express';
import { fixture, hash } from './helpers.mjs';
import { serverRoot } from '../../scripts/release.mjs';
import { loadGatewayRelease, mountReleaseRoutes } from '../../scripts/gateway-release.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.DRONELINK_PLAYWRIGHT_MODULE || 'playwright');
const jquery=fs.readFileSync(new URL('./fixtures/jquery-3.6.0.min.js',import.meta.url));
assert.equal(Buffer.from(hash(jquery),'hex').toString('base64'),'/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4=');
const f=fixture();let browser;
const servers=[];
try{
 const prepared=f.prepare();
 browser=await chromium.launch({channel:process.env.DRONELINK_BROWSER_CHANNEL || 'chrome',headless:true});
 console.log('Browser:',browser.version());
 const baseFor=async config=>{
  const app=express();mountReleaseRoutes(app,loadGatewayRelease(config));
  app.get('/test-jquery.js',(_q,r)=>r.type('js').send(jquery));
  app.get('/test-lodash.js',(_q,r)=>r.sendFile(require.resolve('lodash')));
  app.get('/browser-test',(_q,r)=>r.type('html').send(`<!doctype html><html><body><h1>Gateway release acceptance</h1><div id="management"></div><div id="telemetry"></div><div id="raw-file"></div>
<script src="/test-jquery.js"></script><script src="/test-lodash.js"></script><script type="module">
import '/modules/release-ui.mjs';
import catalog,{metadataAvailable,applyGatewayStatus} from '/modules/release-state.mjs';
import Management from '/modules/oui/interfaces/Management.mjs';
import Configuration from '/modules/oui/panels/Configuration.mjs';
import GraphEditor from '/modules/oui/GraphEditor.mjs';
import '/modules/oui/GraphPort.mjs';
import '/modules/oui/Wizard.mjs';
import Parser from '/modules/DroneConfigParser.mjs';
import State from '/modules/DroneLinkState.mjs';
import Log from '/modules/DroneLinkLog.mjs';
import {showLogImportStatus} from '/modules/log-import-status.mjs';
import {DroneLinkMsg} from '/modules/droneLinkMsg.mjs';
// Draggable presentation plugin is outside these controls' acceptance scope.
$.fn.draggable=function(){return this;};
const state=new State();const msg=new DroneLinkMsg();msg.node=2;msg.channel=1;msg.param=1;msg.setUint8([42]);state.handleLinkMsg(msg,false,'simulated');
document.querySelector('#telemetry').textContent='Telemetry: '+state.getParamValues(2,1,1,[0])[0];
const channel={channel:1,node:{id:2,ui:$('#management')},interfaceTab:$('#management')};
const management=new Management(channel,{getParamValues:(_n,_c,p,def)=>p===12?[127,0,0,1]:def,send:()=>{}});management.build();
// Run the production raw-file completion path against simulated transport bytes.
const raw={setEditorContents:(text,name)=>document.querySelector('#raw-file').textContent=name+': '+text};
Configuration.prototype.onDownloadComplete.call(raw,{filedata:new TextEncoder().encode('node=2'),fullpath:'/config.ini'});
const parser=new Parser();let parseError='';try{parser.parse('node=2\\n[ Drone = 1 ]\\nstatus=1');}catch(error){parseError=error.message;}
const log=new Log(state);log.on('import', report=>showLogImportStatus(report,'log-import-status'));
log.loadFromBuffer(Uint8Array.of(11,0,0,0,1,0,7,4,0,0,42,0));
window.acceptance={applyGatewayStatus,metadataAvailable,modules:Object.keys(catalog),parseError,management,graph:new GraphEditor({})};
</script></body></html>`));
  app.use(express.static(path.join(serverRoot,'public')));
  const server=app.listen(0,'127.0.0.1');servers.push(server);await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;
 };
 const valid=await baseFor({releaseDir:prepared});
 const missing=await baseFor({});
 fs.writeFileSync(path.join(prepared,'firmware.bin'),'corrupt');const invalid=await baseFor({releaseDir:prepared});
 const context=await browser.newContext();
 await context.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:'export const getFirestore=()=>({}),collection=()=>({}),doc=()=>({}),setDoc=()=>{},addDoc=()=>{},getDocs=()=>[],deleteDoc=()=>{},query=()=>({}),onSnapshot=()=>{},where=()=>({}),getStorage=()=>({}),ref=()=>({}),uploadBytesResumable=()=>({}),listAll=()=>({}),getBytes=()=>({});'}));
 await context.route('http://127.0.0.1/nodeInfo',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({interfaces:[{id:1,type:'Simulated UDP',state:'Up',link:'test'}],routes:[],queue:{utilisation:0,size:0,kicked:0,kickRate:0,choked:0,chokeRate:0,items:[]}})}));
 for(const [name,base,available] of [['valid',valid,true],['missing',missing,false],['invalid',invalid,false],['rollback',valid,true]]){
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/browser-test');await page.waitForFunction(()=>window.acceptance);
  assert.equal(await page.evaluate(()=>window.acceptance.metadataAvailable),available,name);
  assert.match(await page.getByRole('alert').filter({hasText:'Partial log import'}).textContent(),/1 valid records, 0 invalid records skipped; stopped at byte 11/);
  assert.equal(await page.locator('button').filter({hasText:/^Modules$/}).isDisabled(),!available,name);
  assert.equal(await page.locator('#release-warning').count(),available?0:1,name);
  assert.match(await page.locator('#telemetry').textContent(),/42/);assert.match(await page.locator('#raw-file').textContent(),/\/config.ini: node=2/);
  assert.equal(await page.getByRole('button',{name:'Set VSC IP',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'VSC Upload',exact:true}).count(),0);
  await page.getByRole('button',{name:'Network',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Simulated UDP'));
  if(!available){assert.match(await page.evaluate(()=>window.acceptance.parseError),/unavailable/);await page.evaluate(()=>window.acceptance.graph.show());assert.equal(await page.evaluate(()=>window.acceptance.graph.visible),false);}
  else assert.equal(await page.evaluate(()=>window.acceptance.parseError),'');
  assert.deepEqual(errors,[],name);
  if(process.env.DRONELINK_RELEASE_SCREENSHOT_DIR){fs.mkdirSync(process.env.DRONELINK_RELEASE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.DRONELINK_RELEASE_SCREENSHOT_DIR,name+'.png')});}
  // Keep this browser open across simulated gateway-process status changes.
  await page.evaluate(()=>window.acceptance.applyGatewayStatus({available:false,warning:'Replacement release invalid'}));
  assert.match(await page.locator('#release-warning').textContent(),/Replacement release invalid/);
  assert.equal(await page.locator('button').filter({hasText:/^Modules$/}).isDisabled(),true);
  await page.evaluate(()=>window.acceptance.applyGatewayStatus({available:true,identity:'new-release',warning:''}));
  assert.equal(await page.locator('#release-warning').count(),0);assert.equal(await page.locator('#release-refresh').count(),1);
  assert.match(await page.locator('#raw-file').textContent(),/node=2/);
  console.log('PASS browser',name,': warning/catalog controls, complete consumer imports, diagnostics, telemetry and raw-file completion');await page.close();
 }
 await context.close();
}finally{
 if(browser)await browser.close();await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));f.cleanup();
}
