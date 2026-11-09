'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, domain } = require('./support.cjs');
const packet = hex => Buffer.from(hex, 'hex');
const originals = [packet('000b04080009'), packet('0c0c050a42414243')];
const packed = packets => Buffer.concat(packets).toString('base64');
async function setup(context, name = 'Packed telemetry') {
    const admin = await context.agent('admin');
    const fleet = await domain(admin, name);
    const path = '/api/domains/' + fleet._id;
    const key = (await admin.request(path + '/key')).json().data.apiKey;
    const machine = context.factories[0]();
    const body = { domain: fleet._id, id: 254, apiKey: key, packets: packed(originals) };
    const post = (input = body, headers = {}) => machine.request('/addPackets', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof input === 'string' ? input : JSON.stringify(input) });
    return { admin, fleet, path, key, machine, body, post };
}
test('packed value/NAME peer observations admit through the real native store without a browser session', t => fixture(t, async context => {
    const { post, machine, admin, path, body } = await setup(context);
    const originalGet = context.one.sessions.get; let sessionReads = 0;
    context.one.sessions.get = async (...args) => { ++sessionReads; return originalGet(...args); };
    let response;
    const bytes = [...originals, packet('000b0408504e')];
    try { response = await post({ ...body, packets: packed(bytes) }, { Cookie: admin.cookie }); }
    finally { context.one.sessions.get = originalGet; }
    assert.equal(sessionReads, 0);
    assert.equal(response.status, 202, response.text);
    assert.deepEqual(response.json(), { received: 3, admitted: 3, complete: true });
    assert.equal(machine.cookie, '');
    const identities = (await admin.request(path + '/identities')).json().data;
    assert.deepEqual(identities.nodes.map(node => node.address).sort(), [11, 12]);
    assert.equal(identities.nodes.some(node => node.address === 254), false);
    const rows = await eventually(() => history(admin, path), rows => rows.length === 3);
    assert.deepEqual(rows.map(row => row.packet).sort(), bytes.map(raw => raw.toString('base64')).sort());
    assert.equal(new Set(rows.map(row => row._id)).size, 3);
    for (const row of rows) { assert.equal(row.meta.id, 254); assert.deepEqual(row.origin, { kind: 'http' }); }
    assert.deepEqual(rows.find(row => row.meta.node === 12).meta, { id: 254, node: 12, channel: 5, param: 10, msgType: 4, source: 12 });
    const state = await eventually(() => snapshot(admin, path), state => state.channels.length === 2);
    const local = state.channels.find(channel => channel.nodeAddress === 11);
    assert.equal(local.params['8'].value.payload, 'CQ=='); assert.equal(local.params['8'].name.payload, 'Tg==');
    assert.equal(local.params['8'].value.origin.kind, 'http');
}, { observations: true }));

