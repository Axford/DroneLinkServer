import assert from 'node:assert/strict';
import test from 'node:test';
import createCatalogue from '../workbench-catalogue.mjs';

const route = { nextHop: 11, directHelloAddress: '192.168.1.22' };
const mesh = { fileRoute: () => ({ assertAvailable: () => route }) };
const release = { status: { identity: 'fixture' }, assets: new Map([
  ['firmware.ver', Buffer.from('123abcd')],
  ['moduleInfo.json', Buffer.from(JSON.stringify({ NMEA: { description: ['GPS'] }, Nav: {}, Drone: {} }))],
]) };
const reply = (override = {}) => Response.json({ schemaVersion: 1, node: 11, build: '123abcd', types: ['NMEA', 'Nav', 'Probe'], ...override });

test('joins release metadata and live factory evidence without equating a marker with identity', async () => {
  let data = reply();
  const catalogue = createCatalogue(mesh, release, async (url, options) => {
    assert.equal(url, 'http://192.168.1.22/supportedModules');
    assert.equal(options.redirect, 'error');
    return data;
  });
  const result = await catalogue('11', 'wifi');
  assert.equal(result.metadataStatus, 'marker-match');
  assert.equal(result.release, 'fixture');
  assert.deepEqual(Object.fromEntries(result.entries.map(entry => [entry.type, entry.support])),
    { Drone: 'unsupported', Nav: 'supported', NMEA: 'supported', Probe: 'supported' });
  data = reply({ build: '456abcd' });
  assert.equal((await catalogue('11', 'wifi')).metadataStatus, 'different-build');
  data = reply({ node: 12 });
  assert.equal((await catalogue('11', 'wifi')).supportKnown, false);
  data = reply({ types: ['NMEA', 'NMEA'] });
  assert.equal((await catalogue('11', 'wifi')).supportKnown, false);
  data = new Response('x'.repeat(8193), { headers: { 'content-type': 'application/json' } });
  assert.equal((await catalogue('11', 'wifi')).supportKnown, false);
});

test('uses only a direct LAN Wi-Fi route and rejects a route that changes during the read', async () => {
  let current = { ...route };
  let requests = 0;
  const catalogue = createCatalogue({ fileRoute: () => ({ assertAvailable: () => current }) }, release, async () => {
    requests++;
    current = { ...route, nextHop: 12 };
    return reply();
  });
  assert.equal((await catalogue('11', 'serial')).supportKnown, false);
  for (const address of ['127.0.0.1', '8.8.8.8', '192.168.1.22:80']) {
    current.directHelloAddress = address;
    assert.equal((await catalogue('11', 'wifi')).supportKnown, false);
  }
  assert.equal(requests, 0);
  current = { ...route };
  assert.equal((await catalogue('11', 'wifi')).supportKnown, false);
  assert.equal((await catalogue('11', 'wifi')).supportKnown, false);
  assert.equal(requests, 1);
  await assert.rejects(catalogue('255', 'wifi'), { status: 400 });
});

test('projects inherited startup keys and examples without treating telemetry as settings', async () => {
  const catalogue = createCatalogue(mesh, { status: {}, assets: new Map([
    ['moduleInfo.json', Buffer.from(JSON.stringify({
      Drone: { pub: [{ name: 'interval', type: 'u32', writeable: true }] },
      NMEA: {
        inherits: ['Drone'],
        default: [{ param: 'interval', values: ['1000'] }],
        config: ['[NMEA=7]\n  port=2'],
        pub: [{ name: 'location', type: 'f', numValues: 3, writeable: false }],
        sub: [{ name: 'correction', type: 'f', numValues: 3 }],
      },
    }))],
  ]) }, async () => reply());
  const { settings } = (await catalogue('11', 'wifi')).entries.find(entry => entry.type === 'NMEA');
  const values = Object.fromEntries(settings.map(({ name, value }) => [name, value]));
  assert.equal(values.interval, '1000');
  assert.equal(values.port, '2');
  assert.equal(values.correction, '0, 0, 0');
  assert.equal(values.$correction, '@>GPS.location');
  assert.equal(values.location, undefined);
  assert.match(values.publish, /location/);
});
