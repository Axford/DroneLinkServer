'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const run = require('node:util').promisify(execFile);

async function buildNode(source) {
    const revision = '95482beb2fa86df5a61c7e869da2b7d937309133';
    const git = (...args) => run('git', args, { cwd: source, timeout: 10000, encoding: 'buffer' }).then(result => result.stdout);
    const blob = file => git('show', revision + ':' + file);
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'm2-command-node-'));
    try {
        const stubs = (await git('ls-tree', '-r', '--name-only', revision, '--', 'tests/cloud_stubs')).toString().trim().split('\n');
        for (const stub of stubs) {
            const dest = path.join(temp, stub.slice('tests/cloud_stubs/'.length));
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.writeFile(dest, await blob(stub));
        }
        await fs.mkdir(path.join(temp, 'droneModules'));
        for (const file of ['CloudTelemetryConfig.h', 'CloudTelemetryHttp.h', 'CloudCommandBatch.h', 'ConfigurationLine.h',
            'FirmwareMeasurements.h', 'TelemetryReport.h', 'droneModules/CloudTelemetryModule.cpp', 'droneModules/CloudTelemetryModule.h']) {
            await fs.writeFile(path.join(temp, file), await blob('src/' + file));
        }
        const channel = (await blob('src/DroneLinkChannel.cpp')).toString();
        const from = channel.indexOf('void DroneLinkChannel::processQueue()');
        const to = channel.indexOf('void DroneLinkChannel::subscribe(', from);
        await fs.writeFile(path.join(temp, 'actual_channel.inc'), channel.slice(from, to));
        const fixtures = path.join(__dirname, 'fixtures');
        await fs.copyFile(path.join(fixtures, 'command-transport.h'), path.join(temp, 'WiFiClientSecure.h'));
        const executable = path.join(temp, 'command-node');
        await run(process.env.CXX || 'c++', ['-std=c++11', '-fsanitize=address,undefined', '-I', temp,
            path.join(temp, 'droneModules/CloudTelemetryModule.cpp'), path.join(fixtures, 'command-node.cpp'), '-o', executable], { timeout: 45000 });
        return {
            close: () => fs.rm(temp, { recursive: true, force: true }),
            async poll({ origin, domain, apiKey, initialValue = 42 }) {
                const child = spawn(executable, [new URL(origin).port, String(initialValue)], { stdio: ['pipe', 'pipe', 'pipe'] });
                const out = [], err = [];
                child.stdout.on('data', chunk => out.push(chunk));
                child.stderr.on('data', chunk => err.push(chunk));
                const result = new Promise((resolve, reject) => {
                    child.once('error', reject);
                    child.once('close', code => {
                        if (code !== 0) return reject(Error('Firmware host probe failed: ' + Buffer.concat(err).toString()));
                        try { resolve(JSON.parse(Buffer.concat(out).toString())); } catch (error) { reject(error); }
                    });
                });
                child.stdin.on('error', () => {});
                const timeout = setTimeout(() => child.kill(), 15000);
                try { child.stdin.end(domain + '\n' + apiKey + '\n'); return await result; }
                finally { clearTimeout(timeout); }
            }
        };
    } catch (error) {
        await fs.rm(temp, { recursive: true, force: true });
        throw error;
    }
}
module.exports = { buildNode };
