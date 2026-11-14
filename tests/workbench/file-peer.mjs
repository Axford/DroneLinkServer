import dgram from 'node:dgram';
import { once } from 'node:events';
import * as Mesh from '../../public/modules/DroneMeshMsg.mjs';
import * as FS from '../../public/modules/DroneMeshFS.mjs';
import { DroneLinkMsg } from '../../public/modules/droneLinkMsg.mjs';

export async function filePeer() {
  const socket = dgram.createSocket('udp4');
  socket.bind(0, '127.0.0.1');
  await once(socket, 'listening');
  const files = new Map([['/sample.txt', Buffer.from('First line\r\n')], ['/nested/test.txt', Buffer.from('nested\n')]]);
  const actions = [];
  let staging;
  let traceSeq = 80;
  let parameterValue = 42;
  let replyToTrace = true;
  let rejectBlock = false;
  let loseSaveReply = false;
  const paths = () => ['/', '/nested/', ...files.keys()];
  const children = directory => paths().filter(path => path !== directory && path.startsWith(directory) && !path.slice(directory.length).replace(/\/$/, '').includes('/'));

  function send(port, destination, type, payload, ack, seq = ack?.seq ?? 0) {
    const packet = new Mesh.DroneMeshMsg();
    Object.assign(packet, { txNode: 11, srcNode: 11, nextNode: destination, destNode: destination, seq });
    packet.setPayloadType(type);
    packet.setPayloadSize(payload.length);
    if (ack) packet.setPacketType(Mesh.DRONE_MESH_MSG_ACK);
    if (type === Mesh.DRONE_MESH_MSG_TYPE_TRACEROUTE_RESPONSE) packet.typeGuaranteeSize |= Mesh.DRONE_MESH_MSG_GUARANTEED;
    packet.uint8_tPayload.set(payload);
    socket.send(packet.encode(), port, '127.0.0.1');
  }

  socket.on('message', (raw, remote) => {
    const packet = new Mesh.DroneMeshMsg(raw);
    if (!packet.isValid || packet.isAck() || packet.destNode !== 11) return;
    const type = packet.getPayloadType();
    if (packet.isGuaranteed()) send(remote.port, packet.srcNode, type, [0], packet);
    const bytes = new Uint8Array(packet.rawPayload, 0, packet.getPayloadSize());
    const reply = (responseType, response) => send(remote.port, packet.srcNode, responseType, response.encode());
    if (type === Mesh.DRONE_MESH_MSG_TYPE_TRACEROUTE_REQUEST) {
      actions.push('trace');
      if (replyToTrace) {
        // Reply sequence belongs to the responder. The echoed prefix binds the reply to this request.
        send(remote.port, packet.srcNode, Mesh.DRONE_MESH_MSG_TYPE_TRACEROUTE_RESPONSE, [...bytes, 3, 11], undefined, traceSeq++);
      }
    }
    if (type === Mesh.DRONE_MESH_MSG_TYPE_FS_FILE_REQUEST) {
      const request = new FS.DroneMeshFSFileRequest(bytes);
      const path = request.flags === FS.DRONE_MESH_MSG_FS_FLAG_INDEX_INFO ? children(request.path)[request.id] : request.path;
      const response = new FS.DroneMeshFSFileResponse();
      response.flags = FS.DRONE_MESH_MSG_FS_FLAG_NOT_FOUND;
      if (paths().includes(path)) {
        const directory = path.endsWith('/');
        Object.assign(response, { path, id: paths().indexOf(path), size: directory ? children(path).length : files.get(path).length,
          flags: directory ? FS.DRONE_MESH_MSG_FS_FLAG_DIRECTORY : FS.DRONE_MESH_MSG_FS_FLAG_FILE });
      }
      reply(Mesh.DRONE_MESH_MSG_TYPE_FS_FILE_RESPONSE, response);
    }
    if (type === Mesh.DRONE_MESH_MSG_TYPE_FS_READ_REQUEST) {
      const { id, offset } = new FS.DroneMeshFSReadRequest(bytes);
      const response = new FS.DroneMeshFSReadResponse();
      const chunk = files.get(paths()[id])?.subarray(offset, offset + 32) ?? Buffer.alloc(0);
      Object.assign(response, { id, offset, size: chunk.length });
      response.data.set(chunk);
      reply(Mesh.DRONE_MESH_MSG_TYPE_FS_READ_RESPONSE, response);
    }
    if (type === Mesh.DRONE_MESH_MSG_TYPE_FS_MANAGE_REQUEST) {
      const { flags, path, size } = new FS.DroneMeshFSManageRequest(bytes);
      if (flags === FS.DRONE_MESH_MSG_FS_FLAG_START) {
        actions.push('start');
        staging = { path, bytes: Buffer.alloc(size) };
      } else if (flags === FS.DRONE_MESH_MSG_FS_FLAG_SAVE) {
        actions.push('save');
        files.set(staging.path, staging.bytes);
        staging = undefined;
        if (loseSaveReply) return;
      } else if (flags === FS.DRONE_MESH_MSG_FS_FLAG_CANCEL) {
        actions.push('cancel');
        staging = undefined;
      }
      const response = new FS.DroneMeshFSManageResponse();
      response.status = staging ? 1 : 0;
      reply(Mesh.DRONE_MESH_MSG_TYPE_FS_MANAGE_RESPONSE, response);
    }
    if (type === Mesh.DRONE_MESH_MSG_TYPE_FS_WRITE_REQUEST) {
      const { offset, size, data } = new FS.DroneMeshFSWriteRequest(bytes);
      const response = new FS.DroneMeshFSWriteResponse();
      response.offset = offset;
      if (rejectBlock) response.flags = FS.DRONE_MESH_MSG_FS_FLAG_ERROR;
      else staging.bytes.set(data.subarray(0, size), offset);
      actions.push('block');
      reply(Mesh.DRONE_MESH_MSG_TYPE_FS_WRITE_RESPONSE, response);
    }
    if (type === Mesh.DRONE_MESH_MSG_TYPE_DRONELINKMSG) {
      const msg = new DroneLinkMsg(bytes);
      if (msg.channel === 5 && msg.param === 8) {
        if (msg.msgType === 0) {
          parameterValue = msg.valueArray()[0];
          actions.push('parameter-write');
        }
        if (msg.msgType === 7) {
          send(remote.port, packet.srcNode, Mesh.DRONE_MESH_MSG_TYPE_DRONELINKMSG,
            [11, 11, 5, 8, 128, parameterValue], undefined, traceSeq++);
        }
      }
      if (msg.msgType === 7 && msg.node === 11 && msg.channel === 1 && msg.param === 13) actions.push('query');
      if (msg.node === 11 && msg.channel === 1 && msg.param === 10 && msg.valueArray()[0] === 1) actions.push('restart');
    }
  });
  return {
    port: socket.address().port, files, actions,
    suppressTraceReply() { replyToTrace = false; },
    rejectBlock() { rejectBlock = true; },
    loseSaveReply() { loseSaveReply = true; },
    hello(gateway) { send(gateway.udpPort, 0, Mesh.DRONE_MESH_MSG_TYPE_HELLO, [1, 1, 0, 0, 0]); },
    close() { socket.close(); },
  };
}
