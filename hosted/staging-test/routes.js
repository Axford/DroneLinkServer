'use strict';
const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { asyncHandler } = require('../middleware/errorHandler');
const { fault } = require('../lib/accessPolicy');

function mountStagingTestSignIn(app, { config, store, policy, ensureAuthenticated }) {
    const signIn = store.stagingTestSignIn;
    if (!signIn) throw new Error('Staging test sign-in storage is disabled');
    const page = '/auth/staging-test';
    const api = '/api/staging-test';
    const json = express.json({ limit: '2kb', inflate: false });
    const form = express.urlencoded({ extended: false, limit: '2kb', inflate: false });
    const limit = rateLimit({ windowMs: 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
    const idPattern = /^[A-Za-z0-9_-]{1,200}$/;
    const origin = (req, res, next) => req.get('Origin') === config.publicOrigin ? next() : next(fault('csrf'));
    const requireAdmin = (req, res, next) => req.current.admin ? next() : next(fault('forbidden'));
    const result = (res, data) => res.json({ success: true, data });
    const sendPage = file => (req, res) => res.sendFile(file, { root: __dirname, cacheControl: false });
    const admin = [ensureAuthenticated, requireAdmin];

    app.use([page, api], (req, res, next) => {
        res.set('Referrer-Policy', 'no-referrer');
        next();
    });
    app.get(page, sendPage('sign-in.html'));
    app.post(page, origin, limit, form, asyncHandler(async (req, res) => {
        if (req.isAuthenticated()) throw fault('conflict');
        if (!req.is('application/x-www-form-urlencoded')) throw fault('validation');
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        let data;
        try {
            data = await signIn.redeem({ code: req.body?.code, sessionId: req.sessionID,
                cookie: req.session.cookie.toJSON(), csrfToken: crypto.randomBytes(32).toString('base64url') });
        } catch (error) {
            if (error.code === 'test-code-unavailable') return res.status(410).type('text').send('This test sign-in code is unavailable. Return to the sign-in page and request a fresh code.');
            throw error;
        }
        const { cookie, ...sessionData } = data;
        Object.assign(req.session, sessionData);
        req.session.cookie.expires = new Date(data.validUntil);
        req.session.cookie.originalMaxAge = req.session.cookie.expires.getTime() - Date.now();
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        res.redirect(303, '/private');
    }));
    app.get(page + '/admin', ...admin, sendPage('admin.html'));
    app.get(page + '/admin.js', ...admin, sendPage('admin.js'));
    app.post(api + '/memberships', ...admin, json, asyncHandler(async (req, res) => {
        const { name, domainId, role } = req.body || {};
        if (typeof domainId !== 'string' || !idPattern.test(domainId)) throw fault('validation');
        result(res, await signIn.assign(policy.actor(req.current), { name, domainId, role, revision: req.body.revision }));
    }));
    app.post(api + '/codes', ...admin, json, asyncHandler(async (req, res) => {
        const { userId, recipient } = req.body || {};
        result(res, await signIn.issue(policy.actor(req.current), { userId, recipient }));
    }));
    const audit = action => asyncHandler(async (req, res) => {
        const { id } = req.params;
        if (!/^[A-Za-z0-9]{20}$/.test(id)) throw fault('validation');
        result(res, await signIn[action](policy.actor(req.current), id));
    });
    app.get(api + '/codes/:id', ...admin, audit('inspect'));
    app.delete(api + '/codes/:id', ...admin, audit('revoke'));
}
module.exports = { mountStagingTestSignIn };
