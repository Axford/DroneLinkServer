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
globalThis.fetch = (url, options) => String(url) === 'http://192.168.50.11/supportedModules'
  ? Promise.resolve(Response.json({ schemaVersion: 1, node: 11, build, types: ['Management', 'NMEA', 'Nav', 'Probe'] }))
  : realFetch(url, options);
