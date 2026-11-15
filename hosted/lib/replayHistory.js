'use strict';
const {
    readLinkPacket, ProtocolValidationError,
    DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_NAME,
    DRONE_MODULE_PARAM_TYPE
} = require('@dronelink/protocol');
const { isPublication, hasPublicationAddress } = require('./telemetryPackets');

const PAGE_SIZE = 256;
const SCHEMA_VERSION = 1;
const channelKey = ({ nodeAddress, channel }) => nodeAddress * 256 + channel;
const validTime = time => Number.isSafeInteger(time) && Number.isFinite(new Date(time).getTime());

function decodePublication(bytes) {
    if (!Buffer.isBuffer(bytes)) return;
    let packet;
    try {
        packet = readLinkPacket(bytes);
    } catch (error) {
        if (error instanceof ProtocolValidationError) return;
        throw error;
    }
    if (isPublication(packet) && hasPublicationAddress(packet)) return packet;
}

function applyPublication(channels, packet) {
    const { node, channel, param, msgType } = packet;
    const key = channelKey({ nodeAddress: node, channel });
    const bytes = Buffer.from(packet.payload);
    const payload = bytes.toString('base64');
    const moduleType = param === DRONE_MODULE_PARAM_TYPE && msgType === DRONE_LINK_MSG_TYPE_CHAR
        ? bytes.toString('latin1').split('\0', 1)[0] : undefined;

    let state = channels.get(key);
    if (!state || (moduleType && state.moduleType && state.moduleType !== moduleType)) {
        state = { nodeAddress: node, channel, params: {} };
        channels.set(key, state);
    }
    if (moduleType) state.moduleType = moduleType;

    const facets = state.params[param] ||= {};
    if (msgType === DRONE_LINK_MSG_TYPE_NAME) facets.name = { payload };
    else facets.value = { msgType, payload };
}

// Trusted backend call. The start is inclusive and the cutoff is exclusive,
// so all packets sharing the cutoff millisecond go into the continuation.
async function buildReplayFrame(packets, { domainId, from, until, frame }) {
    if (frame && (from !== undefined || frame.domainId !== domainId || frame.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(frame.channels))) {
        throw new RangeError('Invalid replay frame');
    }
    const start = frame ? frame.until : from;
    if (!validTime(start) || !validTime(until) || start >= until) throw new RangeError('Invalid replay time range');

    const channels = new Map((frame?.channels ?? []).map(channel => [channelKey(channel), structuredClone(channel)]));
    let cursor;
    do {
        const page = await packets.readPage({
            domainId, from: new Date(start), until: new Date(until), limit: PAGE_SIZE, ...(cursor ? { cursor } : {})
        });
        for (const entry of page.items) {
            const packet = decodePublication(entry.packet);
            if (packet) applyPublication(channels, packet);
        }
        cursor = page.nextCursor;
    } while (cursor);

    return { schemaVersion: SCHEMA_VERSION, domainId, until, channels: [...channels.values()].sort((a, b) => channelKey(a) - channelKey(b)) };
}

module.exports = { buildReplayFrame };
