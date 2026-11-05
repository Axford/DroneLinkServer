const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    displayName: {
        type: String,
        required: true
    },
    googleId: {
        type: String,
        required: true,
        unique: true
    },
    profilePicture: {
        type: String,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastSignInDate: {
        type: Date
    },
    domains: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Domain'
    }],
    mapState: {
        lng: {
            type: Number,
            default: -1.804
        },
        lat: {
            type: Number,
            default: 51.575
        },
        zoom: {
            type: Number,
            default: 17.5
        }
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User; 