async function eventually(read, accept) {
    const until = Date.now() + 5000;
    while (true) {
        const value = await read();
        if (accept(value)) return value;
        assert.ok(Date.now() < until, 'native buffered result did not become visible');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}
const history = (admin, path) => admin.request(path + '/messages', { headers: { 'X-Observation-Contract': '1' } }).then(response => { assert.equal(response.status, 200); return response.json().data; });
const snapshot = (admin, path) => admin.request(path + '/observations').then(response => response.json().data);

test('packed boundaries validate the entire report before identity, observation or history mutation', t => fixture(t, async context => {
    const { post, body, admin, path } = await setup(context);
    const value = originals[0];
    const malformed = [
        {}, { ...body, id: 0 }, { ...body, id: '254' }, { ...body, id: 255 }, { ...body, domain: 'bad/id' },
        { ...body, domain: '__reserved__' }, { ...body, domain: 'é'.repeat(101) }, { ...body, apiKey: 'é'.repeat(257) },
        { ...body, packet: value.toString('base64') }, { ...body, node: 11 }, { ...body, packets: [] },
        ...['', body.packets + '\n', body.packets + '=', body.packets.slice(0, -1), 'not-base64', Buffer.alloc(673).toString('base64')].map(packets => ({ ...body, packets })),
        ...[
            [value, packet('000c050a')], // incomplete final header
            [value, packet('000c050a03010203')], // declared four-byte length but truncated
            [value, packet('000c050a2001')], // misaligned uint32
            [value, packet('000c050a6001')], // NAMEQUERY, never a packed publication
            [value, packet('020c050a0001')], // cross-source request
            [value, packet('00ff050a0001')], [value, packet('000c000a0001')], [value, packet('000c05000001')],
            [value, value], [value, packet('000b04082001')], // duplicate value facet, even with another wire type
            Array.from({ length: 33 }, (_, i) => Buffer.from([0, 11, 4, i + 1, 0, i]))
        ].map(packets => ({ ...body, packets: packed(packets) }))
    ];
    for (const input of malformed) {
        const response = await post(input);
        assert.equal(response.status, 400, JSON.stringify(input));
        assert.equal(response.headers.get('set-cookie'), null);
    }
    assert.deepEqual((await admin.request(path + '/identities')).json().data, { nodes: [], drones: [] });
    assert.deepEqual((await snapshot(admin, path)).channels, []);
    assert.equal((await history(admin, path)).length, 0);
    const maxPackets = Array.from({ length: 32 }, (_, i) => Buffer.from([0, 11, 4, i + 1, 0x4f, ...Array(16).fill(i)]));
    const maximum = await post({ ...body, packets: packed(maxPackets) });
    assert.equal(maximum.status, 202, maximum.text);
    assert.deepEqual(maximum.json(), { received: 32, admitted: 32, complete: true });
    const rows = await eventually(() => history(admin, path), rows => rows.length === 32);
    assert.deepEqual(rows.map(row => row.packet).sort(), maxPackets.map(bytes => bytes.toString('base64')).sort());
}, { observations: true }));

function chunkedRequest(origin, body, headers = {}) {
    const http = require('node:http');
    return new Promise((resolve, reject) => {
        const request = http.request(origin + '/addPackets', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, response => {
            const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString(), headers: response.headers }));
        });
        request.on('error', reject);
        for (let offset = 0; offset < body.length; offset += 97) request.write(body.subarray(offset, offset + 97));
        request.end();
    });
}
test('packed parser enforces 4096 wire bytes for fixed/chunked requests before global JSON parsing', t => fixture(t, async context => {
    const { post, machine, body, admin, path } = await setup(context);
    const serialized = JSON.stringify(body);
    const exact = serialized.padEnd(4096, ' ');
    assert.equal((await post(exact)).status, 202);
    assert.equal((await post(exact + ' ')).status, 400);
    const streamed = await chunkedRequest(machine.origin, Buffer.from(exact));
    assert.equal(streamed.status, 202, streamed.text);
    assert.equal((await chunkedRequest(machine.origin, Buffer.from(exact + ' '))).status, 400);
    assert.equal((await post('{"apiKey":"DO-NOT-ECHO"')).status, 400);
    const compressed = require('node:zlib').gzipSync(Buffer.from(serialized.padEnd(100000, ' ')));
    assert.equal((await chunkedRequest(machine.origin, compressed, { 'Content-Encoding': 'gzip' })).status, 400);
    for (const url of ['/ADDPACKETS', '/addPackets/']) {
        const response = await machine.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: exact + ' ' });
        assert.equal(response.status, 400);
        assert.equal(response.headers.get('set-cookie'), null);
    }
    const rows = await eventually(() => history(admin, path), rows => rows.length === 4);
    assert.equal(new Set(rows.map(row => row._id)).size, 4);
}, { observations: true }));

