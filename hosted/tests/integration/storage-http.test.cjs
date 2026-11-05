const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoClient, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const { legacyModels } = require('../legacy/legacy.cjs');
const { openMongoStore, StorageError } = require('@dronelink/persistence');
const { withMongo } = require('../../tools/mongo.cjs');
const { application, serve } = require('../application/support.cjs');

test('hosted HTTP/session workflows compose with the released real storage adapter', async t => withMongo(async uri => {
    const store = await openMongoStore({ uri: uri + 'http' });
    let client;
    try {
        client = new MongoClient(uri + 'http'); await client.connect();
        const { app } = application('current', { store });
        const agent = (await serve(t, app))();
        const post = (url, method, body) => agent.request(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        await agent.login();
        const user = (await agent.request('/api/user')).json();
        assert.equal(user.email, 'member@example.test'); assert.equal(typeof user._id, 'string');
        assert.equal((await agent.request('/api/user')).json()._id, user._id, 'session deserialization reloads the plain user');
        assert.equal((await post('/api/user/map-state','PUT',{lng:1,lat:2,zoom:3})).status,200);
        const created = await post('/api/domains','POST',{name:'Real domain'});
        assert.equal(created.status,201); const domain=created.json().data;
        assert.equal(domain.users[0]._id,user._id); assert.equal(domain.createdBy.email,user.email);
        assert.equal((await post('/api/domains','POST',{name:'Real domain'})).status,409);
        assert.equal((await agent.request('/api/domains')).json().pagination.total,1);
        assert.equal((await agent.request('/api/domains?search=^real')).json().data[0]._id,domain._id);
        assert.equal((await agent.request(`/api/domains/${domain._id}`)).json().data.name,'Real domain');
        const renamed=await post(`/api/domains/${domain._id}`,'PUT',{name:'Renamed'}); assert.equal(renamed.json().data.name,'Renamed');
        const key=await agent.request(`/api/domains/${domain._id}/regenerate-key`,{method:'POST'}); assert.equal(key.status,200);
        const rotated=key.json().data;
        const ingress={packet:'AAEBAQAq',id:254,node:1,channel:1,param:1,msgType:0,domain:domain._id,apiKey:rotated.apiKey};
        assert.equal((await post('/addPacket','POST',{...ingress,apiKey:'wrong'})).status,401);
        assert.equal((await post('/addPacket','POST',ingress)).status,201);
        const history=await agent.request(`/api/domains/${domain._id}/messages?since=2026-01-01`);
        assert.equal(history.status,200); assert.equal(history.json().data[0].packet,ingress.packet);
        const stream=await agent.request(`/api/domains/${domain._id}/stream?since=2026-01-01`);
        assert.equal(stream.json().type,'messages'); assert.equal(stream.json().data[0].packet,ingress.packet);
        assert.equal((await store.domains.getById(domain._id)).stats.packetCount,1);
        const invite=await agent.request(`/api/domains/${domain._id}/regenerate-invite`,{method:'POST'}); assert.equal(invite.status,200);
        const token=invite.json().data.inviteToken;
        const outsider=(await serve(t,application('current',{store}).app))();
        assert.equal((await outsider.request('/api/invite/'+token)).json().data.domainName,'Renamed');
        await outsider.login('outsider');
        assert.equal((await outsider.request(`/api/domains/${domain._id}`)).status,403);
        assert.equal((await outsider.request('/api/invite/'+token,{method:'POST'})).status,200);
        assert.equal((await outsider.request('/api/invite/'+token,{method:'POST'})).status,409);
        assert.equal((await outsider.request(`/api/domains/${domain._id}`)).status,200);
        const race=await store.domains.create({name:'Race',users:[user._id],createdBy:user._id});
        const originalAdd=store.domains.addMember;
        store.domains.addMember=async(id,memberId)=>{await store.domains.remove(id);return originalAdd(id,memberId);};
        try {
          const raced=await outsider.request('/api/invite/'+race.inviteToken,{method:'POST'});
          assert.equal(raced.status,500);
          const outsiderUser=await store.users.findByGoogleId('outsider-google');
          assert.ok(!outsiderUser.domains.includes(race._id),'failed mutation must not link a deleted domain');
        } finally {store.domains.addMember=originalAdd;}
        await client.db().collection('rxpackets').insertMany([
          {time:new Date('2026-01-03'),domain:new ObjectId(domain._id)},
          {time:new Date('2026-01-03'),domain:new ObjectId(domain._id),packet:null}
        ]);
        const oldPackets=(await agent.request(`/api/domains/${domain._id}/messages?since=2026-01-03`)).json().data;
        assert.ok(oldPackets.some(row=>!Object.hasOwn(row,'packet'))); assert.ok(oldPackets.some(row=>row.packet===null));
        const legacyId=new ObjectId('600000000000000000000004');
        await client.db().collection('domains').insertOne({_id:legacyId,name:'Legacy HTTP',users:[new ObjectId(user._id)]});
        const legacy=(await agent.request('/api/domains?search=Legacy')).json().data[0];
        assert.equal(legacy.createdBy._id,user._id); assert.equal(legacy.apiKey.length,64);
        assert.equal(legacy.createdAt,legacyId.getTimestamp().toISOString());
        assert.ok((await client.db().collection('domains').findOne({_id:legacyId})).apiKey);
        assert.equal((await agent.request('/api/domains/not-an-id')).status,400);
        assert.equal((await agent.request('/api/domains/000000000000000000000099')).status,404);
        assert.equal((await post('/api/domains','POST',{name:''})).status,400);
        // Roll back executable backend code against the same synthetic stored data.
        const rollbackConnection=mongoose.createConnection(uri+'http');
        try {
          await rollbackConnection.asPromise();
          const oldModels=legacyModels(rollbackConnection);
          const original=(await serve(t,application('sep02',{fixture:{models:oldModels}}).app))();
          await original.login();
          const oldDomain=(await original.request(`/api/domains/${domain._id}`)).json().data;
          assert.deepEqual(oldDomain,(await agent.request(`/api/domains/${domain._id}`)).json().data);
          assert.deepEqual((await original.request(`/api/domains/${domain._id}/messages?since=2026-01-01`)).json().data,
            (await agent.request(`/api/domains/${domain._id}/messages?since=2026-01-01`)).json().data);
        } finally {await rollbackConnection.close();}
        assert.equal((await agent.request(`/api/domains/${domain._id}`,{method:'DELETE'})).status,200);
        assert.deepEqual((await store.users.getById(user._id)).domains,[]);
        await agent.request('/auth/logout'); assert.equal((await agent.request('/api/user')).status,302);
    } finally { await Promise.all([store.close(),client?.close()]); }
}));

test('route-local and global neutral storage errors retain the original HTTP mapping', async t => {
    const { modelFixture } = require('../application/support.cjs');
    const { fakeStore } = require('../application/store-fixture.cjs');
    for (const [code,expected,message] of [['validation',400,'Validation failed'],['duplicate',409,'email already exists'],['invalid-id',400,'Invalid ID format'],['unavailable',500,'Internal server error']]) {
        const fixture=modelFixture(); const store=fakeStore(fixture);
        store.domains.getById=async()=>{throw new StorageError(code,{field:'email',issues:[{field:'name',message:'required'}]});};
        const agent=(await serve(t,application('current',{fixture,store}).app))(); await agent.login();
        const response=await agent.request('/api/domains/example/messages');
        assert.equal(response.status,expected); assert.equal(response.json().message,message);
        const ingress=await agent.request('/addPacket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packet:'AA==',id:1,node:1,channel:1,param:1,msgType:0,domain:'example',apiKey:'key'})});
        assert.equal(ingress.status,500); assert.equal(ingress.text,'Error saving packet');
    }
});
