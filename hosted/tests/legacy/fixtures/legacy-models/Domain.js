const mongoose = require('mongoose');
const crypto = require('crypto');

const domainSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: false,
        trim: true,
        minlength: 1,
        maxlength: 100
    },
    apiKey: {
        type: String,
        required: true,
        unique: true,
        default: () => crypto.randomBytes(32).toString('hex'),
        index: true
    },
    inviteToken: {
        type: String,
        unique: true,
        default: () => crypto.randomBytes(16).toString('hex'),
        index: true
    },
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Make optional for backward compatibility
    },
    stats: {
        nodeCount: {
            type: Number,
            default: 0
        },
        packetCount: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

// Add indexes for better query performance
domainSchema.index({ users: 1 });
domainSchema.index({ createdBy: 1 });
domainSchema.index({ createdAt: -1 });

const Domain = mongoose.model('Domain', domainSchema);

module.exports = Domain; 