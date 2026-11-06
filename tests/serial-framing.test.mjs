import test from 'node:test';
import assert from 'node:assert/strict';
import SerialInterface from '../public/modules/SerialInterface.mjs';
import {DroneMeshMsg} from '../public/modules/DroneMeshMsg.mjs';
import CRC8 from '../public/modules/CRC.mjs';
const frame=Uint8Array.from(Buffer.from('fe05fafa02021847fa02010d70001b','hex'));
function adapter(){const received=[];const serial=new SerialInterface({receivePacket:(_interface,msg)=>received.push(msg)},'test',()=>{},'');return {serial,received};}
test('actual serial decoder delivers one complete CRC-valid mesh frame without another byte',()=>{
 const {serial,received}=adapter();serial.decodeBuffer(frame);
 assert.equal(received.length,1);assert.equal(received[0].isValid,true);assert.equal(received[0].srcNode,250);
});
test('serial decoder handles fragmented/back-to-back frames and rejects corrupted CRC',()=>{
 const {serial,received}=adapter();serial.decodeBuffer(frame.slice(0,5));assert.equal(received.length,0);serial.decodeBuffer(frame.slice(5));
 serial.decodeBuffer(Uint8Array.from([...frame,...frame]));assert.equal(received.length,3);
 const bad=frame.slice();bad[10]^=1;serial.decodeBuffer(Uint8Array.from([...bad,...frame]));assert.equal(received.length,4);assert.equal(serial.packetsRejected,1);
});
test('serial and mesh CRC agree with independent SMBus check vector and captured query bytes',()=>{
 assert.equal(CRC8().calc(new TextEncoder().encode('123456789'),9),0xf4);
 assert.equal(new DroneMeshMsg(frame.slice(1).buffer).isValid,true);
});
test('mesh boundary rejects truncated/trailing/oversized declarations before routing',()=>{
 const mesh=frame.slice(1);
 for (const raw of [mesh.slice(0,-1),Uint8Array.from([...mesh,0]),Uint8Array.from([63,...mesh.slice(1)])]) assert.equal(new DroneMeshMsg(raw).isValid,false);
 assert.equal(new DroneMeshMsg(mesh).isValid,true);
 assert.equal(new DroneMeshMsg(mesh.buffer).isValid,true);
});
test('serial decoder recovers after noise and invalid length without losing the next frame',()=>{
 const {serial,received}=adapter();serial.decodeBuffer(Uint8Array.from([1,2,3,0xfe,63,...frame]));
 assert.equal(received.length,1);assert.equal(serial.packetsRejected,1);
});
