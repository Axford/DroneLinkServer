'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { fault } = require('../accessPolicy');

const deadlineMs = 35_000;
const workerFile = path.join(__dirname, 'stability-worker.js');
let active = false;

async function runStability(model, water) {
    if (active) throw fault('unavailable');
    active = true;
    let worker;
    let deadline;
    try {
        worker = new Worker(workerFile, { workerData: { model, water } });
        return await new Promise((resolve, reject) => {
            deadline = setTimeout(() => reject(fault('unavailable')), deadlineMs);
            worker.once('message', resolve);
            worker.once('error', reject);
            worker.once('exit', () => reject(fault('unavailable')));
        });
    } finally {
        clearTimeout(deadline);
        try { await worker?.terminate(); }
        finally { active = false; }
    }
}

module.exports = { runStability };
