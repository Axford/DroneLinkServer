'use strict';
const crypto = require('node:crypto');
const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { fault } = require('./accessPolicy');
const { credential } = require('./telemetryRoutes');

const grantLifetimeMs = 5 * 60 * 1000;
const machinePath = '/gateway/workbench/authorize';
const gatewayIdPattern = /^[A-Za-z0-9_-]{1,200}$/;

function mountWorkbenchRoutes(app, { config, store, ready, policy, ensureAuthenticated }) {
    const grantKey = crypto.createHmac('sha256', config.cookieKey).update('DroneLink Workbench grants v1').digest();
    const parse = express.json({ limit: '4kb', inflate: false });

    function seal(data) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', grantKey, iv);
        const payload = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString('base64url');
    }

    function open(grant) {
        if (typeof grant !== 'string' || !/^[A-Za-z0-9_-]{40,2048}$/.test(grant)) throw fault('unauthenticated');
        try {
            const bytes = Buffer.from(grant, 'base64url');
            const cipher = crypto.createDecipheriv('aes-256-gcm', grantKey, bytes.subarray(0, 12));
            cipher.setAuthTag(bytes.subarray(12, 28));
            return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]));
        } catch {
            throw fault('unauthenticated');
        }
    }

    app.post('/api/domains/:id/workbench-grant', ready, parse, ensureAuthenticated, asyncHandler(async (req, res) => {
        const gatewayId = req.body?.gatewayId;
        if (typeof gatewayId !== 'string' || !gatewayIdPattern.test(gatewayId)) throw fault('validation');
        await policy.domain(req, undefined, true);
        const expiresAt = Date.now() + grantLifetimeMs;
        const grant = seal({ gatewayId, domainId: req.params.id, sessionId: req.sessionID, expiresAt });
        res.json({ success: true, data: { grant, expiresAt } });
    }));

    app.post(machinePath, ready, parse, asyncHandler(async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        const machine = credential(req);
        const { domain, id, grant, action } = req.body || {};
        if (machine.kind !== 'gateway' || !['observe', 'query-value', 'node-files'].includes(action)) throw fault('unauthenticated');
        const proof = open(grant);
        if (proof.expiresAt <= Date.now() || proof.gatewayId !== machine.id || proof.domainId !== domain) throw fault('unauthenticated');
        try {
            const gateway = await store.telemetry.verifyGateway({ domainId: domain, forwarderAddress: id, credential: machine });
            if (action === 'node-files' && !gateway.capabilities.includes('file-backup')) throw fault('forbidden');
        } catch (error) {
            if (error.code === 'forbidden') throw fault('unauthenticated');
            throw error;
        }
        const roles = action === 'observe' ? undefined : ['owner', 'editor'];
        const current = await policy.domain({ sessionID: proof.sessionId }, roles, true, domain);
        res.json({ success: true, data: { domainId: domain, canQuery: current.admin || ['owner', 'editor'].includes(current.role) } });
    }));
    const fileBackupPath = '/gateway/workbench/file-backups';
    const backupBody = express.json({ limit: '64kb', inflate: false });
    app.post(fileBackupPath, ready, backupBody, asyncHandler(async (req, res) => {
        if (!req.is('application/json')) throw fault('validation');
        const machine = credential(req);
        if (machine.kind !== 'gateway') throw fault('unauthenticated');
        const { domain, id, nodeAddress, path, text, capturedAt, stream, sequence } = req.body ?? {};
        try {
            const data = await store.fileBackups.save({
                domainId: domain, forwarderAddress: id, credential: machine, nodeAddress, path, text,
                capturedAt: typeof capturedAt === 'string' ? new Date(capturedAt) : undefined, stream, sequence,
            });
            res.json({ success: true, data });
        } catch (error) {
            if (error.code === 'forbidden') throw fault('unauthenticated');
            throw error;
        }
    }));
    const history = '/api/domains/:id/nodes/:node/file-backups';
    const read = operation => [ensureAuthenticated, asyncHandler(async (req, res) => {
        const roles = ['owner', 'editor'];
        const current = await policy.domain(req, roles);
        if (!/^[1-9]\d{0,2}$/.test(req.params.node)) throw fault('validation');
        const data = await operation(current.actor, {
            domainId: req.params.id, nodeAddress: Number(req.params.node), path: req.query.path, versionId: req.params.versionId,
        });
        await policy.domain(req, roles);
        res.set('Cache-Control', 'private, no-store').json({ success: true, data });
    })];
    app.get(history, ...read((actor, input) => store.fileBackups.list(actor, input)));
    app.get(history + '/:versionId', ...read((actor, input) => store.fileBackups.get(actor, input)));

}
module.exports = { mountWorkbenchRoutes, machinePath };
