'use strict';
const { performance } = require('node:perf_hooks');
const { openFirestoreStore } = require('@dronelink/persistence');
const { runReplayStep } = require('./replayWorker');

async function catchUpReplay() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT is required');
    const store = await openFirestoreStore({
        projectId,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        emulatorHost: process.env.REPLAY_FIRESTORE_EMULATOR_HOST
    });
    try {
        // Leave time for the final committed step and Firestore shutdown before
        // the Cloud Run task deadline. Pending work keeps its durable cursor.
        const deadline = performance.now() + 5 * 60 * 1000;
        let steps = 0;
        while (performance.now() < deadline) {
            if (!await runReplayStep(store)) return { steps, result: 'no-due-work' };
            steps += 1;
        }
        return { steps, result: 'time-budget-reached' };
    } finally {
        await store.close();
    }
}

if (require.main === module) {
    catchUpReplay().then(result => {
        console.log(JSON.stringify({ event: 'replay-catch-up', ...result }));
    }).catch(error => {
        console.error('Replay catch-up failed', { category: error.code || 'internal' });
        process.exitCode = 1;
    });
}
