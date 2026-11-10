const fs = require('fs');
const path = require('path');
const express = require('express');

const serviceDir = path.resolve(__dirname, '..');

// One artifact root owns every React asset and entry route. Authentication and
// URL mounts stay with the service; the artifact contains browser assets only.
const resolveClientBuildDir = clientBuildDir => {
    const explicit = clientBuildDir !== undefined;
    if (explicit && (typeof clientBuildDir !== 'string' || !clientBuildDir.trim())) {
        throw Object.assign(new TypeError('clientBuildDir must be a non-empty directory path'), {code:'invalid-client-artifact'});
    }
    const buildDir = path.resolve(serviceDir, explicit ? clientBuildDir : 'private/build');
    if (explicit) {
        try {
            if (!fs.statSync(path.join(buildDir, 'index.html')).isFile() ||
                !fs.statSync(path.join(buildDir, 'static')).isDirectory()) {
                throw new Error('Invalid artifact shape');
            }
        } catch (error) {
            throw Object.assign(new Error(`Invalid clientBuildDir: ${buildDir}. A built index.html file and static directory are required.`, { cause: error }), {code:'invalid-client-artifact'});
        }
    }

    return buildDir;
};

const mountClientHosting = (app, { clientBuildDir, ensureAuthenticated }) => {
    const buildDir = resolveClientBuildDir(clientBuildDir);
    app.use('/static', express.static(path.join(buildDir, 'static')));
    for (const asset of ['manifest.json', 'favicon.ico', 'logo192.png', 'logo512.png', 'design-tokens.css', 'design-system.css']) {
        app.get(`/${asset}`, (req, res) => res.sendFile(path.join(buildDir, asset)));
    }
    app.use('/private', ensureAuthenticated, express.static(buildDir));
    app.get('/invite/:token', (req, res) => res.sendFile(path.join(buildDir, 'index.html')));
    app.get('/private/domain/:domainId', ensureAuthenticated, (req, res) => {
        res.sendFile(path.join(buildDir, 'index.html'));
    });
};

module.exports = { mountClientHosting, resolveClientBuildDir };
