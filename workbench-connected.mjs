import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import express from 'express';
import WorkbenchBackups from './workbench-backups.mjs';
import { FileError } from './workbench-files.mjs';

const base = '/api/workbench/v1/connected';
const permissionIntervalMs = 15000;
const credentialPattern = /^([A-Za-z0-9_-]{1,200})\.[A-Za-z0-9_-]{43}$/;

export async function readConnectedConfig(path, addresses) {
  if (!path) return null;
  if (!isAbsolute(path)) throw new Error('--connected-config must be an absolute path');
  let settings;
  try { settings = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('Cannot read the connected Workbench configuration'); }
  const { origin, domain, credentials } = settings ?? {};
  let url;
  try { url = new URL(origin); } catch { throw new Error('Configure a canonical HTTPS cloud origin'); }
  if (url.origin !== origin || url.protocol !== 'https:' || typeof domain !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(domain)) {
    throw new Error('Configure a canonical HTTPS cloud origin and one Domain ID');
  }
  const links = Object.entries(addresses).filter(([, address]) => address !== undefined).map(([transport, address]) => {
    const credential = credentials?.[transport];
    if (typeof credential !== 'string' || !credentialPattern.test(credential)) throw new Error(`Missing or invalid ${transport} gateway credential`);
    return { transport, address, credential };
  });
  return { origin, domain, links, backupDirectory: join(dirname(path), 'workbench-backups') };
}

export default class ConnectedWorkbench {
  #settings;
  #key = randomBytes(18).toString('base64url');
  #mesh;
  #gatewayId;
  #backups;
  #backupAvailable = false;

  constructor(settings, mesh) {
    this.#settings = settings;
    this.#mesh = mesh;
    this.#gatewayId = credentialPattern.exec(settings.links[0].credential)[1];
  }

  get origin() { return this.#settings.origin; }

  announce() {
    console.log(`Connected Workbench for ${this.origin}, Domain ${this.#settings.domain}`);
    console.log(`Pairing key for this gateway process: ${this.#key}`);
  }

  #post(path, link, body) {
    return fetch(new URL(path, this.origin), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${link.credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: this.#settings.domain, id: link.address, ...body }),
    });
  }

