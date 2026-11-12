import { once } from 'node:events';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import express from 'express';
import WorkbenchMesh from './workbench-mesh.mjs';

const host = '127.0.0.1';
const heartbeatIntervalMs = 15000;
const maxStreams = 16;

function readInteger(value, label, min, max) {
  const number = Number(value);
  if (!/^\d+$/.test(value ?? '') || number < min || number > max) {
    throw new Error(`${label} must be an integer from ${min} through ${max}`);
  }
  return number;
}

function writeEvent(response, event, payload) {
  if (response.destroyed || response.writableEnded) return;
  const frame = event ? `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n` : ': heartbeat\n\n';
  if (!response.write(frame)) response.destroy();
}

async function start() {
  const { values } = parseArgs({ options: {
    'client-build': { type: 'string' }, 'node-address': { type: 'string' },
    port: { type: 'string', default: '8002' },
    'serial-port': { type: 'string' }, 'serial-address': { type: 'string' }, 'serial-only': { type: 'boolean' },
  } });
  const node = readInteger(values['node-address'], '--node-address', 1, 254);
  const serialPort = values['serial-port'];
  const serialOnly = values['serial-only'];
  if (serialPort !== undefined && !serialPort.trim()) throw new Error('--serial-port must name a serial device');
  if (serialOnly && !serialPort) throw new Error('--serial-only requires --serial-port');
  if (values['serial-address'] !== undefined && (!serialPort || serialOnly)) throw new Error('--serial-address is for dual mode');
  const udpAddress = serialOnly ? undefined : node;
  const serialAddress = serialOnly ? node : serialPort ? readInteger(values['serial-address'], '--serial-address', 1, 254) : undefined;
  if (serialAddress === udpAddress) throw new Error('Wi-Fi and serial must use different mesh addresses');
  const port = readInteger(values.port, '--port', 1, 65535);
  const build = values['client-build'];
  if (!build || !isAbsolute(build)) throw new Error('--client-build must point to an absolute, verified Client build directory');
  const entry = join(build, 'index.html');
  const [html, assets] = await Promise.all([stat(entry), stat(join(build, 'static'))]).catch(() => []);
  if (!html?.isFile() || !assets?.isDirectory()) throw new Error(`Client build is incomplete at ${build}`);

  const origin = new URL(`http://${host}:${port}`);
  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const streams = new Map();
  const mesh = new WorkbenchMesh((event, enhanced, legacy) => {
    for (const [response, diagnostics] of streams) {
      const payload = diagnostics ? enhanced : legacy;
      if (payload !== null) writeEvent(response, event, payload);
    }
  });
  let ready = false;
  let heartbeatTimer;
  let stopping = false;

  app.use((request, response, next) => {
    const requestOrigin = request.get('origin');
    const fetchSite = request.get('sec-fetch-site');
    if (request.get('host') !== origin.host || (requestOrigin && requestOrigin !== origin.origin) ||
        (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')) return response.sendStatus(403);
    response.set('Content-Security-Policy', "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') return response.sendStatus(405);
    next();
  });
  app.head('/api/workbench/v1/events', (_request, response) => response.sendStatus(405));
  app.get('/api/workbench/v1/events', (request, response) => {
    if (!ready || streams.size >= maxStreams) return response.sendStatus(503);
    const enhanced = request.query.diagnostics === '1';
    response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    response.on('close', () => streams.delete(response));
    mesh.refresh();
    streams.set(response, enhanced);
    writeEvent(response, 'snapshot', mesh.snapshot(enhanced));
  });
  app.get('/workbench/', (_request, response) => response.sendFile(entry));
  app.use(express.static(build, { index: false, redirect: false }));

  function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeatTimer);
    mesh.close();
    for (const response of streams.keys()) response.end();
    server.close();
    server.closeAllConnections();
  }

  try {
    server.listen(port, host);
    await once(server, 'listening');
    await mesh.start({ udpAddress, serialAddress, serialPort });
    ready = true;
    heartbeatTimer = setInterval(() => {
      for (const response of streams.keys()) writeEvent(response);
    }, heartbeatIntervalMs);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    console.log(`Workbench available at ${origin.origin}/workbench/`);
  } catch (error) {
    stop();
    throw error;
  }
}

start().catch(error => {
  console.error(`Workbench could not start: ${error.message}`);
  process.exitCode = 1;
});