test('initial credentials, archive, isolation and machine/human boundaries retain existing errors', t => fixture(t, async context => {
    const { post, body, admin, path, key, fleet } = await setup(context);
    assert.equal((await post({ ...body, apiKey: 'wrong-key' })).status, 401);
    assert.equal((await post({ ...body, domain: 'missing-domain' })).status, 404);
    assert.equal((await post(body, { Authorization: 'Bearer ignored.credential' })).status, 401);
    assert.equal((await post(body, { Authorization: 'Basic ignored' })).status, 401);
    const machine = context.factories[0]();
    assert.equal((await machine.request(path + '/key', { headers: { Authorization: 'Bearer ' + key } })).status, 401);
    assert.deepEqual((await admin.request(path + '/identities')).json().data.nodes, []);
    let row = (await admin.request(path)).json().data;
    await admin.mutate(path + '/archive', { revision: row.revision });
    const archived = await post(); assert.equal(archived.status, 409); assert.equal(archived.json().code, 'domain-archived');
    row = (await admin.request(path)).json().data; await admin.mutate(path + '/restore', { revision: row.revision });
    assert.equal((await post()).status, 202);
    const firstIdentity = (await admin.request(path + '/identities')).json().data.nodes[0].droneId;
    const other = await setup(context, 'Isolated peer addresses');
    assert.equal((await other.post()).status, 202);
    assert.notEqual((await other.admin.request(other.path + '/identities')).json().data.nodes[0].droneId, firstIdentity);
    assert.equal((await post({ ...body, domain: other.fleet._id })).status, 401);
    row = (await admin.request(path)).json().data;
    const changed = await admin.mutate(path + '/regenerate-key', { revision: row.revision });
    assert.equal(changed.status, 200, changed.text);
    assert.equal((await post()).status, 401);
    const newKey = (await admin.request(path + '/key')).json().data.apiKey;
    assert.equal((await post({ ...body, apiKey: newKey })).status, 202);
    assert.equal((await admin.request(path + '/identities')).json().data.nodes[0].droneId, firstIdentity);
    // Existing single-packet publications/requests and error/text responses remain compatible.
    const single = await machine.request('/addPacket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: fleet._id, apiKey: newKey, id: 254, packet: '/gcBAWAA' }) });
    assert.equal(single.status, 202); assert.equal(single.text, 'Packet received');
    assert.equal((await admin.request(path + '/identities')).json().data.nodes.some(node => node.address === 7), false);
}, { observations: true }));

test('native admission failures return only the complete prefix and preserve already-caused side effects', t => fixture(t, async context => {
    const stages = [
        ['identity', context.one.telemetry, 'admit', input => input.nodeAddress === 12, false],
        ['observation', context.one.observations, 'enqueue', input => input.ticket.nodeAddress === 12, true],
        ['history', context.one.packets, 'enqueue', input => input.meta.node === 12, true]
    ];
    for (const [stage, owner, method, selected, failAfter] of stages) {
        const { post, body, admin, path } = await setup(context, 'Partial ' + stage);
        const original = owner[method];
        owner[method] = async input => {
            if (!selected(input)) return original(input);
            if (failAfter) await original(input);
            throw Object.assign(new Error('DO-NOT-ECHO:' + body.apiKey), { code: 'unavailable' });
        };
        let result;
        try { result = await post({ ...body, packets: packed([...originals, packet('000d06010005')]) }); }
        finally { owner[method] = original; }
        assert.equal(result.status, 503, result.text);
        assert.deepEqual(result.json(), { received: 3, admitted: 1, complete: false, code: 'admission-incomplete' });
        assert.ok(!result.text.includes(body.apiKey) && !result.text.includes('DO-NOT-ECHO'));
        const identities = (await admin.request(path + '/identities')).json().data;
        assert.deepEqual(identities.nodes.map(node => node.address).sort(), stage === 'identity' ? [11] : [11, 12]);
        const rows = await eventually(() => history(admin, path), rows => rows.length === (stage === 'history' ? 2 : 1));
        assert.equal(rows.some(row => row.meta.node === 13), false);
        if (stage !== 'identity') {
            const observed = await eventually(() => snapshot(admin, path), state => state.channels.some(channel => channel.nodeAddress === 12));
            assert.equal(observed.channels.find(channel => channel.nodeAddress === 12).params['10'].value.payload, 'QUJD');
        }
    }
}, { observations: true }));

test('key rotation during a batch is rechecked, whereas preflight errors have no fabricated prefix', t => fixture(t, async context => {
    const { post, body, admin, path } = await setup(context);
    const original = context.one.packets.enqueue;
    let rotated = false;
    context.one.packets.enqueue = async input => {
        const result = await original(input);
        if (!rotated) {
            rotated = true;
            const row = (await admin.request(path)).json().data;
            assert.equal((await admin.mutate(path + '/regenerate-key', { revision: row.revision })).status, 200);
        }
        return result;
    };
    try {
        const result = await post();
        assert.equal(result.status, 503, result.text);
        assert.deepEqual(result.json(), { received: 2, admitted: 1, complete: false, code: 'admission-incomplete' });
    } finally { context.one.packets.enqueue = original; }
    const next = await post(); assert.equal(next.status, 401); assert.equal(Object.hasOwn(next.json(), 'admitted'), false);
    const identities = (await admin.request(path + '/identities')).json().data;
    assert.deepEqual(identities.nodes.map(node => node.address), [11]);
}, { observations: true }));

test('packed ingress remains unavailable in maintenance without discovering any node', t => fixture(t, async context => {
    const result = await context.factories[0]().request('/addPackets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: 'missing', id: 254, apiKey: 'fixture', packets: packed(originals) }) });
    assert.equal(result.status, 503); assert.equal(Object.hasOwn(result.json(), 'admitted'), false);
}, { ready: false, observations: true }));

const nodeDir = process.env.DRONELINK_NODE_DIR;
async function compileProducer(t) {
    const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
    const { promisify } = require('node:util'); const run = promisify(require('node:child_process').execFile);
    const manifest = require('./fixtures/packed-producer.json');
    for (const [name, expected] of Object.entries(manifest.files)) {
        assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(nodeDir, name))).digest('hex'), expected, `G.1 producer source drift: ${name}; review the fixture provenance`);
    }
    const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'packed-producer-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const executable = path.join(directory, 'producer');
    await run(process.env.CXX || 'c++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', '-fsanitize=address,undefined', '-I', path.join(nodeDir, 'src'), path.join(__dirname, 'fixtures/packed-producer.cpp'), '-o', executable]);
    return async ({ machine, body }) => {
        const child = require('node:child_process').spawn(executable, [new URL(machine.origin).port], { stdio: ['pipe', 'pipe', 'pipe'] });
        const chunks = [], errors = [];
        child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => errors.push(chunk));
        const result = new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', code => code === 0 ? resolve(JSON.parse(Buffer.concat(chunks).toString())) : reject(Error('Producer harness failed: ' + Buffer.concat(errors).toString())));
        });
        const deadline = setTimeout(() => child.kill(), 10000);
        try { child.stdin.end(body.domain + '\n' + body.apiKey + '\n'); return await result; }
        finally { clearTimeout(deadline); }
    };
}
test('actual G.1 sender emits native-compatible packed requests and does not replay partial/lost outcomes', { skip: !nodeDir }, t => fixture(t, async context => {
    const producer = await compileProducer(t);
    for (const mode of ['complete', 'partial', 'lost']) {
        const state = await setup(context, 'Actual producer ' + mode);
        const original = context.one.packets.enqueue;
        let calls = 0;
        let released;
        const admitted = new Promise(resolve => { released = resolve; });
        context.one.packets.enqueue = async input => {
            const result = await original(input); ++calls;
            if (mode === 'lost' && calls === 1) state.machine.server.closeAllConnections();
            if (calls === 2) {
                released();
                if (mode === 'partial') throw Object.assign(Error('injected after native history admission'), { code: 'unavailable' });
            }
            return result;
        };
        let result;
        try {
            result = await producer(state);
            await Promise.race([admitted, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('producer admission did not finish')), 5000); timer.unref(); })]);
        } finally { context.one.packets.enqueue = original; }
        assert.equal(result.repeat, false);
        assert.equal(result.complete, mode === 'complete');
        assert.equal(result.status, mode === 'complete' ? 202 : mode === 'partial' ? 503 : 0);
        assert.equal(result.admitted, mode === 'complete' ? 2 : mode === 'partial' ? 1 : -1);
        assert.equal(calls, 2);
        const rows = await eventually(() => history(state.admin, state.path), rows => rows.length === 2);
        assert.deepEqual(rows.map(row => row.packet).sort(), originals.map(bytes => bytes.toString('base64')).sort());
        assert.ok(rows.every(row => row.meta.id === 254 && row.origin.kind === 'http'));
    }
}, { observations: true }));
