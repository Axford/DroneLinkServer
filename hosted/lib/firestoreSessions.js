'use strict';
const session = require('express-session');
// Express owns cookie policy; the library owns durable records and expiry checks.
class FirestoreSessions extends session.Store {
    constructor(sessions) { super(); this.sessions = sessions; }
    get(id, callback) {
        this.sessions.get(id).then(row => callback(null, row?.data || null), callback);
    }
    set(id, data, callback = () => {}) {
        const createdAt = new Date(data.issuedAt || Date.now());
        const expiresAt = new Date(data.validUntil || createdAt.getTime() + (data.passport?.user ? 30 * 86400000 : 600000));
        data.issuedAt = createdAt.toISOString(); data.validUntil = expiresAt.toISOString();
        this.sessions.put(id, { data: JSON.parse(JSON.stringify(data)), createdAt, expiresAt }).then(() => callback(), callback);
    }
    destroy(id, callback = () => {}) { this.sessions.remove(id).then(() => callback(), callback); }
    touch(id, data, callback = () => {}) { callback(); }
}
module.exports = { FirestoreSessions };
