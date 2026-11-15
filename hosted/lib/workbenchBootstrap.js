'use strict';
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { fault } = require('./accessPolicy');

const browserPath = '/auth/workbench';
const approvalPath = '/api/workbench/bootstrap/approve';
const exchangePath = '/gateway/workbench/bootstrap/exchange';
const token = /^[A-Za-z0-9_-]{43}$/;
const domainId = /^[A-Za-z0-9_-]{1,200}$/;
const lifetime = 120000;
const limit = 256;
const sha256 = value => createHash('sha256').update(value);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const integer = (value, low, high) => ['string', 'number'].includes(typeof value) && /^\d{1,5}$/.test(String(value)) && Number(value) >= low && Number(value) <= high;
const isMatch = (pattern, value) => typeof value === 'string' && pattern.test(value);

function requestDetails(input) {
    const { domain, address, transport, port, challenge, state } = input ?? {};
    if (!isMatch(domainId, domain) || !integer(address, 1, 254) ||
        !['wifi', 'serial'].includes(transport) || !integer(port, 1024, 65535) ||
        !isMatch(token, challenge) || !isMatch(token, state)) throw fault('validation');
    return { domain, address: Number(address), transport, port: Number(port), challenge, state };
}

function isWorkbenchReturn(path) {
    if (typeof path !== 'string' || !path.startsWith(browserPath + '?') || path.length > 600) return false;
    try {
        const url = new URL(path, 'https://local.invalid');
        requestDetails(Object.fromEntries(url.searchParams));
        return url.pathname === browserPath && !url.hash;
    } catch { return false; }
}

function page(content) {
    return '<!doctype html><html lang="en"><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Authorize Workbench · DroneWright</title><link rel="stylesheet" href="/public/workbench-bootstrap.css"><body><main><h1>Authorize Workbench</h1>' +
        content + '</main></body></html>';
}

function mountWorkbenchBootstrap(app, { store, ready, policy, ensureAuthenticated }) {
    // Short-lived approvals belong to this hosted process. Recycling it expires pending approvals.
    const approvals = new Map();
    const parse = express.json({ limit: '4kb', inflate: false });
    function prune(now) {
        for (const [code, approval] of approvals) if (approval.expiresAt <= now) approvals.delete(code);
    }

    app.get(browserPath, ready, asyncHandler(async (req, res) => {
        const target = requestDetails(req.query);
        res.set('Referrer-Policy', 'no-referrer');
        let current;
        try { current = await policy.domain(req, ['owner'], true, target.domain); }
        catch (error) {
            if (error.code === 'unauthenticated') {
                const back = browserPath + '?' + new URLSearchParams(target);
                return res.send(page('<p>Sign in as a Domain Owner or Platform Admin to continue.</p>' +
                    '<a href="/auth/google?returnTo=' + encodeURIComponent(back) + '">Sign in with Google</a>'));
            }
            if (['forbidden', 'not-found', 'archived'].includes(error.code))
                return res.status(403).send(page('<p>A Domain Owner or Platform Admin must authorize an active Domain.</p>'));
            throw error;
        }
        res.send(page('<p>Allow this Workbench to publish telemetry to <strong>' +
            escape(current.domain.name) + '</strong>?</p><p>Gateway address ' + target.address + ' · ' +
            (target.transport === 'serial' ? 'USB serial' : 'Wi-Fi') + '</p>' +
            '<button type="button" id="authorize">Authorize telemetry</button> ' +
            '<button type="button" id="cancel">Cancel</button><p id="status" role="status"></p>' +
            '<script src="/public/workbench-bootstrap.js" defer></script>'));
    }));

    app.post(approvalPath, ready, parse, ensureAuthenticated, asyncHandler(async (req, res) => {
        const target = requestDetails(req.body);
        await policy.domain(req, ['owner'], true, target.domain);
        const now = Date.now();
        prune(now);
        if (approvals.size >= limit) throw fault('unavailable');
        const code = randomBytes(32).toString('base64url');
        approvals.set(code, { ...target, sessionId: req.sessionID, expiresAt: now + lifetime });
        const callback = new URL('/workbench/authorized', 'http://127.0.0.1:' + target.port);
        callback.search = new URLSearchParams({ code, state: target.state }).toString();
        res.json({ success: true, data: { callback: callback.href } });
    }));

    app.post(exchangePath, ready, parse, asyncHandler(async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        const { code, verifier } = req.body ?? {};
        if (!isMatch(token, code) || !isMatch(token, verifier)) throw fault('validation');
        prune(Date.now());
        const approval = approvals.get(code);
        if (!approval || !timingSafeEqual(sha256(verifier).digest(), Buffer.from(approval.challenge, 'base64url')))
            throw fault('unauthenticated');
        approvals.delete(code);
        const current = await policy.domain({ sessionID: approval.sessionId }, ['owner'], true, approval.domain);
        const secret = randomBytes(32).toString('base64url');
        const row = await store.telemetry.issueGateway(current.actor, { domainId: approval.domain,
            name: 'Workbench ' + approval.transport + ' ' + approval.address, nodeAddress: approval.address,
            secretHash: sha256(secret).digest('hex') });
        res.json({ success: true, data: { domain: approval.domain, address: approval.address, credential: row._id + '.' + secret } });
    }));
}

module.exports = { mountWorkbenchBootstrap, exchangePath, isWorkbenchReturn };
