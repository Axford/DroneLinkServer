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
    const reassigned = Boolean(moduleType && state?.moduleType && state.moduleType !== moduleType);
    if (!state || reassigned) {
        state = { nodeAddress: node, channel, params: {} };
        channels.set(key, state);
    }
    if (moduleType) state.moduleType = moduleType;

    const facets = state.params[param] ||= {};
    if (msgType === DRONE_LINK_MSG_TYPE_NAME) facets.name = { payload };
    else facets.value = { msgType, payload };
    return reassigned;
}

function decodeState(domainId, until, payload) {
    return { schemaVersion: SCHEMA_VERSION, domainId, until, channels: payload ? JSON.parse(payload.toString('utf8')) : [] };
}

const encodeState = frame => Buffer.from(JSON.stringify(frame.channels));

async function replayPage(packets, { domainId, from, until, cursor, limit = PAGE_SIZE }) {
    const page = await packets.readPage({
        domainId, from: new Date(from), until: new Date(until), limit, ...(cursor ? { cursor } : {})
    });
    const publications = page.items.flatMap(entry => {
        const packet = decodePublication(entry.packet);
        return packet ? [{ at: entry.time.getTime(), packet }] : [];
    });
    return { publications, nextCursor: page.nextCursor, lastReceipt: page.items.at(-1)?.time.getTime() };
}

function advanceReplayFrame(frame, publications, until) {
    const channels = new Map(frame.channels.map(channel => [channelKey(channel), structuredClone(channel)]));
    for (const { packet } of publications) applyPublication(channels, packet);
    return { ...frame, until, channels: [...channels.values()].sort((a, b) => channelKey(a) - channelKey(b)) };
}

async function advanceReplayStep(frame, page, until, boundaryAt, saveBoundary) {
    const channels = new Map(frame.channels.map(channel => [channelKey(channel), structuredClone(channel)]));
    const state = cutoff => ({
        ...frame, until: cutoff, channels: [...channels.values()].sort((a, b) => channelKey(a) - channelKey(b))
    });
    async function completeBoundary() {
        await saveBoundary(boundaryAt + 1, encodeState(state(boundaryAt + 1)));
        boundaryAt = null;
    }
    for (const { at, packet } of page.publications) {
        if (boundaryAt !== null && at > boundaryAt) await completeBoundary();
        if (applyPublication(channels, packet)) boundaryAt = at;
    }
    if (boundaryAt !== null && (!page.nextCursor || page.lastReceipt > boundaryAt)) await completeBoundary();
    return { frame: state(until), boundaryAt };
}

// Trusted backend call. The start is inclusive and the cutoff is exclusive.
async function buildReplayFrame(packets, { domainId, from, until, frame }) {
    if (frame && (from !== undefined || frame.domainId !== domainId || frame.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(frame.channels))) throw new RangeError('Invalid replay frame');
    const start = frame ? frame.until : from;
    if (!validTime(start) || !validTime(until) || start >= until) throw new RangeError('Invalid replay time range');

    let current = frame || decodeState(domainId, start, null);
    let cursor;
    do {
        const page = await replayPage(packets, { domainId, from: start, until, cursor });
        current = advanceReplayFrame(current, page.publications, until);
        cursor = page.nextCursor;
    } while (cursor);
    return current;
}

module.exports = { buildReplayFrame, replayPage, advanceReplayFrame, advanceReplayStep, encodeState, decodeState };
