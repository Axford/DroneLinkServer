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

test('shared design assets are served from the selected Client artifact without exposing private routes', async () => {
    const fs = require('node:fs/promises'); const os = require('node:os'); const path = require('node:path');
    const express = require('express'); const { mountClientHosting } = require('../../lib/clientHosting');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dw-design-assets-'));
    const app = express(); const server = http.createServer(app);
    try {
        await fs.mkdir(path.join(directory, 'static')); await fs.writeFile(path.join(directory, 'index.html'), '<main>Private</main>');
        await fs.writeFile(path.join(directory, 'design-tokens.css'), ':root { --dw-font-size-base: 14px; }');
        await fs.writeFile(path.join(directory, 'design-system.css'), 'body { color: var(--dw-color-text); }');
        mountClientHosting(app, { clientBuildDir: directory, ensureAuthenticated: (req, res) => res.sendStatus(401) });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        for (const name of ['design-tokens.css', 'design-system.css']) {
            const response = await fetch(`${origin}/${name}`); assert.equal(response.status, 200);
            assert.match(response.headers.get('content-type'), /text\/css/);
            assert.equal(await response.text(), await fs.readFile(path.join(directory, name), 'utf8'));
        }
        assert.equal((await fetch(origin + '/private/')).status, 401);
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
});
