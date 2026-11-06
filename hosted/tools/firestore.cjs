#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const JAR = path.resolve(__dirname, '../.cache/cloud-firestore-emulator-v1.22.0.jar');
const SHA256 = '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c';
const URL = 'https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar';
async function verify() {
  const bytes = await fs.readFile(JAR).catch(() => { throw Error('Prepare the emulator explicitly: npm run test:firestore:prepare'); });
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== SHA256) throw Error('Emulator digest mismatch; prepare the pinned artifact again');
}
async function prepare(from) {
  const bytes = from ? await fs.readFile(from) : Buffer.from(await (await fetch(URL)).arrayBuffer());
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== SHA256) throw Error('Emulator download/source digest mismatch');
  await fs.mkdir(path.dirname(JAR), { recursive: true });
  await fs.writeFile(JAR, bytes);
  console.log('Prepared Firestore emulator 1.22.0: ' + SHA256);
}
async function withFirestore(run) {
  await verify();
  const server = net.createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const projectId = 'demo-sep06-' + crypto.randomBytes(6).toString('hex');
  const child = spawn('java', ['-jar', JAR, '--host=127.0.0.1', '--port=' + port, '--project_id=' + projectId, '--single_project_mode', '--single_project_mode_error'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  let output = ''; child.stdout.on('data', b => { output = (output + b).slice(-4000); }); child.stderr.on('data', b => { output = (output + b).slice(-4000); });
  let stopping;
  const stop = () => stopping ||= (async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await closed; } finally { clearTimeout(timeout); }
  })();
  try {
    const deadline = Date.now() + 30000;
    while (true) {
      if (child.exitCode !== null) throw Error('Emulator exited: ' + output);
      const ready = await new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port });
        socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false));
      });
      if (ready) break;
      if (Date.now() > deadline) throw Error('Emulator startup timed out: ' + output);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return await run({ projectId, emulatorHost: '127.0.0.1:' + port }, { stop });
  } finally {
    await stop();
  }
}
module.exports = { withFirestore, prepare };
if (require.main === module) {
  if (process.argv[2] !== '--prepare') { console.error('Use --prepare [--from /explicit/cached.jar]'); process.exitCode = 1; }
  else prepare(process.argv[3] === '--from' ? process.argv[4] : undefined).catch(e => { console.error(e.message); process.exitCode = 1; });
}
