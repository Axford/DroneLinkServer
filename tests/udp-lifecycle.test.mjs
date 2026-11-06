import test from 'node:test';
import assert from 'node:assert/strict';
import udp from 'node:dgram';
import {EventEmitter} from 'node:events';
import UDPInterface from '../public/modules/UDPInterface.mjs';
function adapter(t){
 const socket=new EventEmitter();socket.address=()=>({port:8007,family:'IPv4',address:'127.0.0.1'});socket.setBroadcast=()=>{};socket.bind=(_port,callback)=>{socket.emit('listening');callback();};socket.close=()=>socket.emit('close');
 t.mock.method(udp,'createSocket',()=>socket);
 const messages=[];const value=new UDPInterface({registerInterface(){},receivePacket(){}},'fixture',message=>messages.push(message));return {value,socket,messages};
}
test('UDP adapter closes cleanly and updates its own state',t=>{
 const {value,socket,messages}=adapter(t);assert.equal(value.state,true);assert.doesNotThrow(()=>socket.close());assert.equal(value.state,false);assert.ok(messages.includes('UDP socket is closed'));
});
test('UDP socket errors log through the adapter and close its owned socket',t=>{
 const {value,socket,messages}=adapter(t);assert.doesNotThrow(()=>socket.emit('error',new Error('fixture failure')));assert.equal(value.state,false);assert.equal(value.errorMsg,'fixture failure');assert.ok(messages.some(message=>message.includes('fixture failure')));
});
