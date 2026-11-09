'use strict';
const crypto = require('node:crypto');
const protocol = require('@dronelink/protocol');
const { fault } = require('./accessPolicy');
const { asyncHandler } = require('../middleware/errorHandler');
const nodeAddress = value => Number.isInteger(value) && value >= 1 && value <= 254;
function decodePacket(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !nodeAddress(body.id)) throw fault('validation');
    const encoded = body.packet;
    if (typeof encoded !== 'string' || encoded.length < 8 || encoded.length > 28) throw fault('validation');
    const packet = Buffer.from(encoded, 'base64');
    if (packet.toString('base64') !== encoded) throw fault('validation');
    try { protocol.readLinkPacket(packet); } catch(error) { if(!(error instanceof protocol.ProtocolValidationError)) throw error; throw fault('validation'); }
    const [source, node, channel, packedParam, packedType] = packet;
    const param = packedParam & 63; const msgType = (packedType >> 4) & 7;
    if (source === 255 || node === 255 || channel === 255) throw fault('validation');
    const meta = { id: body.id, node, channel, param, msgType, source };
    for (const key of ['node', 'channel', 'param', 'msgType']) if (Object.hasOwn(body, key) && body[key] !== meta[key]) throw fault('validation');
    const publication = msgType < protocol.DRONE_LINK_MSG_TYPE_NAMEQUERY && (source === 0 || source === node);
    if (publication && (!nodeAddress(node) || channel === 0 || param === 0)) throw fault('validation');
    return { packet, meta, ...(publication ? { nodeAddress: node } : {}) };
}
function credential(req) {
    const bearer = req.get('Authorization');
    if (bearer !== undefined) {
        const match = /^Bearer ([A-Za-z0-9_-]{1,200})\.([A-Za-z0-9_-]{43})$/.exec(bearer);
        if (!match || Object.hasOwn(req.body || {}, 'apiKey')) throw fault('unauthenticated');
        return { kind: 'gateway', id: match[1], secretHash: crypto.createHash('sha256').update(match[2]).digest('hex') };
    }
    if (typeof req.body?.apiKey !== 'string' || !req.body.apiKey || req.body.apiKey.length > 512) throw fault('unauthenticated');
    return { kind: 'domain', secret: req.body.apiKey };
}
function mountTelemetryRoutes(app, { store, ready, policy, ensureAuthenticated }) {
    const authenticate = async run => {
        try { return await run(); } catch (error) { if (error.code === 'forbidden') throw fault('unauthenticated'); throw error; }
    };
    app.post('/addPacket', ready, asyncHandler(async (req, res) => {
        const decoded = decodePacket(req.body); const machine = credential(req); const receivedAt = new Date();
        const admitted = await authenticate(() => store.telemetry.admit({ domainId: req.body.domain, credential: machine, forwarderAddress: decoded.meta.id, receivedAt, nodeAddress: decoded.nodeAddress, ...(store.observations ? { receiptId: crypto.randomUUID() } : {}) }));
        if (admitted.observationTicket) await store.observations.enqueue({ ticket: admitted.observationTicket, packet: decoded.packet });
        await store.packets.enqueue({ domain: req.body.domain, time: receivedAt, packet: decoded.packet, meta: decoded.meta,
            origin: machine.kind === 'gateway' ? { kind: 'gateway', gatewayId: machine.id } : { kind: 'http' } });
        res.status(202).send('Packet received');
    }));
    app.post('/gateway/verify', ready, asyncHandler(async (req, res) => {
        const machine = credential(req);
        const result = await authenticate(() => store.telemetry.verifyGateway({ domainId: req.body?.domain, forwarderAddress: req.body?.id, credential: machine }));
        res.json({ success: true, data: result });
    }));
    const wrap = run => [ensureAuthenticated, asyncHandler(run)];
    app.get('/api/domains/:id/identities', ...wrap(async (req, res) => {
        const current = await policy.domain(req); const result = await store.telemetry.listIdentities(current.actor, { domainId: req.params.id });
        await policy.domain(req); res.json({ success: true, data: result });
    }));
    app.get('/api/domains/:id/gateways', ...wrap(async (req, res) => {
        const current = await policy.domain(req, ['owner']);
        const result = await store.telemetry.listGateways(current.actor, { domainId: req.params.id, cursor: req.query.cursor, limit: req.query.limit === undefined ? 20 : Number(req.query.limit) });
        await policy.domain(req, ['owner']); res.json({ success: true, data: result.items, pagination: { nextCursor: result.nextCursor } });
    }));
    app.post('/api/domains/:id/gateways', ...wrap(async (req, res) => {
        if (!req.body || Object.keys(req.body).some(key => !['name', 'nodeAddress'].includes(key))) throw fault('validation');
        const current = await policy.domain(req, ['owner'], true); const secret = crypto.randomBytes(32).toString('base64url');
        const row = await store.telemetry.issueGateway(current.actor, { domainId: req.params.id, name: req.body.name, nodeAddress: req.body.nodeAddress, secretHash: crypto.createHash('sha256').update(secret).digest('hex') });
        await policy.domain(req, ['owner']); res.status(201).json({ success: true, data: { gateway: row, credential: row._id + '.' + secret } });
    }));
    app.delete('/api/domains/:id/gateways/:gatewayId', ...wrap(async (req, res) => {
        if (!req.body || Object.keys(req.body).some(key => key !== 'revision')) throw fault('validation');
        const current = await policy.domain(req, ['owner']); const row = await store.telemetry.revokeGateway(current.actor, { domainId: req.params.id, gatewayId: req.params.gatewayId, revision: req.body.revision });
        res.json({ success: true, data: row });
    }));
}
module.exports = { mountTelemetryRoutes };
