const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    UID: {
        type: String,
        required: true,
        unique: true
    },
    createdDate: {
        type: Date,
        default: Date.now
    },
    lastSignInDate: {
        type: Date
    },
    domains: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Domain'
    }]
});

const User = mongoose.model('User', userSchema);

module.exports = User; 