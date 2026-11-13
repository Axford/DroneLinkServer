import { FileError } from './workbench-files.mjs';
import { deviceAddress, readDeviceJson } from './workbench-device-http.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const addressAllowed = n => integer(n, 8, 0x77);
const scanStatuses = new Set(['complete', 'selection-failed', 'timeout', 'bus-error', 'no-multiplexer']);
const readStatuses = new Set([...scanStatuses, 'nack', 'short-read']);

function validRegister(args) {
  if (!args || Object.keys(args).length !== 4 || !integer(args.channel, 0, 7)) return false;
  const { address, register, length } = args;
  return (address === 0x0d && register === 0x0d && length === 1) ||
    (integer(address, 0x40, 0x43) && [0xfe, 0xff].includes(register) && length === 2) ||
    (address === 0x76 && register === 0xd0 && length === 1);
}

function validateResult(data, args) {
  if (args) {
    if (!Object.entries(args).every(([name, value]) => data[name] === value) || !readStatuses.has(data.status) ||
        !Array.isArray(data.bytes) || data.bytes.some(byte => !integer(byte, 0, 255))) return;
    if (data.status === 'complete' ? data.bytes.length !== args.length :
        data.status === 'short-read' ? data.bytes.length >= args.length : data.bytes.length !== 0) return;
    return { ...args, status: data.status, bytes: data.bytes };
  }
  if (![0, 0x70, 0x77].includes(data.multiplexer) || !Array.isArray(data.channels) || data.channels.length !== 8 || !data.channels.every((channel, index) =>
    channel?.channel === index && scanStatuses.has(channel.status) && Array.isArray(channel.addresses) &&
    channel.addresses.every(address => addressAllowed(address) && address !== data.multiplexer) && new Set(channel.addresses).size === channel.addresses.length &&
    (!['selection-failed', 'no-multiplexer'].includes(channel.status) || channel.addresses.length === 0))) return;
  if (data.channels.some(channel => (channel.status === 'no-multiplexer') !== (data.multiplexer === 0))) return;
  return { multiplexer: data.multiplexer, channels: data.channels.map(({ channel, status, addresses }) => ({ channel, status, addresses })) };
}

export default function createI2cDiagnostics(mesh, fetchNode = fetch) {
  const active = new Set();
  async function run(requestedNode, transport, args) {
    const node = Number(requestedNode);
    if (!/^\d+$/.test(requestedNode) || !integer(node, 1, 254) || !['wifi', 'serial'].includes(transport)) {
      throw new FileError(400, 'Select a valid node and transport.');
    }
    const address = deviceAddress(mesh, node, transport);
    if (!address) throw new FileError(503, 'I²C diagnostics require a direct Wi-Fi route to this node.');
    if (active.has(address) || active.size >= 8) throw new FileError(409, 'I²C diagnostics are busy. Try again shortly.');
    active.add(address);
    const signal = AbortSignal.timeout(10000);
    const assertRoute = () => {
      if (address !== deviceAddress(mesh, node, transport)) throw new FileError(503, 'The selected route changed during I²C diagnostics.');
    };
    const query = new URLSearchParams({ node, op: args ? 'register' : 'scan', ...args });
    const request = async (queryString, method) => {
      assertRoute();
      return readDeviceJson(fetchNode, address, '/i2cDiagnostic?' + queryString, { method, signal, headers: { 'X-DroneLink-Diagnostic': '1' } });
    };
    try {
      const first = await request(query, 'POST');
      const { job } = first.data;
      const check = data => data?.schemaVersion === 1 && data.node === node && data.job === job;
      if (first.status !== 202 || !integer(job, 1, 0xffffffff) || !check(first.data)) throw new Error('Invalid diagnostic receipt');
      while (true) {
        await delay(180, undefined, { signal });
        const { data, status } = await request(new URLSearchParams({ job }), 'GET');
        if (status === 503) continue;
        if (!check(data)) throw new Error('Invalid diagnostic receipt');
        if (status === 202) continue;
        const result = status === 200 && validateResult(data, args);
        if (!result) throw new Error('Invalid diagnostic result');
        assertRoute();
        return { schemaVersion: 1, node, receivedAt: Date.now(), ...result };
      }
    } catch (error) {
      if (error instanceof FileError) throw error;
      if (signal.aborted) throw new FileError(504, 'The node did not finish the I²C diagnostic in time.');
      throw new FileError(502, 'The node returned an invalid I²C diagnostic response.');
    } finally {
      active.delete(address);
    }
  }
  return {
    scan(node, transport, body) {
      if (!body || Object.keys(body).length || Array.isArray(body)) throw new FileError(400, 'Send an empty object to start a scan.');
      return run(node, transport);
    },
    register(node, transport, body) {
      if (!validRegister(body)) throw new FileError(400, 'Choose a reviewed I²C register read.');
      return run(node, transport, body);
    },
  };
}
