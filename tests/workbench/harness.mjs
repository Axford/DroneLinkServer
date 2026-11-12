import { fork } from 'node:child_process';
import { once } from 'node:events';
import dgram from 'node:dgram';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import * as Mesh from '../../public/modules/DroneMeshMsg.mjs';

async function availablePort(socket) {
  await once(socket, 'listening');
  const port = socket.address().port;
  socket.close();
  await once(socket, 'close');
  return port;
}

export async function launch(build, port, udpPort, { serialMode, serialAddress = 253, peerPort = '' } = {}) {
  port ??= await availablePort(net.createServer().listen(0, '127.0.0.1'));
  udpPort ??= await availablePort(dgram.createSocket('udp4').bind(0, '127.0.0.1'));
  const serialArgs = serialMode ? ['--serial-port', '/test/workbench-serial', ...(serialMode === 'only' ? ['--serial-only'] : ['--serial-address', String(serialAddress)])] : [];
  const execArgv = ['--import', fileURLToPath(new URL('./loopback-udp.mjs', import.meta.url))];
  if (serialMode) execArgv.push('--import', fileURLToPath(new URL('./serial-preload.mjs', import.meta.url)));
  const processHandle = fork(fileURLToPath(new URL('../../workbench.mjs', import.meta.url)), [
    '--client-build', build, '--node-address', '254', '--port', String(port), ...serialArgs,
  ], {
    execArgv,
    env: { ...process.env, WB_TEST_UDP_PORT: String(udpPort), WB_TEST_PEER_PORT: String(peerPort) },
    silent: true,
  });
  let output = '';
  processHandle.stderr.on('data', bytes => { output += bytes; });
  const exited = once(processHandle, 'exit');
  const origin = `http://127.0.0.1:${port}`;
  const ready = new Promise((resolve, reject) => {
    processHandle.stdout.on('data', bytes => {
      output += bytes;
      if (output.includes(`Workbench available at ${origin}/workbench/`)) resolve();
    });
    void exited.then(([code]) => reject(new Error(`Workbench exited with ${code}\n${output}`)));
  });
  void ready.catch(() => {});
  return {
    processHandle, origin, port, udpPort, ready, exited,
    async close() {
      processHandle.kill('SIGTERM');
      await exited;
    },
  };
}

function meshPacket(type, payload, destination) {
  const packet = new Mesh.DroneMeshMsg();
  packet.txNode = 11;
  packet.srcNode = 11;
  packet.nextNode = destination;
  packet.destNode = destination;
  packet.seq = 1;
  packet.setPayloadType(type);
  packet.setPayloadSize(payload.length);
  packet.uint8_tPayload.set(payload);
  return packet.encode();
}

export async function sendMesh(gateway, type, payload, destination = 254) {
  const socket = dgram.createSocket('udp4');
  try {
    await new Promise((resolve, reject) => socket.send(meshPacket(type, payload, destination), gateway.udpPort, '127.0.0.1', error => error ? reject(error) : resolve()));
  } finally {
    socket.close();
  }
}

export const hello = gateway => sendMesh(gateway, Mesh.DRONE_MESH_MSG_TYPE_HELLO, [1, 1, 0, 0, 0], 0);
export const publication = (gateway, payload, destination) => sendMesh(gateway, Mesh.DRONE_MESH_MSG_TYPE_DRONELINKMSG, payload, destination);

export function serialFrame(gateway, bytes) {
  gateway.processHandle.send({ serial: 'data', bytes: [...bytes] });
}

export function serialHello(gateway) {
  serialFrame(gateway, [0xfe, ...meshPacket(Mesh.DRONE_MESH_MSG_TYPE_HELLO, [1, 1, 0, 0, 0], 0)]);
}

export function serialPublication(gateway, payload, destination = 253) {
  serialFrame(gateway, [0xfe, ...meshPacket(Mesh.DRONE_MESH_MSG_TYPE_DRONELINKMSG, payload, destination)]);
}
