// Keep the actual UDP adapter and decoder on a disposable loopback port.
import dgram from 'node:dgram';
import { ServerResponse } from 'node:http';

const createSocket = dgram.createSocket;
dgram.createSocket = function (...args) {
  const socket = createSocket.apply(this, args);
  const bind = socket.bind.bind(socket);
  const send = socket.send.bind(socket);
  const peer = Number(process.env.WB_TEST_PEER_PORT || process.env.WB_TEST_UDP_PORT);
  socket.bind = (_port, callback) => bind(Number(process.env.WB_TEST_UDP_PORT), '127.0.0.1', callback);
  socket.send = (message, _port, _host, callback) => send(message, peer, '127.0.0.1', callback);
  return socket;
};

const now = Date.now;
let offset = 0;
Date.now = () => now() + offset;
process.on('message', message => {
  if (message === 'expire routes') offset += 61_000;
  if (message === 'restore clock') offset = 0;
});
process.channel?.unref();

// Simulate a full write buffer after a test subscriber has received its snapshot.
const write = ServerResponse.prototype.write;
ServerResponse.prototype.write = function (frame, ...args) {
  if (this.req.headers['x-workbench-test-stalled'] === 'yes' && frame.startsWith('event: route')) return false;
  return write.call(this, frame, ...args);
};
