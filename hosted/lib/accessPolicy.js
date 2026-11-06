'use strict';
const crypto = require('node:crypto');
const fault = code => Object.assign(new Error(code), { code });
const allRoles = ['owner', 'editor', 'viewer'];
function createAccessPolicy(store) {
    const isAdmin = (control, user) => control?.soleAdmin?.userId === user._id && control.soleAdmin.googleId === user.googleId;
    function validIdentity(user, evidence, control) {
        return user?.emailVerified === true && evidence && typeof evidence === 'object' && evidence.userId === user._id && evidence.googleId === user.googleId && evidence.emailCanonical === user.emailCanonical && evidence.emailVerified === true && evidence.sessionEpoch === (control?.sessionEpoch || 0);
    }
    async function identity(req) {
        const session = await store.sessions.get(req.sessionID);
        const evidence = session?.data.passport?.user;
        const control = await store.access.getControl();
        const user = evidence?.userId ? await store.users.getById(evidence.userId) : null;
        if (!validIdentity(user, evidence, control)) throw fault('unauthenticated');
        return { control, user, admin: isAdmin(control, user), evidence };
    }
    const actor = current => ({ userId: current.user._id, sessionEpoch: current.evidence.sessionEpoch, allowedRoles: allRoles, allowPlatformAdmin: true });
    async function domain(req, roles = allRoles, active = false, domainId = req.params.id) {
        const current = await identity(req);
        const context = await store.domains.getAccessContext(domainId, current.user._id);
        if (!validIdentity(context.user, current.evidence, context.control)) throw fault('unauthenticated');
        if (!context.domain) throw fault('not-found');
        const admin = isAdmin(context.control, context.user);
        if (!admin && !roles.includes(context.role)) throw fault('forbidden');
        if (active && context.domain.status !== 'active') throw fault('archived');
        return { ...current, ...context, admin, actor: actor({ ...current, user: context.user }) };
    }
    function summary(domain, current) {
        const myRole = domain.members[current.user._id] || null; const owner = current.admin || myRole === 'owner'; const active = domain.status === 'active';
        return { _id: domain._id, name: domain.name, status: domain.status, createdAt: domain.createdAt, updatedAt: domain.updatedAt, revision: domain.revision, myRole,
            canManageMembers: active && owner, canManageKeys: active && owner, canEdit: active && (owner || myRole === 'editor'), canArchive: active && owner, canRestore: !active && owner };
    }
    const self = current => Object.fromEntries(Object.entries({ _id: current.user._id, displayName: current.user.displayName, email: current.user.email, profilePicture: current.user.profilePicture, mapState: current.user.mapState, isPlatformAdmin: current.admin }).filter(([, value]) => value !== undefined));
    const csrf = req => { if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('base64url'); return req.session.csrfToken; };
    return { identity, actor, domain, summary, self, csrf, validIdentity };
}
module.exports = { createAccessPolicy, fault };
