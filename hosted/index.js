const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { openMongoStore } = require('@dronelink/persistence');
const { createApp } = require('./app');
const { resolveClientBuildDir } = require('./lib/clientHosting');

function loadConfig(serviceDir = __dirname) {
    const filename = path.join(serviceDir, 'config.json');
    if (!fs.existsSync(filename)) {
        fs.writeFileSync(filename, JSON.stringify({
            mongoURI: 'mongodb://username:password@host:port/database', port: 8003,
            googleClientID: 'your-google-client-id', googleClientSecret: 'your-google-client-secret',
            cookieKey: 'your-random-cookie-key-at-least-32-characters-long', mapboxAccessToken: 'your-mapbox-access-token'
        }, null, 4));
        console.error('Created skeleton config.json. Configure the hosted service before starting.');
        return null;
    }
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

async function startHosted({ config, storeFactory = openMongoStore, appFactory = createApp, shutdownGraceMs = 10000 }) {
    resolveClientBuildDir(config.clientBuildDir);
    const store = await storeFactory({ uri: config.mongoURI });
    let server;
    try {
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
            try { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
            finally { clearTimeout(deadline); await store.close(); }
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
