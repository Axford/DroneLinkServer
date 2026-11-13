import { once } from 'node:events';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import express from 'express';
import WorkbenchMesh from './workbench-mesh.mjs';
import WorkbenchFiles, { FileError } from './workbench-files.mjs';
import ConnectedWorkbench, { readConnectedConfig } from './workbench-connected.mjs';

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
    'connected-config': { type: 'string' },
    'serial-port': { type: 'string' }, 'serial-address': { type: 'string' }, 'serial-only': { type: 'boolean' },
  } });
  const mapboxAccessToken = process.env.DRONELINK_WORKBENCH_MAPBOX_TOKEN?.trim();
  if (mapboxAccessToken && !/^pk\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(mapboxAccessToken)) {
    throw new Error('DRONELINK_WORKBENCH_MAPBOX_TOKEN must be a public Mapbox token.');
  }
  const mapOrigins = mapboxAccessToken
    ? 'https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com'
    : 'https://tile.openstreetmap.org';
  const node = readInteger(values['node-address'], '--node-address', 1, 254);
  const serialPort = values['serial-port'];
  const serialOnly = values['serial-only'];
  if (serialPort !== undefined && !serialPort.trim()) throw new Error('--serial-port must name a serial device');
  if (serialOnly && !serialPort) throw new Error('--serial-only requires --serial-port');
  if (values['serial-address'] !== undefined && (!serialPort || serialOnly)) throw new Error('--serial-address is for dual mode');
  const udpAddress = serialOnly ? undefined : node;
  const serialAddress = serialOnly ? node : serialPort ? readInteger(values['serial-address'], '--serial-address', 1, 254) : undefined;
  if (serialAddress === udpAddress) throw new Error('Wi-Fi and serial must use different mesh addresses');
  const connectedConfig = await readConnectedConfig(values['connected-config'], { wifi: udpAddress, serial: serialAddress });
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
  const files = new WorkbenchFiles(mesh);
  const connected = connectedConfig ? new ConnectedWorkbench(connectedConfig, mesh) : null;
  let ready = false;
  let heartbeatTimer;
  let stopping = false;

  function subscribe(response, enhanced) {
    if (!ready || streams.size >= maxStreams) {
      response.sendStatus(503);
      return false;
    }
    response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    response.on('close', () => streams.delete(response));
    mesh.refresh();
    streams.set(response, enhanced);
    writeEvent(response, 'snapshot', mesh.snapshot(enhanced));
    return true;
  }

  connected?.mount(app, { localHost: origin.host, subscribe, available: () => ready, files });

  app.use((request, response, next) => {
    const requestOrigin = request.get('origin');
    const fetchSite = request.get('sec-fetch-site');
    // A hosted Workbench shortcut may navigate to this document. Keep API and asset requests same-origin.
    const workbenchNavigation = request.method === 'GET' && /^\/workbench\/?$/.test(request.path) &&
      request.get('sec-fetch-mode') === 'navigate' && request.get('sec-fetch-dest') === 'document';
    if (request.get('host') !== origin.host || (requestOrigin && requestOrigin !== origin.origin) ||
        (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none' && !workbenchNavigation)) return response.sendStatus(403);
    response.set('Content-Security-Policy', `default-src 'self'; connect-src 'self' ${mapOrigins}; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${mapOrigins}; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`);
    response.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const fileMutation = /^\/api\/workbench\/v1\/nodes\/\d+\/(file|restart)$/.test(request.path);
      if (!fileMutation || !['PUT', 'POST'].includes(request.method)) return response.sendStatus(405);
      if (requestOrigin !== origin.origin) return response.sendStatus(403);
      if (!request.is('application/json')) return response.sendStatus(415);
    }
    next();
  });
  app.get('/api/workbench/v1/map-config', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ mapboxAccessToken: mapboxAccessToken || null });
  });
  app.head('/api/workbench/v1/events', (_request, response) => response.sendStatus(405));
  app.get('/api/workbench/v1/events', (request, response) => {
    subscribe(response, request.query.diagnostics === '1');
  });
  const nodeAPI = '/api/workbench/v1/nodes/:node';
  const json = express.json({ limit: '64kb', inflate: false });
  const handleFile = (status, operation) => async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!ready) return response.status(503).json({ error: 'The Workbench is starting.' });
    try {
      const { node } = request.params;
      const { transport, path } = request.query;
      const result = await operation(node, transport, path, request.body);
      response.status(status).json(result);
    } catch (error) {
      if (error instanceof FileError) return response.status(error.status).json({ error: error.message });
      console.error('Unexpected Workbench file error:', error);
      response.status(500).json({ error: 'The node file operation failed.' });
    }
  };
  app.get(`${nodeAPI}/files`, handleFile(200, (node, transport, path) => files.list(node, transport, path)));
  app.get(`${nodeAPI}/file`, handleFile(200, (node, transport, path) => files.read(node, transport, path)));
  app.put(`${nodeAPI}/file`, json, handleFile(200, (node, transport, _path, body) => files.upload(node, transport, body)));
  app.post(`${nodeAPI}/restart`, json, handleFile(202, (node, transport) => files.restart(node, transport)));
  app.use(nodeAPI, (error, _request, response, _next) => {
    response.set('Cache-Control', 'no-store').status(error.status || 400).json({ error: 'Invalid node file request body.' });
  });
  app.get('/workbench/', (_request, response) => response.sendFile(entry));
  app.use(express.static(build, { index: false, redirect: false }));

  function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeatTimer);
    connected?.close();
    mesh.close();
    for (const response of streams.keys()) response.end();
    server.close();
    server.closeAllConnections();
  }

  try {
    server.listen(port, host);
    await once(server, 'listening');
    await connected?.verify(origin.host);
    await mesh.start({ udpAddress, serialAddress, serialPort, connected });
    ready = true;
    heartbeatTimer = setInterval(() => {
      for (const response of streams.keys()) writeEvent(response);
    }, heartbeatIntervalMs);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    console.log(`Workbench available at ${origin.origin}/workbench/`);
    connected?.announce();
  } catch (error) {
    stop();
    throw error;
  }
}

start().catch(error => {
  console.error(`Workbench could not start: ${error.message}`);
  process.exitCode = 1;
});
