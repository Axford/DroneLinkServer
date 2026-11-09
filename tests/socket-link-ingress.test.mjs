import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerSocketLinkIngress } from '../public/modules/socket-link-ingress.mjs';
test('actual socket callback isolates malformed input and keeps valid traffic dispatching',()=>{
 const socket=new EventEmitter(),sent=[],rejected=[];
 const manager={sendDroneLinkMessage:msg=>sent.push(msg.encodeUnframed())};
 socket.on('packet.rejected',event=>rejected.push(event));registerSocketLinkIngress(socket,manager,254);
 for(const raw of [undefined,[],[0,1],[0,7,4,0,0x20,42]])assert.doesNotThrow(()=>socket.emit('sendMsg',raw));
 assert.equal(manager.rejectedBrowserMessages,4);assert.equal(rejected.length,4);assert.equal(sent.length,0);
 socket.emit('sendMsg',[0,7,4,0,0,42]);assert.deepEqual([...sent[0]],[0,7,4,0,0,42]);
});
