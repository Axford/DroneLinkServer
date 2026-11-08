import test from 'node:test';
import fs from 'node:fs';
import {MockBinding} from '@serialport/binding-mock';
import assert from 'node:assert/strict';
import SerialInterface from '../public/modules/SerialInterface.mjs';
import CRC8 from '../public/modules/CRC.mjs';
const diagnostic=Uint8Array.from([0xfd,3,3,0,0,104,105,10,0xf7]);
const mesh=Uint8Array.from(Buffer.from('fe05fafa02021847fa02010d70001b','hex'));
function adapter(){const received=[],logs=[];const serial=new SerialInterface({receivePacket:(_i,msg)=>received.push(msg)},'test',v=>logs.push(v),'');logs.length=0;return {serial,received,logs};}
test('mixed diagnostic and mesh records keep diagnostics out of routing and mesh counters',()=>{
  for(let split=0;split<=diagnostic.length+mesh.length;split++) {
    const {serial,received,logs}=adapter(); const bytes=Uint8Array.from([...diagnostic,...mesh]);
    serial.decodeBuffer(bytes.slice(0,split)); serial.decodeBuffer(bytes.slice(split));
    assert.equal(received.length,1);assert.equal(serial.packetsReceived,1);assert.equal(serial.packetsRejected,0);
    assert.deepEqual(logs,['[Serial test] hi']);
  }
});

const hex=value=>Uint8Array.from(Buffer.from(value,'hex'));
const utf8Start=hex('fd0101ffffe228'),utf8End=hex('fd0302000082ac0a3b');
const markers=hex('fd03070300fdfe0a16');
function record(text,flags,sequence) {
  const b=Uint8Array.from([text.length,flags,sequence&255,sequence>>8,...text]);
  return Uint8Array.from([0xfd,...b,CRC8().calc(b,b.length)]);
}
test('UTF-8 split across records and sequence wrap preserves one line at every stream split',()=>{
  const bytes=Uint8Array.from([...utf8Start,...utf8End]);
  for(let split=0;split<=bytes.length;split++) {
    const {serial,logs,received}=adapter();serial.decodeBuffer(bytes.slice(0,split));serial.decodeBuffer(bytes.slice(split));
    assert.deepEqual(logs,['[Serial test] €']);assert.equal(received.length,0);
  }
});
test('embedded FD/FE is diagnostic text, LOSS is visible, and valid mesh still arrives',()=>{
  const {serial,logs,received}=adapter();serial.decodeBuffer(Uint8Array.from([...markers,...mesh]));
  assert.equal(received.length,1);assert.ok(logs.some(v=>v.includes('gap/loss')));assert.equal(serial.diagnosticRecords,1);assert.equal(serial.packetsRejected,0);
});
test('bad length, reserved flags and corrupt checksum recover without changing mesh counters',()=>{
  for(const bad of [hex('fd00'),hex('fd31'),record([65],8,0),hex('fd0303000068690a00')]) {
    const {serial,received}=adapter();serial.decodeBuffer(Uint8Array.from([...bad,...mesh,...diagnostic]));
    assert.equal(received.length,1);assert.equal(serial.diagnosticRejected,1);assert.equal(serial.packetsRejected,0);assert.equal(serial.diagnosticRecords,1);
  }
});
test('gap and reset do not silently join incomplete lines or UTF-8 characters',()=>{
  const {serial,logs}=adapter();serial.decodeBuffer(record([65,0xe2],1,0));serial.decodeBuffer(record([66,10],2,2));
  assert.ok(logs.some(v=>v.includes('incomplete')));assert.ok(logs.some(v=>v.includes('gap/loss')));assert.equal(logs.at(-1),'[Serial test] B');
  serial.decodeBuffer(utf8Start);serial.resetDecoder();serial.decodeBuffer(diagnostic);assert.equal(logs.at(-1),'[Serial test] hi');
  serial.decodeBuffer(mesh.slice(0,5));serial.resetDecoder();serial.decodeBuffer(mesh);assert.equal(serial.packetsReceived,1);
});
test('long lines are displayed in bounded continuation segments without losing text',()=>{
  const {serial,logs}=adapter();
  for(let i=0;i<24;i++) serial.decodeBuffer(record(new Uint8Array(48).fill(120),i===0?1:0,i));
  serial.decodeBuffer(record([10],2,24));
  assert.equal(logs.length,3);assert.ok(logs.every(v=>v.length<550));
  const content=logs.map(v=>v.replace('[Serial test] ','').replace(' [continued]','')).join('');assert.equal(content,'x'.repeat(1152));
});
test('unterminated short text is displayed within the bounded flush interval',async()=>{
  const {serial,logs}=adapter();serial.decodeBuffer(record([65],1,0));assert.equal(logs.length,0);
  await new Promise(resolve=>setTimeout(resolve,280));assert.deepEqual(logs,['[Serial test] A [continued]']);serial.resetDecoder();
});
test('terminal controls and markup render as diagnostic text',()=>{
  const {serial,logs}=adapter();serial.decodeBuffer(record([27,91,50,74,123,120,125,0xc2,0x9b,10],3,0));
  assert.deepEqual(logs,['[Serial test] \\u001b[2J\\u007bx\\u007d\\u009b']);
});
test('leading startup noise and one-byte feeds preserve mixed records',()=>{
  const {serial,received,logs}=adapter();
  for(const b of Uint8Array.from([...new TextEncoder().encode('boot\r\n'),...mesh,...diagnostic,...mesh])) serial.decodeByte(b);
  assert.equal(received.length,2);assert.deepEqual(logs,['[Serial test] hi']);
});

