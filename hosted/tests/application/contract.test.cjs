const test=require('node:test');
const assert=require('node:assert/strict');
const {application,serve,ids}=require('./support.cjs');
const targets=process.env.APPLICATION_BASELINE_ONLY ? ['baseline'] : ['baseline','sep02','current'];
for(const target of targets) {
  test(`${target}: public/login redirects and protected routes preserve current auth boundary`,async t=>{
    const {app}=application(target); const agent=(await serve(t,app))();
    for(const url of ['/','/private','/private/domain/123','/profile','/api/user','/api/config','/api/domains']) {
      const r=await agent.request(url); assert.equal(r.status,302,url); assert.equal(r.headers.get('location'),'/public',url);
    }
    const redirect=await agent.request('/public'); assert.equal(redirect.status,301); assert.equal(redirect.headers.get('location'),'/public/');
    const publicPage=await agent.request('/public/'); assert.equal(publicPage.status,200); assert.match(publicPage.text,/href="\/auth\/google"/);
    const login=await agent.request('/auth/google'); assert.equal(login.status,302); assert.match(login.headers.get('location'),/^https:\/\/accounts.google.com\//);
  });
  test(`${target}: callback, cookie-backed deserialization, profile redirect and logout`,async t=>{
    const {app,fixture}=application(target); const makeAgent=await serve(t,app); const agent=makeAgent();
    const callback=await agent.login(); assert.equal(callback.status,302); assert.equal(callback.headers.get('location'),'/profile');
    assert.match(callback.headers.get('set-cookie'),/HttpOnly/); assert.ok(agent.cookie);
    const user=await agent.request('/api/user'); assert.equal(user.status,200); assert.equal(user.json().email,'member@example.test');
    assert.ok(fixture.users.get(ids.member).lastSignInDate);
    assert.equal((await makeAgent().request('/api/user')).status,302);
    assert.equal((await agent.request('/profile')).headers.get('location'),'/private');
    assert.equal((await agent.request('/')).headers.get('location'),'/private');
    assert.equal((await agent.request('/auth/logout')).headers.get('location'),'/public');
    assert.equal((await agent.request('/api/user')).status,302);
    const failed=await makeAgent().request('/auth/google/callback?fail=1'); assert.equal(failed.headers.get('location'),'/public');
  });
  test(`${target}: production verify callback creates first-time users through the model seam`,async t=>{
    const {app,fixture}=application(target); const agent=(await serve(t,app))();
    assert.equal((await agent.login('newcomer')).status,302);
    assert.equal((await agent.request('/api/user')).json().email,'newcomer@example.test');
    assert.equal(fixture.users.size,3);
  });
  test(`${target}: membership denial, not-found and validation errors remain observable`,async t=>{
    const {app}=application(target); const agent=(await serve(t,app))(); await agent.login('outsider');
    const denied=await agent.request(`/api/domains/${ids.domain}`); assert.equal(denied.status,403); assert.equal(denied.json().success,false);
    assert.equal((await agent.request('/api/domains/000000000000000000000099')).status,404);
    const bad=await agent.request('/api/domains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:''})}); assert.equal(bad.status,400); assert.equal(bad.json().message,'Validation failed');
    const badPage=await agent.request('/api/domains?limit=101'); assert.equal(badPage.status,400);
  });
  test(`${target}: member JSON, pagination, browser config and map state`,async t=>{
    const {app,fixture}=application(target); const agent=(await serve(t,app))(); await agent.login();
    const list=(await agent.request('/api/domains')).json(); assert.equal(list.success,true); assert.equal(list.data[0].name,'Test domain'); assert.equal(list.pagination.total,1);
    assert.equal((await agent.request(`/api/domains/${ids.domain}`)).json().data.name,'Test domain');
    const config=(await agent.request('/api/config')).json(); assert.deepEqual(config,{success:true,data:{mapboxAccessToken:'public-test-map-token'}});
    const valid=await agent.request('/api/user/map-state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({lng:1,lat:2,zoom:3})}); assert.equal(valid.status,200); assert.deepEqual({...fixture.users.get(ids.member).mapState},{lng:1,lat:2,zoom:3});
    const invalid=await agent.request('/api/user/map-state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({lng:181,lat:2,zoom:3})}); assert.equal(invalid.status,400);
  });
  test(`${target}: public invite preview, authenticated acceptance and duplicate conflict`,async t=>{
    const {app,fixture}=application(target); const agent=(await serve(t,app))();
    const preview=await agent.request('/api/invite/fixture-invite'); assert.equal(preview.status,200); assert.equal(preview.json().data.domainName,'Test domain');
    assert.equal((await agent.request('/api/invite/missing')).status,404);
    await agent.login('outsider');
    const accepted=await agent.request('/api/invite/fixture-invite',{method:'POST'}); assert.equal(accepted.status,200); assert.equal(fixture.domains.get(ids.domain).users.length,2);
    assert.equal((await agent.request('/api/invite/fixture-invite',{method:'POST'})).status,409);
  });
  test(`${target}: history and stream serialize real packet envelopes through current handlers`,async t=>{
    const {app,fixture}=application(target); fixture.packets.push({time:new Date('2026-01-02T00:00:00Z'),domain:ids.domain,packet:Buffer.from([0,1,1,1,0,42]),meta:{id:254,node:1,channel:1,param:1,msgType:0}});
    const agent=(await serve(t,app))(); await agent.login();
    const history=await agent.request(`/api/domains/${ids.domain}/messages?since=2026-01-01T00:00:00Z`); assert.equal(history.status,200); assert.equal(history.json().count,1); assert.deepEqual(history.json().data[0].packet,{type:'Buffer',data:[0,1,1,1,0,42]});
    const stream=(await agent.request(`/api/domains/${ids.domain}/stream?since=2026-01-01T00:00:00Z`)).json(); assert.equal(stream.type,'messages'); assert.equal(stream.count,1);
  });
  test(`${target}: machine ingress credentials and forwarding identity stay separate from sessions`,async t=>{
    const {app,fixture}=application(target); const agent=(await serve(t,app))();
    const body={packet:'AAEBAQAq',id:254,node:1,channel:1,param:1,msgType:0,domain:ids.domain,apiKey:'wrong'};
    const post=()=>agent.request('/addPacket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post()).status,401); body.apiKey='fixture-key'; const r=await post(); assert.equal(r.status,201); assert.equal(r.text,'Packet saved');
    assert.equal(fixture.packets[0].meta.id,254); assert.equal(fixture.packets[0].meta.node,1); assert.equal(fixture.domains.get(ids.domain).stats.packetCount,1);
    assert.equal((await agent.request('/api/user')).status,302);
  });
  test(`${target}: send mismatch and logging-only success are characterized, not implemented delivery`,async t=>{
    const {app,fixture}=application(target); const agent=(await serve(t,app))(); await agent.login(); const before=fixture.writes.length;
    const post=body=>agent.request('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post({node:1,channel:1,param:1,values:[1]})).status,400);
    const r=await post({addr:'1>1.1',msgType:0,values:[1]}); assert.equal(r.status,200); assert.equal(r.json().message,'Message queued for sending'); assert.equal(fixture.writes.length,before);
  });
  test(`${target}: unknown APIs, private deep links and normal errors are not rewritten to the UI shell`,async t=>{
    const {app}=application(target); const agent=(await serve(t,app))(); await agent.login();
    assert.equal((await agent.request('/api/missing')).status,404);
    assert.equal((await agent.request('/private/not-a-supported-route')).status,404);
    const cast=await agent.request('/api/domains/cast-error'); assert.equal(cast.status,400); assert.equal(cast.json().message,'Invalid ID format');
    const error=await agent.request('/api/domains/server-error'); assert.equal(error.status,500); assert.equal(error.json().message,'Internal server error');
  });
  test(`${target}: domain creation/update/key/invite rotation/deletion remain on actual handlers`,async t=>{
    const {app,fixture}=application(target); const agent=(await serve(t,app))(); await agent.login();
    const jsonRequest=(url,method,body)=>agent.request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const created=await jsonRequest('/api/domains','POST',{name:'New domain',ignored:'stripped'});
    assert.equal(created.status,201); const domain=created.json().data; assert.equal(domain.name,'New domain'); assert.equal(domain.ignored,undefined);
    assert.equal((await jsonRequest('/api/domains','POST',{name:'New domain'})).status,409);
    const renamed=await jsonRequest(`/api/domains/${domain._id}`,'PUT',{name:'Renamed domain'}); assert.equal(renamed.status,200); assert.equal(renamed.json().data.name,'Renamed domain');
    const key=await agent.request(`/api/domains/${domain._id}/regenerate-key`,{method:'POST'}); assert.equal(key.status,200); assert.match(key.json().data.apiKey,/^[a-f0-9]{64}$/);
    const invite=await agent.request(`/api/domains/${domain._id}/regenerate-invite`,{method:'POST'}); assert.equal(invite.status,200); assert.match(invite.json().data.inviteToken,/^[a-f0-9]{32}$/);
    assert.equal((await agent.request(`/api/domains/${domain._id}`,{method:'DELETE'})).status,200);
    assert.equal(fixture.domains.has(domain._id),false);
    assert.equal(fixture.users.get(ids.member).domains.some(id=>String(id)===domain._id),false);
  });
  test(`${target}: stream timeout and non-member machine-key boundaries retain existing behavior`,async t=>{
    const {app}=application(target); const agent=(await serve(t,app))(); await agent.login();
    const response=await agent.request(`/api/domains/${ids.domain}/stream?timeout=1`);
    assert.equal(response.status,200); assert.equal(response.json().type,'timeout'); assert.equal(response.json().count,0);
    const outsider=(await serve(t,application(target).app))(); await outsider.login('outsider');
    for(const endpoint of [`/api/domains/${ids.domain}/messages`,`/api/domains/${ids.domain}/stream`]) assert.equal((await outsider.request(endpoint)).status,403);
    for(const endpoint of [`/api/domains/${ids.domain}/regenerate-key`,`/api/domains/${ids.domain}/regenerate-invite`]) assert.equal((await outsider.request(endpoint,{method:'POST'})).status,403);
  });

  test(`${target}: legacy domain-list reads still backfill missing metadata`,async t=>{
    const {app,fixture}=application(target); const domain=fixture.domains.get(ids.domain);
    delete domain.apiKey; delete domain.inviteToken; delete domain.createdBy; delete domain.createdAt;
    const agent=(await serve(t,app))(); await agent.login();
    const response=await agent.request('/api/domains'); assert.equal(response.status,200);
    const data=response.json().data[0]; assert.match(data.apiKey,/^[a-f0-9]{64}$/); assert.match(data.inviteToken,/^[a-f0-9]{32}$/);
    assert.ok(data.createdAt); assert.equal(String(domain.createdBy),ids.member);
    assert.ok(fixture.writes.includes('domain.update'));
  });

}
