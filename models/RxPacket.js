const mongoose = require('mongoose');

const { Schema } = mongoose;
const rxPacketSchema = new Schema({
    time: Date,
    packet: Buffer,
    domain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Domain',
        required: true
    },
    meta: {
        id: String,
        node: String,
        channel: String,
        param: String,
        msgType: String,
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