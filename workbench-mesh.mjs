import { EventEmitter, once } from 'node:events';
import { FileError } from './workbench-files.mjs';
import DroneLinkManager from './public/modules/DroneLinkManager.mjs';
import UDPInterface from './public/modules/UDPInterface.mjs';
import SerialInterface from './public/modules/SerialInterface.mjs';
import { DRONE_LINK_MSG_TYPE_NAME } from './public/modules/droneLinkMsg.mjs';

const intervalMs = 250;

function validAddress(address) {
  return Number.isInteger(address) && address >= 1 && address <= 254;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bareRoute({ node, nextHop, lastHeardAtMs }) {
  return { node, nextHop, lastHeardAtMs };
}

export default class WorkbenchMesh {
  #paths = new Map();
  #selected = new Map();
  #interfaces = new Map();
  #links = [];
  #timer;
  #emit;

  constructor(emit) {
    this.#emit = emit;
  }

  async start({ udpAddress, serialAddress, serialPort, connected }) {
    if (udpAddress) {
      const udp = this.#createLink('wifi', udpAddress, serialAddress, connected, manager => new UDPInterface(manager, 1, console.log));
      await once(udp.server, 'listening');
    }
    if (serialAddress) {
      this.#createLink('serial', serialAddress, udpAddress, connected, manager => new SerialInterface(manager, 2, console.log, serialPort, undefined, text => {
        this.#emit('diagnostic', { text, receivedAtMs: Date.now() }, null);
      }));
    }
    this.refresh();
    this.#timer = setInterval(() => this.refresh(), intervalMs);
  }

  #createLink(transport, address, otherAddress, connected, makeInterface) {
    const relay = connected?.relay(transport);
    const manager = new DroneLinkManager(address, console.log, relay?.domain, undefined, relay?.cloudRelay);
    manager.otherWorkbenchAddress = otherAddress;
    manager.logOptions.Hello = false;
    manager.logOptions.DroneLinkMsg = false;
    const events = new EventEmitter();
    manager.io = events;
    const link = { transport, address, manager, events, adapter: undefined, wasUp: false };
    this.#links.push(link);
    link.adapter = makeInterface(manager);
    manager.observeLinkMessage = (message, receivedAtMs) => {
      if (message.msgType > DRONE_LINK_MSG_TYPE_NAME) return;
      this.refresh();
      if (!this.#paths.has(`${message.node}:${transport}`)) return;
      const reading = { packetBase64: Buffer.from(message.encodeUnframed()).toString('base64'), receivedAtMs };
      this.#emit('observation', { ...reading, transport }, this.#selected.get(message.node)?.transport === transport ? reading : null);
    };
    return link.adapter;
  }

  refresh() {
    const paths = new Map();
    const selected = new Map();
    for (const link of this.#links) {
      const { transport, address, manager, adapter } = link;
      if (!adapter) continue;
      if (link.wasUp && !adapter.state) {
        // The next connection must establish new routes and subscriptions.
        manager.routeMap = {};
        manager.txQueue = [];
      }
      link.wasUp = adapter.state;
      const status = {
        transport, address, up: adapter.state, error: adapter.errorMsg,
        received: adapter.packetsReceived, rejected: adapter.packetsRejected, sent: adapter.packetsSent,
        bytesReceived: adapter.bytesReceived,
        ...(transport === 'serial' ? { port: adapter.portName, diagnosticRecords: adapter.diagnosticRecords, diagnosticRejected: adapter.diagnosticRejected } : {}),
      };
      if (!same(this.#interfaces.get(transport), status)) {
        this.#interfaces.set(transport, status);
        this.#emit('interface', status, null);
      }
      if (!adapter.state) continue;
      for (const { heard, node, nextHop, lastHeard, metric, uptime } of Object.values(manager.routeMap)) {
        if (!heard || !validAddress(node) || !validAddress(nextHop)) continue;
        const path = { node, nextHop, lastHeardAtMs: lastHeard, transport, metric, uptimeMs: uptime >= 0 ? uptime : undefined };
        paths.set(`${node}:${transport}`, path);
        const best = selected.get(node);
        // Lower mesh cost wins. Preserve an existing selection on equal cost.
        if (!best || metric < best.metric || (metric === best.metric && this.#selected.get(node)?.transport === transport)) {
          selected.set(node, path);
        }
      }
    }
    this.#publishChanges('path', this.#paths, paths, () => null);
    this.#publishChanges('route', this.#selected, selected, (route, reachable) => ({ ...bareRoute(route), reachable }));
    this.#paths = paths;
    this.#selected = selected;
  }

  #publishChanges(event, previous, next, legacy) {
    for (const [key, path] of previous) {
      if (!next.has(key)) this.#emit(event, { ...path, reachable: false }, legacy(path, false));
    }
    for (const [key, path] of next) {
      const old = previous.get(key);
      if (event === 'route' && old && old.transport !== path.transport) {
        this.#emit(event, null, legacy(old, false));
      }
      if (!same(old, path)) this.#emit(event, { ...path, reachable: true }, legacy(path, true));
    }
  }

  snapshot(enhanced) {
    const routes = [...this.#selected.values()];
    if (!enhanced) return { routes: routes.map(bareRoute) };
    return { routes, paths: [...this.#paths.values()], interfaces: [...this.#interfaces.values()] };
  }

  fileRoute(node, transport) {
    const link = this.#links.find(link => link.transport === transport);
    const assertAvailable = () => {
      this.refresh();
      const route = link?.manager.getNodeInfo(node, false);
      if (!link?.adapter.state || !this.#paths.has(`${node}:${transport}`) || route?.netInterface !== link.adapter) {
        throw new FileError(503, 'The selected local route is unavailable.');
      }
      return route;
    };
    assertAvailable();
    return { manager: link.manager, events: link.events, assertAvailable };
  }

  close() {
    clearInterval(this.#timer);
    for (const { manager, adapter, transport } of this.#links) {
      manager.stop();
      if (transport === 'serial') adapter?.close();
      else if (adapter?.state) adapter.server.close();
    }
  }
}
