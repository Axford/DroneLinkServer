const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const version = '8.0.34';
const cache = path.resolve(__dirname, '../.cache/mongodb');
const prepare = process.argv.includes('--prepare');
for (const key of Object.keys(process.env)) {
  if (key.startsWith('MONGOMS_')) throw new Error(`Remove ${key}: disposable tests use their pinned owned MongoDB process`);
}
Object.assign(process.env, { MONGOMS_VERSION: version, MONGOMS_DOWNLOAD_DIR: cache,
  MONGOMS_RUNTIME_DOWNLOAD: prepare ? 'true' : 'false', MONGOMS_PREFER_GLOBAL_PATH: 'false' });
const { MongoMemoryServer, MongoBinary } = require('mongodb-memory-server-core');
async function withMongo(run) {
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'dronelink-mongo-'));
  const server = new MongoMemoryServer({ binary: { version, downloadDir: cache },
    instance: { ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' } });
  try {
    await server.start();
    return await run(server.getUri(), server);
  } finally {
    await server.stop({ doCleanup: true, force: true });
    fs.rmSync(dbPath, { recursive: true, force: true });
  }
}
async function prepareBinary() {
  const binary = await MongoBinary.getPath({ version, downloadDir: cache });
  const description = execFileSync(binary, ['--version'], { encoding: 'utf8' });
  if (!description.includes(`v${version}`)) throw new Error('Unexpected MongoDB binary version');
  const metadata = { version, platform: process.platform, arch: process.arch,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'), description };
  fs.writeFileSync(path.join(cache, 'provenance.json'), JSON.stringify(metadata, null, 2) + '\n');
  await withMongo(async () => console.log(`PASS: prepared and started MongoDB ${version} (${process.platform}/${process.arch})`));
}
if (require.main === module) {
  prepareBinary().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { withMongo, version };
