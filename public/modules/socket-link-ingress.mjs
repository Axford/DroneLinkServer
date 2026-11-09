import { DroneLinkMsg, ProtocolValidationError } from './droneLinkMsg.mjs';

// Own the browser-to-gateway packet boundary; programming errors still propagate.
export function registerSocketLinkIngress(socket, manager, sourceId) {
  socket.on('sendMsg', bytes => {
    let msg;
    try { msg = new DroneLinkMsg(); msg.parse(bytes); }
    catch (error) {
      if (!(error instanceof ProtocolValidationError)) throw error;
      manager.rejectedBrowserMessages = (manager.rejectedBrowserMessages ?? 0) + 1;
      socket.emit('packet.rejected', { code: error.code });
      return;
    }
    if (msg.node !== sourceId) manager.sendDroneLinkMessage(msg);
  });
}
