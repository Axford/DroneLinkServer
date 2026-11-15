'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openFirestoreStore } = require('@dronelink/persistence');
const { withFirestore } = require('../../tools/firestore.cjs');
const { buildReplayFrame } = require('../../lib/replayHistory');

const start = Date.parse('2026-11-01T12:00:00Z');

test('a serialized key frame resumes native packet history at its exclusive cutoff', () =>
    withFirestore(async options => {
        const writer = await openFirestoreStore({ ...options, maxChunkPackets: 128 });
        const enqueue = (offset, hex, domain = 'replay-domain') =>
            writer.packets.enqueue({ domain, time: new Date(start + offset), packet: Buffer.from(hex, 'hex'), meta: {} });
        let expectedTiedValue;
        try {
            // Force multiple pages in the first millisecond without depending on ID generation order.
            for (let i = 0; i < 260; i++) await enqueue(0, '000b07080009');
            await enqueue(1, '000b0705434e4d4541'); // NMEA type. First report preserves earlier readings.
            await enqueue(2, '000b07085056'); // Parameter name V.
            await enqueue(2, '000b0705434e4d4541'); // Repeated type preserves the channel.
            const first = await enqueue(2, '000b07090007');
            const second = await enqueue(2, '000b07090008');
            expectedTiedValue = first.packetId > second.packetId ? 'Bw==' : 'CA==';
            await enqueue(2, '000b070a6000'); // Name query.
            await enqueue(2, '000b070b23ff'); // Truncated uint32.
            await enqueue(2, '0c0b070c0001'); // Cross-node write.
            await enqueue(2, '000b070d0001', 'other-domain');
            await enqueue(3, '000b070545494e41323139'); // INA219 at precisely the frame boundary.
            await enqueue(4, '000b0708000c');
            await enqueue(5, '000b07080063'); // Exactly at the final cutoff, stays outside.
        } finally {
            await writer.close();
        }

        const reader = await openFirestoreStore(options);
        try {
            const domainId = 'replay-domain';
            const frame = await buildReplayFrame(reader.packets, { domainId, from: start, until: start + 3 });
            assert.deepEqual(frame, {
                schemaVersion: 1, domainId, until: start + 3,
                channels: [{ nodeAddress: 11, channel: 7, moduleType: 'NMEA', params: {
                    5: { value: { msgType: 4, payload: 'Tk1FQQ==' } },
                    8: { name: { payload: 'Vg==' }, value: { msgType: 0, payload: 'CQ==' } },
                    9: { value: { msgType: 0, payload: expectedTiedValue } }
                } }]
            });

            const boundary = await buildReplayFrame(reader.packets, { domainId, frame, until: start + 4 });
            assert.deepEqual(boundary.channels, [{ nodeAddress: 11, channel: 7, moduleType: 'INA219', params: {
                5: { value: { msgType: 4, payload: 'SU5BMjE5' } }
            } }]);

            const continued = await buildReplayFrame(reader.packets, {
                domainId, frame: JSON.parse(JSON.stringify(frame)), until: start + 5
            });
            const sequential = await buildReplayFrame(reader.packets, { domainId, from: start, until: start + 5 });
            assert.deepEqual(continued, sequential);
            assert.deepEqual(continued.channels[0].params[8], { value: { msgType: 0, payload: 'DA==' } });
            assert.equal(frame.channels[0].params[8].value.payload, 'CQ==');
            await assert.rejects(buildReplayFrame(reader.packets, { domainId: 'other-domain', frame, until: start + 5 }), RangeError);
        } finally {
            await reader.close();
        }
    }));