  async verify(localHost) {
    const capabilities = await Promise.all(this.#settings.links.map(async link => {
      const response = await this.#post('/gateway/verify', link, {});
      if (!response.ok) throw new Error(`Cloud rejected ${link.transport} gateway association (${response.status})`);
      const { data } = await response.json();
      if (data?.domainId !== this.#settings.domain || data.nodeAddress !== link.address || !data.capabilities?.includes('telemetry')) {
        throw new Error('Cloud gateway association does not match the configured Domain and address');
      }
      return data.capabilities;
    }));
    const primary = this.#settings.links[0];
    this.#backupAvailable = capabilities[0].includes('file-backup');
    if (this.#backupAvailable) {
      try {
        this.#backups = new WorkbenchBackups(this.#settings.backupDirectory, [this.origin, this.#settings.domain, primary.address, localHost],
          async entry => {
            const response = await this.#post('/gateway/workbench/file-backups', primary, entry);
            return response.ok && (await response.json()).data?.status === 'saved';
          });
      } catch { console.error('The Workbench backup queue is unavailable. Check the gateway configuration directory.'); }
    }
  }

  close() { this.#backups?.close(); }

  relay(transport) {
    const link = this.#settings.links.find(link => link.transport === transport);
    return { domain: this.#settings.domain, cloudRelay: { url: this.origin, credential: link.credential } };
  }

  #pair(request) {
    const supplied = request.get('X-Workbench-Key');
    if (typeof supplied !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(supplied) || !timingSafeEqual(Buffer.from(this.#key), Buffer.from(supplied))) {
      throw new FileError(403, 'The local gateway pairing key is invalid.');
    }
  }

  async #authorize(grant, action, transport) {
    if (typeof grant !== 'string' || !/^[A-Za-z0-9_-]{40,2048}$/.test(grant)) throw new FileError(403, 'Cloud Workbench access is required.');
    let response;
    try {
      response = await this.#post('/gateway/workbench/authorize', this.#settings.links[0], { grant, action });
    } catch {
      throw new FileError(503, 'Could not verify cloud Workbench access.');
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) throw new FileError(503, 'Could not verify cloud Workbench access.');
      throw new FileError(403, 'Cloud Workbench access was denied or expired.');
    }
    const { data } = await response.json();
    if (data?.domainId !== this.#settings.domain || (action !== 'observe' && !data.canQuery)) throw new FileError(403, 'Current edit access is required.');
    const additional = this.#settings.links.slice(1).filter(link => transport === undefined || link.transport === transport);
    for (const link of additional) {
      const verified = await this.#post('/gateway/verify', link, {}).catch(() => null);
      if (!verified?.ok) throw new FileError(verified && verified.status < 500 ? 403 : 503, 'The second gateway credential could not be verified.');
    }
  }

  mount(app, { localHost, subscribe, available, files, catalogue, motherboard, i2c, nodeNetwork, traceRoute, parameterOperation }) {
    app.use(base, (req, res, next) => {
      if (req.get('host') !== localHost || req.get('origin') !== this.origin) return res.sendStatus(403);
      res.set({ 'Access-Control-Allow-Origin': this.origin, 'Cache-Control': 'no-store', Vary: 'Origin' });
      if (req.method === 'OPTIONS') {
        res.set({ 'Access-Control-Allow-Methods': 'GET, POST, PUT', 'Access-Control-Allow-Headers': 'Content-Type, X-Workbench-Key, X-Workbench-Grant' });
        return res.sendStatus(204);
      }
      if (!available()) return res.sendStatus(503);
      next();
    });
    const parse = express.json({ limit: '4kb', inflate: false });
    const handle = operation => async (req, res) => {
      try { this.#pair(req); await operation(req, res); }
      catch (error) {
        if (res.destroyed) return;
        if (!res.headersSent) res.status(error instanceof FileError ? error.status : 503).json({ error: error instanceof FileError ? error.message : 'Connected Workbench is unavailable.' });
        else res.end();
      }
    };
    app.get(`${base}/identity`, handle(async (_req, res) => {
      res.json({ domainId: this.#settings.domain, gatewayId: this.#gatewayId, fileBackups: this.#backupAvailable });
    }));
    app.get(`${base}/events`, handle(async (req, res) => {
      const grant = req.get('X-Workbench-Grant');
      await this.#authorize(grant, 'observe');
      if (res.destroyed || !subscribe(res, true)) return;
      let checking = false;
      const timer = setInterval(async () => {
        if (checking || res.destroyed) return;
        checking = true;
        try { await this.#authorize(grant, 'observe'); }
        catch (error) {
          if (!res.destroyed && error.status === 403) res.write('event: access-lost\ndata: {}\n\n');
          res.end();
        } finally { checking = false; }
      }, permissionIntervalMs);
      res.once('close', () => clearInterval(timer));
    }));
    const nodeAPI = `${base}/nodes/:node`;
    app.get(`${nodeAPI}/network`, handle(async (req, res) => {
      const grant = req.get('X-Workbench-Grant');
      await this.#authorize(grant, 'observe');
      if (res.destroyed) return;
      const result = await nodeNetwork(req.params.node, req.query.transport);
      await this.#authorize(grant, 'observe');
      res.json(result);
    }));
    const fileOperation = (status, operation, checkAfterRead = false) => handle(async (req, res) => {
      if (!this.#backupAvailable) throw new FileError(404, 'Connected node files require a backup-enabled gateway.');
      const { node } = req.params;
      const { transport, path } = req.query;
      if (!['wifi', 'serial'].includes(transport)) throw new FileError(400, 'Select a valid local transport.');
      const authorize = () => this.#authorize(req.get('X-Workbench-Grant'), 'node-files', transport);
      await authorize();
      if (res.destroyed) return;
      const result = await operation(node, transport, path, req.body, authorize);
      if (checkAfterRead) await authorize();
      res.status(status).json(result);
    });
    const fileBody = [ (req, res, next) => req.is('application/json') ? next() : res.sendStatus(415),
      express.json({ limit: '64kb', inflate: false }) ];
    const snapshot = async (node, operation, authorize) => {
      const file = await operation;
      if (authorize) await authorize();
      return { ...file, backup: this.#backups?.capture(node, file) ?? 'not-queued' };
    };
    const diagnosticBody = [fileBody[0], express.json({ limit: '1kb', inflate: false })];
    app.post(`${nodeAPI}/trace-route`, ...diagnosticBody, handle(async (req, res) => {
      const { transport } = req.query;
      if (!['wifi', 'serial'].includes(transport)) throw new FileError(400, 'Select a valid local transport.');
      const authorize = () => this.#authorize(req.get('X-Workbench-Grant'), 'query-value', transport);
      await authorize();
      if (res.destroyed) return;
      const result = await traceRoute(req.params.node, transport, req.body, res);
      if (res.destroyed) return;
      await authorize();
      res.json(result);
    }));
    app.post(`${nodeAPI}/i2c-scan`, ...diagnosticBody, fileOperation(200, (node, transport, _path, body) => i2c.scan(node, transport, body), true));
    app.post(`${nodeAPI}/i2c-register`, ...diagnosticBody, fileOperation(200, (node, transport, _path, body) => i2c.register(node, transport, body), true));
    app.get(`${nodeAPI}/motherboard`, fileOperation(200, motherboard, true));
    app.get(`${nodeAPI}/module-catalogue`, fileOperation(200, catalogue, true));
    app.get(`${nodeAPI}/files`, fileOperation(200, (node, transport, path) => files.list(node, transport, path), true));
    app.get(`${nodeAPI}/file`, fileOperation(200, (node, transport, path, _body, authorize) => snapshot(node, files.read(node, transport, path), authorize)));
    app.put(`${nodeAPI}/file`, ...fileBody, fileOperation(200, (node, transport, _path, body) => snapshot(node, files.upload(node, transport, body))));
    app.post(`${nodeAPI}/restart`, ...fileBody, fileOperation(202, (node, transport) => files.restart(node, transport)));
    app.get(`${nodeAPI}/backup-status`, fileOperation(200, node => this.#backups?.status(node) ?? { pending: 0, unavailable: true }));
    app.use(nodeAPI, (error, _req, res, _next) => {
      res.status(error.status || 400).json({ error: 'Invalid node file request body.' });
    });
    for (const [endpoint, action, authorization] of [
      ['parameter-write', 'write', 'write-parameter'], ['parameter-query', 'query-value', 'query-value'],
    ]) {
      app.post(`${nodeAPI}/${endpoint}`, ...diagnosticBody, handle(async (req, res) => {
        const { transport } = req.query;
        if (!['wifi', 'serial'].includes(transport) || Number(req.params.node) !== req.body?.target?.nodeAddress)
          throw new FileError(400, 'Select a valid local parameter and transport.');
        await this.#authorize(req.get('X-Workbench-Grant'), authorization, transport);
        if (!res.destroyed) res.status(202).json(parameterOperation(action, transport, req.body));
      }));
    }
    app.post(`${base}/query-value`, (req, res, next) => {
      if (!req.is('application/json')) return res.sendStatus(415);
      next();
    }, parse, handle(async (req, res) => {
      const { node, channel, parameter, transport } = req.body || {};
      const within = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
      if (!within(node, 1, 254) || !within(channel, 1, 254) || !within(parameter, 1, 63) || !['wifi', 'serial'].includes(transport)) {
        throw new FileError(400, 'Select a valid local parameter and transport.');
      }
      await this.#authorize(req.get('X-Workbench-Grant'), 'query-value', transport);
      if (res.destroyed) return;
      res.status(202).json(parameterOperation('query-value', transport, {
        target: { nodeAddress: node, channel, param: parameter },
      }));
    }));
  }
}
