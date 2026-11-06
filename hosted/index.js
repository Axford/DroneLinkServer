const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { openFirestoreStore } = require('@dronelink/persistence');
const { createApp } = require('./app');
const { resolveClientBuildDir } = require('./lib/clientHosting');

function loadConfig(serviceDir = __dirname) {
    const filename = path.join(serviceDir, 'config.json');
    const local = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
    const values = { port: Number(process.env.PORT || local.port || 8003),
        projectId: process.env.GOOGLE_CLOUD_PROJECT || local.projectId,
        databaseId: process.env.FIRESTORE_DATABASE || local.databaseId || '(default)',
        publicOrigin: process.env.PUBLIC_ORIGIN || local.publicOrigin,
        googleClientID: process.env.GOOGLE_CLIENT_ID || local.googleClientID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || local.googleClientSecret,
        cookieKey: process.env.SESSION_SECRET || local.cookieKey,
        mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN || local.mapboxAccessToken,
        clientBuildDir: process.env.CLIENT_BUILD_DIR || local.clientBuildDir };
    if (!values.projectId || !values.publicOrigin || !values.googleClientID || !values.googleClientSecret || !values.cookieKey || values.cookieKey.length < 32) throw new Error('Hosted configuration is incomplete');
    const origin = new URL(values.publicOrigin);
    if (origin.origin !== values.publicOrigin || !['http:', 'https:'].includes(origin.protocol)) throw new Error('Invalid public origin');
    return values;
}

async function startHosted({ config, storeFactory = openFirestoreStore, appFactory = createApp, shutdownGraceMs = 10000 }) {
    resolveClientBuildDir(config.clientBuildDir);
    const store = await storeFactory({ projectId: config.projectId, databaseId: config.databaseId, ...(config.emulatorHost ? { emulatorHost: config.emulatorHost } : {}) });
    let server;
    try {
        await store.access.getControl();
        const app = appFactory({ config, store });
        server = http.createServer(app);
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(config.port, () => { server.off('error', reject); resolve(); });
        });
    } catch (error) {
        server?.closeAllConnections();
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        await store.close();
        throw error;
    }
    let closing;
    const close = () => {
        closing ||= (async () => {
            const deadline = setTimeout(() => server.closeAllConnections(), shutdownGraceMs);
            deadline.unref();
            try {
                const drained = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
                await Promise.all([drained, store.close()]);
            } finally { clearTimeout(deadline); }
        })();
        return closing;
    };
    return { server, store, close };
}

if (require.main === module) {
    (async () => {
        const config = loadConfig();
        if (!config) { process.exitCode = 1; return; }
        const service = await startHosted({ config });
        console.log(`Hosted server listening on port ${service.server.address().port}`);
        let stopping = false;
        const shutdown = async () => {
            if (stopping) return;
            stopping = true;
            try { await service.close(); }
            catch { console.error('Hosted shutdown failed'); process.exitCode = 1; }
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    })().catch(error => {
        console.error(`Hosted startup failed (${error.code || 'internal'})`);
        process.exitCode = 1;
    });
}
module.exports = { loadConfig, startHosted };
