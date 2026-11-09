'use strict';
const protocol = require('@dronelink/protocol');
const { fault } = require('./accessPolicy');
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

module.exports = { decodePacket, nodeAddress };
