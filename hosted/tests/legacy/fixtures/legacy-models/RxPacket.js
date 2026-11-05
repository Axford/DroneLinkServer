const { number } = require('joi');
const mongoose = require('mongoose');

const { Schema } = mongoose;
const rxPacketSchema = new Schema({
    time: Date,
    packet: Buffer, // base64 encoded byte array, contains the encodeUnframed version of the DroneLinkMsg packet
    domain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Domain',
        required: true
    },
    meta: {
        id: Number,
        node: Number,
        channel: Number,
        param: Number,
        msgType: Number,
    }
},
{
    timeseries: {
        timeField: 'time',
        metaField: 'meta',
    }
});

const RxPacket = mongoose.model('RxPacket', rxPacketSchema);

module.exports = RxPacket; 