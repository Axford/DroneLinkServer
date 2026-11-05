/** One startup snapshot owns release availability, HTTP assets and distribution. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyRelease, serverRoot } from './release.mjs';

export function loadGatewayRelease(config, root = serverRoot) {
  const migration = config.firmwarePath ? 'Obsolete firmwarePath is ignored; configure releaseDir.' : '';
  try {
    if (!config.releaseDir) throw new Error('No release configured');
    if (typeof config.releaseDir !== 'string') throw new Error('releaseDir must be a directory path');
    const directory = path.resolve(root, config.releaseDir);
    const manifest = verifyRelease(directory);
    // Read after verification, then hash a second time to reject a changing input.
    const assets = new Map(Object.keys(manifest.files).map(name => [name, fs.readFileSync(path.join(directory, name))]));
    for (const [name, bytes] of assets) {
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.files[name]) throw new Error('Release changed while loading');
    }
    if (verifyRelease(directory).identity !== manifest.identity) throw new Error('Release selection changed while loading');
    const status = Object.freeze({ available: true, identity: manifest.identity, warning: migration });
    return { status, directory, assets, firmware: { image: assets.get('firmware.bin'), path: path.join(directory, 'firmware.bin') } };
  } catch (error) {
    return { status: Object.freeze({ available: false, warning: `${error.message}. Firmware distribution, module metadata and generated help are unavailable.${migration ? ' ' + migration : ''}` }), assets: new Map(), firmware: null };
  }
}
export function mountReleaseRoutes(app, release) {
  app.get('/release-status', (_req, res) => res.set('Cache-Control', 'no-store').json(release.status));
  app.use((req, res, next) => {
    let pathname;
    try { pathname = path.posix.normalize(decodeURIComponent(req.path)); }
    catch { return res.status(400).type('text').send('Invalid release URL'); }
    const lower = pathname.toLowerCase();
    let name;
    if (lower === '/moduleinfo.json') name = 'moduleInfo.json';
    else if (lower === '/firmware') name = 'firmware.bin';
    else if (lower === '/firmware' + '/' || lower.startsWith('/firmware/')) name = pathname.slice(10);
    else if (lower === '/help' || lower === '/help/') name = 'help/index.html';
    else if (lower.startsWith('/help/')) name = pathname.slice(1);
    else return next();
    res.set('Cache-Control', 'no-store');
    if (!release.status.available) return res.status(503).type('text').send(release.status.warning);
    const bytes = release.assets.get(name);
    if (!bytes) return res.status(404).type('text').send('Release asset not found');
    res.type(name.endsWith('.json') ? 'json' : name.endsWith('.html') ? 'html' : name.endsWith('.ver') ? 'text' : 'application/octet-stream').send(bytes);
  });
}
export function applyReleaseToTerminal(status, warningBox, buttons) {
  warningBox.setContent(status.warning || '');
  if (status.warning) warningBox.show(); else warningBox.hide();
  for (const button of buttons) {
    button.disabled = !status.available;
    button.style.bg = status.available ? 'blue' : 'gray';
  }
}
