#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const operatorRequire = createRequire(path.join(__dirname, 'access-control/package.json'));
const COMMANDS = ['plan', 'apply', 'grant-admin', 'recover-admin', 'repair-owner', 'check', 'activate'];
function parseArgs(args) {
    const [command, ...rest] = args;
    if (!COMMANDS.includes(command)) throw Error('Choose plan, apply, grant-admin, recover-admin, repair-owner, check or activate.');
    const flags = {}; const boolean = ['apply', 'managed', 'stopped-traffic', 'revise-plan'];
    const allowed = ['project', 'database', 'emulator', 'output', 'plan', 'google-id', 'old-google-id', 'new-google-id', 'revision', 'domain', 'user', 'reason', ...boolean];
    for (let index = 0; index < rest.length; index++) {
        const flag = rest[index].slice(2);
        if (!rest[index].startsWith('--') || !allowed.includes(flag) || Object.hasOwn(flags, flag)) throw Error('Unknown or duplicate argument.');
        flags[flag] = boolean.includes(flag) ? true : rest[++index];
        if (!boolean.includes(flag) && (!flags[flag] || flags[flag].startsWith('--'))) throw Error('Missing argument value.');
    }
    if (!flags.project || !flags.database || Boolean(flags.managed) === Boolean(flags.emulator)) throw Error('Select an explicit project/database and exactly one of --managed or --emulator 127.0.0.1:port.');
    if (!/^[a-z][a-z0-9-]{4,62}$/.test(flags.project) || flags.database !== '(default)' && !/^[a-z][a-z0-9-]{2,62}$/.test(flags.database)) throw Error('Invalid project/database.');
    if (process.env.FIRESTORE_EMULATOR_HOST || flags.emulator && (!/^127\.0\.0\.1:\d+$/.test(flags.emulator) || !flags.project.startsWith('demo-'))) throw Error('Emulator selection must be explicit, loopback and use a demo project.');
    // Managed operator scope is deliberately limited to this platform's documented staging project.
    if (flags.managed && flags.project !== 'dronelink-25dbc') throw Error('Managed access is limited to the documented staging project; production is not supported.');
    if (['apply', 'activate'].includes(command) && (!flags.apply || !flags.plan)) throw Error('This command requires a reviewed --plan and --apply.');
    if (command === 'apply' && !flags['stopped-traffic']) throw Error('Stop old runtime traffic and confirm --stopped-traffic before schema migration.');
    if (command === 'plan' && !flags.output) throw Error('Plan requires a private --output file.');
    if (['grant-admin', 'recover-admin'].includes(command) && !flags.plan) throw Error('Identity provisioning requires a reviewed --plan.');
    if (command === 'grant-admin' && !flags['google-id']) throw Error('Grant requires --google-id.');
    if (command === 'recover-admin' && (!flags['old-google-id'] || !flags['new-google-id'] || !flags.reason)) throw Error('Recovery requires old/new Google identities and a reason.');
    if (command === 'repair-owner' && (!flags.domain || !flags.user || !flags.reason)) throw Error('Owner repair requires domain, user and reason.');
    if (flags.revision && (!/^[1-9]\d*$/.test(flags.revision) || !Number.isSafeInteger(Number(flags.revision)))) throw Error('Invalid reviewed revision.');
    if (['grant-admin', 'recover-admin', 'repair-owner', 'activate'].includes(command) && flags.apply && !flags.revision) throw Error('Apply requires the reviewed --revision.');
    return { command, flags };
}
async function run(args) {
    const { command, flags } = parseArgs(args);
    const { openAccessOperatorStore } = operatorRequire('@dronelink/persistence/operator');
    const store = await openAccessOperatorStore({ projectId: flags.project, databaseId: flags.database, ...(flags.emulator ? { emulatorHost: flags.emulator } : {}) });
    try {
        const plan = flags.plan ? JSON.parse(await fs.readFile(flags.plan, 'utf8')) : null;
        if (plan && (plan.projectId !== flags.project || plan.databaseId !== flags.database)) throw Error('Reviewed plan belongs to another target.');
        const controlRevision = Number(flags.revision);
        if (command === 'plan') {
            const preview = await store.previewMigration({ schemaVersion: 1 });
            await fs.writeFile(flags.output, JSON.stringify(preview, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            return { previewWritten: true, domainCount: preview.domains.length, userCount: preview.users.length, blockers: preview.blockers, unresolvedOwners: preview.unresolvedOwners, digest: preview.digest };
        }
        if (command === 'apply') {
            if (flags['revise-plan']) await store.reviseMigration({ reviewedPlan: plan, expectedControlRevision: plan.controlRevision });
            else await store.beginMigration({ expectedSchemaVersion: 0, planDigest: plan.digest, reviewedPlan: plan });
            for (const row of plan.users) await store.applyUserMigration({ userId: row.userId, sourceRevision: row.sourceDigest, planDigest: plan.digest });
            for (const row of plan.domains) await store.applyDomainMigration({ domainId: row.domainId, sourceRevision: row.sourceDigest, proposedRoles: row.members, planDigest: plan.digest });
            return { state: 'maintenance', planDigest: plan.digest };
        }
        if (command === 'check') {
            if (!plan) throw Error('Check requires the reviewed --plan.');
            return await store.checkMigration({ planDigest: plan.digest });
        }
        if (command === 'activate') return await store.activate({ planDigest: plan.digest, expectedControlRevision: controlRevision });
        if (command === 'repair-owner') return await store.repairMembers({ domainId: flags.domain, expectedRevision: flags.revision ? controlRevision : (await store.previewMigration({ schemaVersion: 1 })).domains.find(row => row.domainId === flags.domain)?.revision, changes: [{ userId: flags.user, role: 'owner' }], reason: flags.reason, apply: flags.apply === true });
        const subject = command === 'grant-admin' ? flags['google-id'] : flags['new-google-id'];
        const identity = plan.users.find(row => row.googleId === subject);
        if (!identity || identity.emailCanonical !== 'damian@axford.me.uk' || identity.emailVerified !== true) throw Error('The reviewed plan must identify Damian’s existing verified Google account.');
        const preview = { command, expectedControlRevision: plan.controlRevision, userId: identity.userId, googleId: subject, ...(command === 'recover-admin' ? { oldGoogleId: flags['old-google-id'], reason: flags.reason } : {}) };
        if (!flags.apply) return preview;
        const result = command === 'grant-admin' ? await store.grantSoleAdmin({ userId: identity.userId, googleId: subject, expectedControlRevision: controlRevision }) : await store.recoverSoleAdmin({ oldGoogleId: flags['old-google-id'], newUserId: identity.userId, newGoogleId: subject, expectedControlRevision: controlRevision, reason: flags.reason });
        return { ...preview, applied: true, revision: result.revision, sessionEpoch: result.sessionEpoch };
    } finally { await store.close(); }
}
module.exports = { parseArgs, run };
if (require.main === module) run(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2)), error => { console.error(error.code ? 'Access operation failed: ' + error.code + (error.field ? ' (' + error.field + ')' : '') : error.message); process.exitCode = 1; });
