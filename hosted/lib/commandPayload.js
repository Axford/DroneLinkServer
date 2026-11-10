'use strict';

const {
    DRONE_LINK_MSG_TYPE_UINT8_T: UINT8,
    DRONE_LINK_MSG_TYPE_UINT32_T: UINT32,
    DRONE_LINK_MSG_TYPE_FLOAT: FLOAT,
    DRONE_LINK_MSG_TYPE_ADDR: ADDR,
    DRONE_LINK_MSG_TYPE_CHAR: CHAR,
    DRONE_LINK_MSG_TYPE_SIZES: widths,
    DRONE_LINK_MSG_TYPE_QUERY: QUERY,
    DRONE_LINK_MSG_TYPE_NAMEQUERY: NAMEQUERY,
    encodeLinkPacket
} = require('@dronelink/protocol');
const { fault } = require('./accessPolicy');

function exact(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== fields.length || !fields.every(key => Object.hasOwn(value, key))) throw fault('validation');
}
function integer(value, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw fault('validation');
    return value;
}
function opaque(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value) ||
        Buffer.from(value, 'base64url').toString('base64url') !== value) throw fault('validation');
    return value;
}
function targetAddress(target) {
    exact(target, ['nodeAddress', 'channel', 'param']);
    return { nodeAddress: integer(target.nodeAddress, 1, 254), channel: integer(target.channel, 1, 254), param: integer(target.param, 1, 63) };
}
function encodePayload(input, type, length) {
    const bytes = Buffer.alloc(length);
    if (type === CHAR) {
        exact(input, ['text']);
        if (typeof input.text !== 'string' || input.text.length > length) throw fault('validation');
        for (let i = 0; i < input.text.length; i++) bytes[i] = integer(input.text.charCodeAt(i), 1, 255);
        return bytes;
    }
    const key = type === ADDR ? 'addresses' : 'values';
    exact(input, [key]);
    const elements = input[key];
    const width = widths[type];
    if (!Array.isArray(elements) || elements.length !== length / width) throw fault('validation');
    elements.forEach((value, i) => {
        const offset = i * width;
        if (type === ADDR) {
            exact(value, ['source', 'node', 'channel', 'param', 'priority']);
            bytes[offset] = integer(value.source, 0, 255);
            bytes[offset + 1] = integer(value.node, 0, 255);
            bytes[offset + 2] = integer(value.channel, 0, 255);
            bytes[offset + 3] = integer(value.priority, 0, 3) << 6 | integer(value.param, 0, 63);
        } else if (type === UINT8) bytes[offset] = integer(value, 0, 255);
        else if (type === UINT32) bytes.writeUInt32LE(integer(value, 0, 0xffffffff), offset);
        else {
            if (!Number.isFinite(value)) throw fault('validation');
            const rounded = Math.fround(value);
            if (!Number.isFinite(rounded)) throw fault('validation');
            bytes.writeFloatLE(rounded === 0 ? 0 : rounded, offset);
        }
    });
    return bytes;
}
function submission(body) {
    const operation = body?.operation;
    const write = operation === 'write';
    if (!write && operation !== 'query-value' && operation !== 'query-name') throw fault('validation');
    exact(body, ['submissionId', 'target', 'operation', ...(write ? ['expected', 'payload'] : [])]);
    const result = { submissionId: opaque(body.submissionId), target: targetAddress(body.target), operation };
    if (!write) return result;
    const expected = body.expected;
    exact(expected, ['observationEpoch', 'nodeGeneration', 'msgType', 'payloadBytes', 'writable']);
    if (typeof expected.observationEpoch !== 'string' || !/^[\w-]{1,64}$/.test(expected.observationEpoch) || expected.writable !== true) throw fault('validation');
    integer(expected.nodeGeneration, 0, Number.MAX_SAFE_INTEGER);
    const type = integer(expected.msgType, 0, CHAR);
    const length = integer(expected.payloadBytes, 1, 16);
    if (length % widths[type]) throw fault('validation');
    return { ...result, expected, payload: encodePayload(body.payload, type, length) };
}
function requested(command) {
    if (command.operation !== 'write') return null;
    const { msgType: type, payload } = command;
    if (type === CHAR) {
        const end = payload.indexOf(0);
        return { text: payload.toString('latin1', 0, end < 0 ? payload.length : end) };
    }
    if (type === UINT8) return { values: [...payload] };
    if (type === ADDR) {
        const addresses = [];
        for (let i = 0; i < payload.length; i += 4) addresses.push({
            source: payload[i], node: payload[i + 1], channel: payload[i + 2],
            param: payload[i + 3] & 63, priority: payload[i + 3] >> 6
        });
        return { addresses };
    }
    const values = [];
    for (let i = 0; i < payload.length; i += 4) values.push(type === FLOAT ? payload.readFloatLE(i) : payload.readUInt32LE(i));
    return { values };
}
function packet(command, source) {
    const { target, operation, priority, msgType } = command;
    const write = operation === 'write';
    const type = write ? msgType : operation === 'query-name' ? NAMEQUERY : QUERY;
    if (target.nodeAddress !== source || (write ? priority !== 3 || type < 0 || type > CHAR : priority !== 0 || command.payload !== null || msgType !== type)) throw fault('unavailable');
    const payload = write ? command.payload : Buffer.of(0);
    return encodeLinkPacket({ source, node: target.nodeAddress, channel: target.channel, param: target.param,
        priority, msgType: type, msgLength: payload.length, writable: false }, payload);
}
module.exports = { exact, integer, opaque, submission, requested, packet };
