// A simulated node shares the UDP fixture and answers the device HTTP request.
import dgram from 'node:dgram';

const createSocket = dgram.createSocket;
dgram.createSocket = function (...args) {
  const socket = createSocket.apply(this, args);
  const emit = socket.emit;
  socket.emit = function (event, ...values) {
    if (event === 'message') values[1] = { ...values[1], address: '192.168.50.11' };
    return emit.call(this, event, ...values);
  };
  return socket;
};
let build = 'c017040';
process.on('message', message => {
  if (message === 'different catalogue build') build = '456abcd';
});
const realFetch = globalThis.fetch;
let diagnostic;
let job = 40;
globalThis.fetch = (url, options) => {
  const target = new URL(url);
  if (target.origin !== 'http://192.168.50.11') return realFetch(url, options);
  if (target.pathname === '/supportedModules') {
    return Promise.resolve(Response.json({ schemaVersion: 1, node: 11, build, types: ['Management', 'NMEA', 'Nav', 'Probe', 'INA219', 'INA3221'] }));
  }
  if (target.pathname !== '/i2cDiagnostic') return realFetch(url, options);
  if (options.method === 'POST') {
    const get = name => Number(target.searchParams.get(name));
    job++;
    diagnostic = target.searchParams.get('op') === 'scan' ? {
      multiplexer: 0x77,
      channels: Array.from({ length: 8 }, (_, channel) => ({
        channel, status: channel === 3 ? 'selection-failed' : 'complete',
        addresses: channel === 1 || channel === 5 ? [64] : channel === 2 ? [118] : [],
      })),
    } : { channel: get('channel'), address: get('address'), register: get('register'), length: get('length'),
      status: get('channel') === 5 ? 'complete' : 'short-read',
      bytes: get('channel') !== 5 ? [0x32] : get('register') === 0xff ? [0x32, 0x20] : [0x54, 0x49] };
    return Promise.resolve(Response.json({ schemaVersion: 1, node: 11, job }, { status: 202 }));
  }
  return Promise.resolve(Response.json({ schemaVersion: 1, node: 11, job, ...diagnostic }));
};
