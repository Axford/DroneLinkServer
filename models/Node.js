const mongoose = require('mongoose');
const crypto = require('crypto');

const nodeSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true,
    },
    domain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Domain',
        required: true
    },
    apiKey: {
        type: String,
        default: () => crypto.randomBytes(6).toString('hex'),
        unique: true
    }
});

const Node = mongoose.model('Node', nodeSchema);

module.exports = Node; 