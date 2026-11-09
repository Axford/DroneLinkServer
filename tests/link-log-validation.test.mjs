import test from 'node:test';
import assert from 'node:assert/strict';
import DroneLinkLog from '../public/modules/DroneLinkLog.mjs';
const good=Uint8Array.of(11,0,0,0,1,0,7,4,0,0,42);
const bad=Uint8Array.of(11,0,0,0,2,0,7,4,0,0x20,42);
test('link log skips a bad inner packet at a usable boundary and preserves original bytes',t=>{
 t.mock.timers.enable({apis:['setInterval']});const logger=new DroneLinkLog({on(){}});
 const bytes=Uint8Array.from([...good,...bad,...good]);const original=bytes.slice();
 const report=logger.loadFromBuffer(bytes.buffer);
 assert.equal(logger.size(),2);assert.equal(report.skipped,1);assert.equal(report.complete,false);assert.deepEqual(bytes,original);
});

for(const tail of [Uint8Array.of(0),Uint8Array.of(10),Uint8Array.of(27),Uint8Array.of(26,1,2)])test(`log stops at invalid boundary ${Array.from(tail)}`,t=>{
 t.mock.timers.enable({apis:['setInterval']});const logger=new DroneLinkLog({on(){}});
 const report=logger.loadFromBuffer(Uint8Array.from([...good,...tail,...good]));
 assert.equal(report.complete,false);assert.equal(report.stoppedAt,11);assert.equal(logger.size(),1);
 assert.deepEqual(report.errors,[{offset:11,code:'invalid-log-record'}]);
});
