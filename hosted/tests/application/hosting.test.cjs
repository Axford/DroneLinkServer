const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {application,serve,root,modelFixture}=require('./support.cjs');

function tempDir(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dronelink-ui-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return dir;
}
function artifact(dir,marker) {
  fs.mkdirSync(path.join(dir,'static/js'),{recursive:true});
  fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><title>${marker}</title><script src="/static/js/main.js"></script>`);
  fs.writeFileSync(path.join(dir,'static/js/main.js'),`console.log(${JSON.stringify(marker)});`);
  for(const name of ['manifest.json','favicon.ico','logo192.png','logo512.png']) fs.writeFileSync(path.join(dir,name),`${marker}:${name}`);
}

test('configured artifact owns all React assets, public invite shell and authenticated deep links',async t=>{
  const dir=tempDir(t); artifact(dir,'external-artifact');
  const {app}=application('current',{config:{clientBuildDir:dir}}); const agent=(await serve(t,app))();
  for(const url of ['/static/js/main.js','/manifest.json','/favicon.ico','/logo192.png','/logo512.png','/invite/token']) {
    const response=await agent.request(url); assert.equal(response.status,200,url); assert.match(response.text,/external-artifact/,url);
  }
  assert.equal((await agent.request('/private')).status,302);
  assert.equal((await agent.request('/private/domain/example')).status,302);
  await agent.login();
  const directory=await agent.request('/private'); assert.equal(directory.status,301); assert.equal(directory.headers.get('location'),'/private/');
  for(const url of ['/private/','/private/index.html','/private/domain/example']) {
    const response=await agent.request(url); assert.equal(response.status,200,url); assert.match(response.text,/external-artifact/,url);
  }
  assert.equal((await agent.request('/api/does-not-exist')).status,404);
  assert.equal((await agent.request('/auth/does-not-exist')).status,404);
  assert.equal((await agent.request('/static/missing.js')).status,404);
  assert.equal((await agent.request('/private/not-a-route')).status,404);
});

test('explicit invalid artifacts fail construction instead of falling back to stale default UI',t=>{
  const dir=tempDir(t);
  for(const value of ['',null,123,dir,path.join(dir,'missing')]) {
    assert.throws(()=>application('current',{config:{clientBuildDir:value}}),/clientBuildDir/);
  }
  fs.writeFileSync(path.join(dir,'index.html'),'incomplete');
  assert.throws(()=>application('current',{config:{clientBuildDir:dir}}),/static directory/);
  fs.mkdirSync(path.join(dir,'static')); fs.rmSync(path.join(dir,'index.html')); fs.mkdirSync(path.join(dir,'index.html'));
  assert.throws(()=>application('current',{config:{clientBuildDir:dir}}),/index.html/);
});

test('relative artifact paths resolve against the service directory, regardless of working directory',async t=>{
  const dir=tempDir(t); artifact(dir,'relative-path-artifact');
  const originalCwd=process.cwd(); let app;
  try {
    process.chdir(os.tmpdir());
    ({app}=application('current',{config:{clientBuildDir:path.relative(root,dir)}}));
  } finally { process.chdir(originalCwd); }
  const response=await (await serve(t,app))().request('/invite/token'); assert.match(response.text,/relative-path-artifact/);
});

test('application sessions and Passport bindings are isolated across multiple constructions',async t=>{
  const aFixture=modelFixture(); const bFixture=modelFixture();
  aFixture.users.values().next().value.email='alpha@example.test';
  bFixture.users.values().next().value.email='beta@example.test';
  const a=(await serve(t,application('current',{fixture:aFixture}).app))();
  const b=(await serve(t,application('current',{fixture:bFixture}).app))();
  await a.login();
  assert.equal((await b.request('/api/user',{headers:{Cookie:a.cookie}})).status,302);
  await b.login();
  assert.equal((await a.request('/api/user')).json().email,'alpha@example.test');
  assert.equal((await b.request('/api/user')).json().email,'beta@example.test');
  await a.request('/auth/logout');
  assert.equal((await b.request('/api/user')).status,200);
});

test('production composition uses the actual Google strategy while construction itself needs no network',async t=>{
  const {createApp}=require('../../app'); const fixture=modelFixture();
  const app=createApp({config:require('./support.cjs').testConfig(),models:fixture.models});
  const agent=(await serve(t,app))(); const response=await agent.request('/auth/google');
  assert.equal(response.status,302);
  const url=new URL(response.headers.get('location'));
  assert.equal(url.hostname,'accounts.google.com');
  assert.equal(url.searchParams.get('client_id'),'test-id');
  assert.equal(new URL(url.searchParams.get('redirect_uri')).pathname,'/auth/google/callback');
  assert.equal(fixture.writes.length,0);
});

test('provider callback failures use real error handling without authenticating the session',async t=>{
  const agent=(await serve(t,application('current').app))();
  const error=await agent.request('/auth/google/callback?error=1'); assert.equal(error.status,500);
  assert.equal((await agent.request('/api/user')).status,302);
});

test('missing-config startup still creates a local skeleton and exits before database/listener startup',t=>{
  const dir=tempDir(t);
  const result=spawnSync(process.execPath,[path.join(root,'index.js')],{cwd:dir,encoding:'utf8',timeout:5000});
  assert.equal(result.status,1,result.stderr);
  const config=JSON.parse(fs.readFileSync(path.join(dir,'config.json'),'utf8'));
  assert.equal(config.port,8003); assert.equal(config.googleClientID,'your-google-client-id');
  assert.doesNotMatch(result.stdout,/Connecting to MongoDB|Web server listening/);
});

test('importing the application factory alone neither loads production models/config nor listens/connects',()=>{
  const script=`const assert=require('node:assert/strict'); require('./app'); const loaded=Object.keys(require.cache); assert(!loaded.some(p=>p.endsWith('/config.json')||p.includes('/models/'))); console.log('factory-import-ok');`;
  const result=spawnSync(process.execPath,['-e',script],{cwd:root,encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/factory-import-ok/);
});

for (const target of ['sep02','current']) test(`${target}: supplied production release serves from an isolated copy and can roll back to the retained artifact`,async t=>{
  assert.ok(process.env.CLIENT_BUILD_DIR,'Set CLIENT_BUILD_DIR to an explicitly verified extracted Client build');
  const build=path.resolve(process.env.CLIENT_BUILD_DIR);
  assert.ok(fs.existsSync(path.join(build,'asset-manifest.json')),'CLIENT_BUILD_DIR must contain the real production artifact');
  const destination=path.join(tempDir(t),'ui-release'); fs.cpSync(build,destination,{recursive:true});
  assert.equal(fs.existsSync(path.join(destination,'src')),false); assert.equal(fs.existsSync(path.join(destination,'node_modules')),false);
  const manifest=JSON.parse(fs.readFileSync(path.join(destination,'asset-manifest.json'),'utf8'));
  const fileUrls=Object.values(manifest.files).filter(value=>typeof value==='string' && value!=='/index.html');
  for(const url of fileUrls) assert.equal(fs.lstatSync(path.join(destination,url)).isSymbolicLink(),false);
  const overrides=application(target,{config:{clientBuildDir:destination}}); const configured=(await serve(t,overrides.app))();
  for(const url of ['/invite/test',...fileUrls]) {
    const response=await configured.request(url); assert.equal(response.status,200,url);
    if(url.startsWith('/invite/')) assert.equal(response.text,fs.readFileSync(path.join(destination,'index.html'),'utf8'));
  }
  assert.equal((await configured.request('/index.html')).status,404);
  await configured.login();
  for(const url of ['/private/','/private/domain/test']) {
    const response=await configured.request(url); assert.equal(response.status,200); assert.equal(response.text,fs.readFileSync(path.join(destination,'index.html'),'utf8'));
  }
  assert.deepEqual((await configured.request('/api/config')).json(),{success:true,data:{mapboxAccessToken:'public-test-map-token'}});
  const defaultHost=(await serve(t,application(target,{config:{clientBuildDir:build}}).app))(); await defaultHost.login();
  assert.equal((await defaultHost.request('/private/')).text,fs.readFileSync(path.join(build,'index.html'),'utf8'));
  // Distinguish rollback selection after the externally supplied artifact changes.
  fs.writeFileSync(path.join(destination,'index.html'),'changed-external-artifact');
  assert.equal((await configured.request('/private/')).text,'changed-external-artifact');
  assert.notEqual((await defaultHost.request('/private/')).text,'changed-external-artifact');
});

test('default missing build preserves backend availability and existing missing-file errors',async t=>{
  // A temporary service copy under the repo uses ordinary parent dependency
  // resolution, with no source/node_modules symlink and no build directory.
  const isolated=fs.mkdtempSync(path.join(root,'.test-application-'));
  t.after(()=>fs.rmSync(isolated,{recursive:true,force:true}));
  for(const item of ['app.js','middleware','lib','public']) fs.cpSync(path.join(root,item),path.join(isolated,item),{recursive:true});
  const {createApp}=require(path.join(isolated,'app.js'));
  const {testConfig,TestGoogleStrategy}=require('./support.cjs');
  const app=createApp({config:testConfig({clientBuildDir:undefined}),models:modelFixture().models,googleStrategyFactory:(options,verify)=>new TestGoogleStrategy(options,verify)});
  const agent=(await serve(t,app))();
  assert.equal((await agent.request('/invite/token')).status,500);
  await agent.login(); assert.equal((await agent.request('/api/config')).status,200);
  assert.equal((await agent.request('/private/')).status,404);
  // The legacy default directory remains a supported artifact installation path.
  const supplied=process.env.CLIENT_BUILD_DIR;
  assert.ok(supplied,'Set CLIENT_BUILD_DIR to an extracted production build');
  fs.cpSync(path.resolve(supplied),path.join(isolated,'private/build'),{recursive:true});
  const restored=await agent.request('/private/');
  assert.equal(restored.status,200);
  assert.equal(restored.text,fs.readFileSync(path.join(supplied,'index.html'),'utf8'));
});


test('explicit invalid build configuration fails the real startup entrypoint before any database connection',t=>{
  const isolated=fs.mkdtempSync(path.join(root,'.test-application-'));
  t.after(()=>fs.rmSync(isolated,{recursive:true,force:true}));
  for(const item of ['index.js','app.js','middleware','lib','models','public']) fs.cpSync(path.join(root,item),path.join(isolated,item),{recursive:true});
  const {testConfig}=require('./support.cjs');
  fs.writeFileSync(path.join(isolated,'config.json'),JSON.stringify(testConfig({clientBuildDir:'missing-release'})));
  const result=spawnSync(process.execPath,[path.join(isolated,'index.js')],{cwd:isolated,encoding:'utf8',timeout:5000});
  assert.equal(result.status,1,result.stderr); assert.match(result.stderr,/Invalid clientBuildDir/);
  assert.doesNotMatch(result.stdout,/Connecting to MongoDB|Web server listening/);
});
