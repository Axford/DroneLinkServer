'use strict';
const crypto = require('node:crypto');
const express = require('express');
const { fault } = require('./accessPolicy');
const { decodePacket, nodeAddress } = require('./telemetryPackets');
const { asyncHandler } = require('../middleware/errorHandler');

function decodeBatch(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 4 ||
        !['domain', 'id', 'apiKey', 'packets'].every(key => Object.hasOwn(body, key)) || !nodeAddress(body.id)) throw fault('validation');
    if (typeof body.domain !== 'string' || !body.domain || Buffer.byteLength(body.domain) > 200 ||
        body.domain.includes('/') || body.domain === '.' || body.domain === '..' || /^__.*__$/.test(body.domain) ||
        typeof body.apiKey !== 'string' || !body.apiKey || Buffer.byteLength(body.apiKey) > 512) throw fault('validation');
    if (typeof body.packets !== 'string' || body.packets.length < 8 || body.packets.length > 896) throw fault('validation');
    const bytes = Buffer.from(body.packets, 'base64');
    if (bytes.toString('base64') !== body.packets || bytes.length > 672) throw fault('validation');
    const packets = [], facets = new Set();
    for (let offset = 0; offset < bytes.length;) {
        if (bytes.length - offset < 6 || packets.length === 32) throw fault('validation');
        const end = offset + 5 + (bytes[offset + 4] & 15) + 1;
        if (end > bytes.length) throw fault('validation');
        const decoded = decodePacket({ id: body.id, packet: bytes.subarray(offset, end).toString('base64') });
        if (decoded.nodeAddress === undefined) throw fault('validation'); // Packed reports contain publications only.
        const facet = `${decoded.meta.node}/${decoded.meta.channel}/${decoded.meta.param}/${decoded.meta.msgType === 5 ? 'name' : 'value'}`;
        if (facets.has(facet)) throw fault('validation');
        facets.add(facet); packets.push(decoded); offset = end;
    }
    if (!packets.length) throw fault('validation');
    return packets;
}

// Mount before the general JSON parser and browser sessions. This route owns its
// wire/materialization bound and does not acquire browser administration authority.
function mountPackedTelemetry(app, { store, ready }) {
    const parse = express.json({ limit: 4096, inflate: false, strict: true });
    const parseError = (error, req, res, next) => next(error.type ? fault('validation') : error);
    const authenticate = async input => {
        try { return await store.telemetry.admit(input); }
        catch (error) { if (error.code === 'forbidden') throw fault('unauthenticated'); throw error; }
    };
    const outcome = (res, status, body) => {
        if (!res.destroyed && !res.headersSent) res.status(status).json(body);
    };
    app.post('/addPackets', parse, parseError, ready, asyncHandler(async (req, res) => {
        const packets = decodeBatch(req.body);
        if (req.get('Authorization') !== undefined) throw fault('unauthenticated');
        const input = { domainId: req.body.domain, forwarderAddress: req.body.id,
            credential: { kind: 'domain', secret: req.body.apiKey }, receivedAt: new Date() };
        // No carried node: authenticates/readiness-checks without discovering the uploader.
        await authenticate(input);
        let admitted = 0;
        for (const decoded of packets) {
            try {
                const receipt = await authenticate({ ...input, nodeAddress: decoded.nodeAddress,
                    ...(store.observations ? { receiptId: crypto.randomUUID() } : {}) });
                if (receipt.observationTicket) await store.observations.enqueue({ ticket: receipt.observationTicket, packet: decoded.packet });
                await store.packets.enqueue({ domain: input.domainId, time: input.receivedAt, packet: decoded.packet, meta: decoded.meta, origin: { kind: 'http' } });
                ++admitted; // Only the fully returned pipeline, never inferred rollback/persistence.
            } catch (error) {
                console.error('Packed telemetry admission incomplete');
                outcome(res, 503, { received: packets.length, admitted, complete: false, code: 'admission-incomplete' });
                return;
            }
        }
        outcome(res, 202, { received: packets.length, admitted, complete: true });
    }));
}
module.exports = { mountPackedTelemetry };
