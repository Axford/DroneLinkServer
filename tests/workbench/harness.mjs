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

export async function launch(build, port, udpPort) {
  port ??= await availablePort(net.createServer().listen(0, '127.0.0.1'));
  udpPort ??= await availablePort(dgram.createSocket('udp4').bind(0, '127.0.0.1'));
  const processHandle = fork(fileURLToPath(new URL('../../workbench.mjs', import.meta.url)), [
    '--client-build', build, '--node-address', '254', '--port', String(port),
  ], {
    execArgv: ['--import', fileURLToPath(new URL('./loopback-udp.mjs', import.meta.url))],
    env: { ...process.env, WB_TEST_UDP_PORT: String(udpPort) },
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
  return {
    processHandle, origin, port, udpPort, ready, exited,
    async close() {
      processHandle.kill('SIGTERM');
      await exited;
    },
  };
}

export async function sendMesh(gateway, type, payload, destination = 254) {
  const socket = dgram.createSocket('udp4');
  const packet = new Mesh.DroneMeshMsg();
  packet.txNode = 11;
  packet.srcNode = 11;
  packet.nextNode = destination;
  packet.destNode = destination;
  packet.seq = 1;
  packet.setPayloadType(type);
  packet.setPayloadSize(payload.length);
  packet.uint8_tPayload.set(payload);
  try {
    await new Promise((resolve, reject) => socket.send(packet.encode(), gateway.udpPort, '127.0.0.1', error => error ? reject(error) : resolve()));
  } finally {
    socket.close();
  }
}

export const hello = gateway => sendMesh(gateway, Mesh.DRONE_MESH_MSG_TYPE_HELLO, [1, 1, 0, 0, 0], 0);
export const publication = (gateway, payload, destination) => sendMesh(gateway, Mesh.DRONE_MESH_MSG_TYPE_DRONELINKMSG, payload, destination);
