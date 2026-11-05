const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true,
    },
    domain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Domain',
        required: true
    }
});

const Node = mongoose.model('Node', nodeSchema);

module.exports = Node; 