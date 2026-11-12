import { once } from 'node:events';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import express from 'express';
import DroneLinkManager from './public/modules/DroneLinkManager.mjs';
import UDPInterface from './public/modules/UDPInterface.mjs';
import { DRONE_LINK_MSG_TYPE_NAME } from './public/modules/droneLinkMsg.mjs';

const host = '127.0.0.1';
const snapshotIntervalMs = 250;
const heartbeatIntervalMs = 15000;
const maxStreams = 16;

function readInteger(value, label, min, max) {
  const number = Number(value);
  if (!/^\d+$/.test(value ?? '') || number < min || number > max) {
    throw new Error(`${label} must be an integer from ${min} through ${max}`);
  }
  return number;
}

function activeRoutes(manager) {
  const routes = new Map();
  for (const { heard, node, nextHop, lastHeard } of Object.values(manager.routeMap)) {
    if (heard && node >= 1 && node <= 254 && nextHop >= 1 && nextHop <= 254) {
      routes.set(node, { node, nextHop, lastHeardAtMs: lastHeard });
    }
  }
  return routes;
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
  } });
  const node = readInteger(values['node-address'], '--node-address', 1, 254);
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
  const streams = new Set();
  let manager;
  let udp;
  let routes = new Map();
  let routeTimer;
  let heartbeatTimer;
  let stopping = false;

  function broadcast(event, payload) {
    for (const response of streams) writeEvent(response, event, payload);
  }

  function refreshRoutes() {
    const next = activeRoutes(manager);
    for (const [id, previous] of routes) {
      if (!next.has(id)) broadcast('route', { ...previous, reachable: false });
    }
    for (const [id, route] of next) {
      const previous = routes.get(id);
      if (previous?.nextHop !== route.nextHop || previous?.lastHeardAtMs !== route.lastHeardAtMs) {
        broadcast('route', { ...route, reachable: true });
      }
    }
    routes = next;
  }

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
  app.get('/api/workbench/v1/events', (_request, response) => {
    if (!manager || !udp?.state || streams.size >= maxStreams) return response.sendStatus(503);
    response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    response.on('close', () => streams.delete(response));
    refreshRoutes();
    streams.add(response);
    writeEvent(response, 'snapshot', { routes: [...routes.values()] });
  });
  app.get('/workbench/', (_request, response) => response.sendFile(entry));
  app.use(express.static(build, { index: false, redirect: false }));

  function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(routeTimer);
    clearInterval(heartbeatTimer);
    manager?.stop();
    for (const response of streams) response.end();
    server.close();
    server.closeAllConnections();
    if (udp?.state) udp.server.close();
  }

  function transportFailure(error) {
    console.error(`Workbench UDP port 8007: ${error.message}`);
    process.exitCode = 1;
    stop();
  }

  try {
    server.listen(port, host);
    await once(server, 'listening');
    manager = new DroneLinkManager(node, console.log);
    manager.logOptions.Hello = false;
    manager.logOptions.DroneLinkMsg = false;
    manager.observeLinkMessage = (message, receivedAtMs) => {
      if (message.msgType > DRONE_LINK_MSG_TYPE_NAME || streams.size === 0) return;
      refreshRoutes();
      if (!routes.has(message.node)) return;
      const packetBase64 = Buffer.from(message.encodeUnframed()).toString('base64');
      broadcast('observation', { packetBase64, receivedAtMs });
    };
    udp = new UDPInterface(manager, 1, console.log);
    await once(udp.server, 'listening');
    udp.server.on('error', transportFailure);
    udp.server.on('close', () => { if (!stopping) transportFailure(new Error('Socket closed')); });
    routeTimer = setInterval(refreshRoutes, snapshotIntervalMs);
    heartbeatTimer = setInterval(() => broadcast(), heartbeatIntervalMs);
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
