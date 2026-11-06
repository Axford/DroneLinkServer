'use strict';
// Explicit staging-only acceptance. Writes are restricted to named B fixture Domains.
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto'); const assert=require('node:assert/strict');
const {openFirestoreStore}=require('@dronelink/persistence');
const [action,...args]=process.argv.slice(2); const flag=name=>args[args.indexOf(name)+1];
if(!['prepare','check','cleanup'].includes(action)||!args.includes('--apply')||flag('--project')!=='dronelink-25dbc'||!args.includes('--state')) throw Error('Explicit staging project, --apply and private --state are required');
const statePath=path.resolve(flag('--state')); const origin='https://staging.dronewright.com';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
 const store=await openFirestoreStore({projectId:'dronelink-25dbc',databaseId:'(default)'});
 try{
  const control=await store.access.getControl(); assert.equal(control.state,'ready');
  const admin=await store.users.getById(control.soleAdmin.userId); assert.equal(admin.emailVerified,true);
  const actor={userId:admin._id,sessionEpoch:control.sessionEpoch,allowedRoles:['owner'],allowPlatformAdmin:true};
  let state;
  async function fixture(id){const domain=await store.domains.getById(id);assert.match(domain?.name||'',/^M1-B (?:acceptance|isolation) \d{4}-\d{2}-\d{2}$/);assert.equal(domain.createdBy,admin._id);return domain;}
  const persist=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
  if(action==='prepare'){
   if(fs.existsSync(statePath))throw Error('Retain existing acceptance state');
   if(!args.includes('--domain'))throw Error('Select the Admin-created acceptance Domain');
   const domain=await fixture(flag('--domain')); assert.equal(domain.status,'active');
   const identities=await store.telemetry.listIdentities(actor,{domainId:domain._id});assert.equal(identities.nodes.length,0);assert.equal(await store.packets.countRetained(domain._id),0);
   state={project:'dronelink-25dbc',domainId:domain._id,isolationName:domain.name.replace('acceptance','isolation'),apiKey:domain.apiKey,prepared:false};
   fs.writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
   const isolation=await store.domains.createOwned(actor,{name:state.isolationName});
   state.isolationId=isolation._id;persist();
   const secret=crypto.randomBytes(32).toString('base64url');
   const gateway=await store.telemetry.issueGateway(actor,{domainId:domain._id,name:'M1-B confirmed bench relay',nodeAddress:254,secretHash:digest(secret)});
   state.gatewayId=gateway._id;state.credential=gateway._id+'.'+secret;state.prepared=true;persist();
   console.log(JSON.stringify({prepared:true,domainId:domain._id,isolationId:isolation._id,gatewayId:gateway._id,secretPrinted:false}));return;
  }
  assert.equal(fs.lstatSync(statePath).isSymbolicLink(),false);assert.equal(fs.statSync(statePath).mode&0o077,0);
  state=JSON.parse(fs.readFileSync(statePath));assert.equal(state.project,'dronelink-25dbc');
  let domain=await fixture(state.domainId);let isolation=state.isolationId?await fixture(state.isolationId):null;
  // Recover an isolation creation whose outcome was unknown before its ID was saved.
  if(!isolation&&action==='cleanup'){
   let cursor;
   do{const page=await store.domains.listForActor(actor,{limit:100,cursor});const match=page.items.find(row=>row.name===state.isolationName&&row.createdBy===admin._id);if(match){isolation=await fixture(match._id);break;}cursor=page.nextCursor;}while(cursor);
  }
  const machine=async(route,body={},bearer)=>{
   const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},body:JSON.stringify({domain:state.domainId,id:254,...body}),redirect:'error',signal:AbortSignal.timeout(30000)});
   await response.arrayBuffer();return response.status;
  };
  const direct=(packet,extra={})=>machine('/addPacket',{apiKey:state.apiKey,packet,...extra});
  const relay=(packet,extra={})=>machine('/addPacket',{packet,...extra},state.credential);
  const verify=(extra={},token=state.credential)=>machine('/gateway/verify',extra,token);
  const identities=()=>store.telemetry.listIdentities(actor,{domainId:state.domainId});
  if(action==='check'){
   assert.equal(state.prepared,true,'Complete preparation or use scoped cleanup');
   assert.ok(isolation);
   if(state.checked)throw Error('Managed checks already recorded; preserve existing evidence');
   assert.equal(await verify(),200);assert.equal(await verify({id:253}),401);
   assert.equal(await relay('AAEBAYAB',{apiKey:state.apiKey}),401);
   assert.equal(await direct('AQIDBAU='),400);assert.equal(await direct('AMkBAYAB',{node:200}),400);
   assert.equal(await direct('AMkBAYAB',{apiKey:'invalid'}),401);assert.equal((await identities()).nodes.length,0);
   // Query target202 is not evidence of that target's presence.
   assert.equal(await direct('/soBAXAA'),202);assert.equal((await identities()).nodes.length,0);
   const replies=await Promise.all(Array.from({length:4},()=>direct('AMkBAYAB')));assert.deepEqual(replies,[202,202,202,202]);
   assert.equal(await relay('AMkBAYAB'),202);
   let snapshot=await identities();assert.equal(snapshot.nodes.length,1);assert.equal(snapshot.nodes[0].address,201);assert.deepEqual(snapshot.drones[0].memberAddresses,[201]);assert.equal(snapshot.drones[0].masterAddress,201);
   const stable=snapshot.nodes[0].droneId;
   assert.equal(await direct('AMkBAYAB',{domain:isolation._id,apiKey:isolation.apiKey}),202);
   const other=await store.telemetry.listIdentities(actor,{domainId:isolation._id});assert.notEqual(other.nodes[0].droneId,stable);
   assert.equal(await relay('AMkBAYAB',{domain:isolation._id}),401);
   const human=await fetch(origin+'/api/domains/'+state.domainId+'/members',{headers:{Authorization:'Bearer '+state.credential},redirect:'error'});assert.equal(human.status,401);await human.arrayBuffer();
   domain=await store.domains.archive(actor,{domainId:domain._id,revision:domain.revision});assert.equal(await verify(),409);assert.equal(await direct('AMkBAYAB'),409);
   domain=await store.domains.restore(actor,{domainId:domain._id,revision:domain.revision});assert.equal(await verify(),200);
   const previous=state.apiKey;domain=await store.domains.rotateKey(actor,{domainId:domain._id,revision:domain.revision,newKey:crypto.randomBytes(32).toString('hex')});state.apiKey=domain.apiKey;persist();
   assert.equal(await direct('AMkBAYAB',{apiKey:previous}),401);assert.equal(await direct('AMkBAYAB'),202);assert.equal(await verify(),200);
   const secret=crypto.randomBytes(32).toString('base64url');const disposable=await store.telemetry.issueGateway(actor,{domainId:domain._id,name:'M1-B revocation probe',nodeAddress:254,secretHash:digest(secret)});
   assert.equal(await verify({},disposable._id+'.'+secret),200);await store.telemetry.revokeGateway(actor,{domainId:domain._id,gatewayId:disposable._id,revision:disposable.revision});assert.equal(await verify({},disposable._id+'.'+secret),401);
   snapshot=await identities();assert.equal(snapshot.nodes[0].droneId,stable);
   state.checked=true;persist();const result={managedChecksPassed:true,publicationAddress:201,queryTargetNotDiscovered:true,stableDroneId:stable,crossDomainIsolation:true,archiveRestore:true,keyRotation:true,gatewayRevocation:true,machineHumanSeparation:true};
   fs.writeFileSync(statePath+'.managed-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }else{
   const page=await store.telemetry.listGateways(actor,{domainId:domain._id,limit:100});for(const gateway of page.items)if(!gateway.revokedAt)await store.telemetry.revokeGateway(actor,{domainId:domain._id,gatewayId:gateway._id,revision:gateway.revision});
   for(let value of [domain,isolation].filter(Boolean))if(value.status==='active')await store.domains.archive(actor,{domainId:value._id,revision:value.revision});
   if(state.credential)assert.equal(await verify(),401);state.cleaned=true;persist();console.log(JSON.stringify({credentialsRevoked:true,acceptanceDomainsArchived:isolation?2:1}));
  }
 }finally{await store.close();}
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
