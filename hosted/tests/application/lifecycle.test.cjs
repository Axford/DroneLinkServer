const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startHosted } = require('../../index');
const { testConfig } = require('./support.cjs');

const simpleApp=()=>((req,res)=>res.end('ready'));
test('storage readiness precedes application/listening and failed initialization constructs neither',async t=>{
    const order=[]; let release;
    const ready=new Promise(resolve=>{release=resolve;});
    const store={access:{getControl:async()=>null},close:async()=>{order.push('close');}};
    const pending=startHosted({config:testConfig(),storeFactory:async()=>{order.push('open');await ready;order.push('ready');return store;},appFactory:()=>{order.push('app');return simpleApp();}});
    await new Promise(resolve=>setImmediate(resolve)); assert.deepEqual(order,['open']);
    release(); const service=await pending; t.after(()=>service.close());
    assert.deepEqual(order,['open','ready','app']); assert.ok(service.server.listening);
    await service.close(); await service.close(); assert.equal(order.at(-1),'close');
    let constructed=false;
    await assert.rejects(startHosted({config:testConfig(),storeFactory:async()=>{throw Error('unavailable');},appFactory:()=>{constructed=true;}}));
    assert.equal(constructed,false);
});
test('invalid artifact is rejected before storage allocation',async()=>{
    let opened=false;
    await assert.rejects(startHosted({config:testConfig({clientBuildDir:'nonexistent-artifact'}),storeFactory:async()=>{opened=true;}}),/clientBuildDir/);
    assert.equal(opened,false);
});
test('application/listener startup failures release the owned store',async t=>{
    let closes=0; const storeFactory=async()=>({access:{getControl:async()=>null},close:async()=>{closes++;}});
    await assert.rejects(startHosted({config:testConfig(),storeFactory,appFactory:()=>{throw Error('construction');}}),/construction/);
    const occupied=http.createServer(); await new Promise(resolve=>occupied.listen(0,resolve));
    t.after(()=>new Promise(resolve=>occupied.close(resolve)));
    await assert.rejects(startHosted({config:testConfig({port:occupied.address().port}),storeFactory,appFactory:simpleApp}),error=>error.code==='EADDRINUSE');
    assert.equal(closes,2);
});
test('shutdown drains up to its grace deadline then releases HTTP and storage',async()=>{
    let reached; const received=new Promise(resolve=>{reached=resolve;}); let closed=false;
    const service=await startHosted({config:testConfig(),storeFactory:async()=>({access:{getControl:async()=>null},close:async()=>{closed=true;}}),appFactory:()=>((req,res)=>{reached();}),shutdownGraceMs:25});
    const request=http.get(`http://127.0.0.1:${service.server.address().port}`); request.on('error',()=>{});
    try { await received; await service.close(); assert.equal(service.server.listening,false); assert.equal(closed,true); }
    finally { request.destroy(); await service.close(); }
});


test('C startup normalizes the same activation contract for storage and HTTP even without a config epoch', async () => {
    let storageEpoch, appEpoch;
    const service = await startHosted({ config: testConfig(), storeFactory: async options => { storageEpoch = options.observationEpoch; return { access: { getControl: async () => null }, close: async () => {} }; }, appFactory: options => { appEpoch = options.config.observationEpoch; return simpleApp(); } });
    try { assert.equal(storageEpoch, 'm1-c-1'); assert.equal(appEpoch, storageEpoch); } finally { await service.close(); }
    await assert.rejects(startHosted({ config: testConfig({ observationEpoch: 'unknown' }) }), { code: 'observation-schema' });
});
