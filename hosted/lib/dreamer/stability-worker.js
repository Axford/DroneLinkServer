'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { analyzeHydrostatics } = require('./hydrostatics');

parentPort.postMessage(analyzeHydrostatics(workerData.model, { water: workerData.water }));