test('shared literal mesh corpus passes exact-byte delivery at every split',()=>{
  const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/serial-vectors.json',import.meta.url)));
  for(const fixture of fixtures.mesh) {
    const bytes=hex(fixture.hex);
    for(let split=0;split<=bytes.length;split++) {
      const {serial,received}=adapter();serial.decodeBuffer(bytes.slice(0,split));serial.decodeBuffer(bytes.slice(split));
      assert.equal(received.length,1,fixture.name);assert.deepEqual([...new Uint8Array(received[0].encode())], [...bytes.slice(1)]);
    }
  }
});

test('continuous partial text does not postpone the first display deadline',async()=>{
  const {serial,logs}=adapter();serial.decodeBuffer(record([65],1,0));
  for(let i=1;i<=4;i++) {await new Promise(resolve=>setTimeout(resolve,75));serial.decodeBuffer(record([65],0,i));}
  assert.ok(logs.length>=1);assert.ok(logs[0].includes('[continued]'));serial.resetDecoder();
});
test('reset makes pending line/character loss visible',()=>{
  const {serial,logs}=adapter();serial.decodeBuffer(record([65,0xe2],1,0));serial.resetDecoder();
  assert.ok(logs.some(v=>v.includes('incomplete')));assert.ok(logs.some(v=>v.includes('connection reset')));
});
test('installed serialport constructor opens, receives and reopens with a simulated binding',async()=>{
  const path='/test/serial-diagnostics';MockBinding.createPort(path);
  const received=[],logs=[];
  const serial=new SerialInterface({registerInterface(){},receivePacket:(_i,msg)=>received.push(msg)},'binding',v=>logs.push(v),path,MockBinding);
  const waitFor=async predicate=>{const deadline=Date.now()+1000;while(!predicate()){assert.ok(Date.now()<deadline,logs.join('\n'));await new Promise(resolve=>setTimeout(resolve,5));}};
  await waitFor(()=>serial.state===true);let port=serial.openSerialPort;
  assert.equal(port.path,path);assert.equal(port.baudRate,115200);
  port.port.emitData(Buffer.from([...diagnostic,...mesh]));await waitFor(()=>received.length===1);
  port.port.emitData(Buffer.from(record([65],1,1)));await new Promise(resolve=>setTimeout(resolve,10));
  await new Promise((resolve,reject)=>port.close(error=>error?reject(error):resolve()));
  assert.ok(logs.some(v=>v.includes('connection reset')));
  clearTimeout(serial.reconnectTimer);serial.reconnectTimer=null;serial.attemptToOpenSerial();
  await waitFor(()=>serial.state===true);port=serial.openSerialPort;port.port.emitData(Buffer.from(mesh));await waitFor(()=>received.length===2);
  await new Promise((resolve,reject)=>port.close(error=>error?reject(error):resolve()));clearTimeout(serial.reconnectTimer);serial.reconnectTimer=null;
});

test('UTF-8 continuation arriving after an empty timer still schedules display',async()=>{
  const {serial,logs}=adapter();serial.decodeBuffer(record([0xe2],1,0));
  await new Promise(resolve=>setTimeout(resolve,280));assert.equal(logs.length,0);
  serial.decodeBuffer(record([0x82,0xac],0,1));await new Promise(resolve=>setTimeout(resolve,280));
  assert.deepEqual(logs,['[Serial test] € [continued]']);serial.resetDecoder();
});
