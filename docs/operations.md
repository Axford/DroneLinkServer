# DroneLinkServer operations

Status: source-derived; runtime/hardware not verified for this documentation baseline. Reviewed: 2026-11-05.

1. Install a compatible Node.js/npm environment; run `npm ci` in this repository. Serial-port dependencies may require host support. Verified runtime versions remain an M1 deliverable.
2. Set the hostname-specific `config.json` entry: node ID, firmware/log paths, telemetry serial port, domain ID and domain API key. Startup creates missing skeleton entries and exits for missing host configuration. Do not commit actual keys.
3. Start the gateway using `node index.mjs`. It provides a terminal UI and serves the legacy web interface. UDP uses port 8007; inspect `index.mjs` for web port selection. Ensure the configured serial device and local network are accessible.
4. Start the independent hosted backend at the currently hard-coded forwarding destination `http://localhost:8003` if testing ingestion. M1 will make this configurable.
5. Simulation: `npm run sim`, with suitable `sim.json` and gateway connectivity. Do not assume a simulation pass proves firmware hardware behaviour.

Root `npm test` is a placeholder failure. No gateway integration suite is established. The help generator uses CommonJS despite the package's ES-module mode: invocation/compatibility needs verification before using `parseModules.js`. Firebase deployment is a separate, unverified path; do not deploy it merely because `functions/` exists.

Verify docs from this repo with `python3 ../DroneLinkDatastore/tools/check_docs.py`. Runtime checks and packet/command smoke gates are defined in the central M1/M2 plans.

## SEP-01 protocol checks — 2026-11-05

Install from the committed lockfile and local `vendor/dronelink-protocol-0.1.1.tgz` archive. The browser ESM artifact is already checked in; a normal startup/build does not rewrite it. Use `npm run protocol:check`, `npm run test:protocol` and `npm run test:protocol:browser`. The last command uses Node's experimental VM modules to evaluate the actual browser module graph without Node globals; it is not a real-browser UI test. Gateway replay intercepts all cloud requests and disables background timers.

For a deliberate version update, copy the reviewed archive, update its exact dependency/lockfile, the version-specific codec import and sync-script assertion, then run `npm run protocol:sync`. It writes only this checkout. Run equality, codec, gateway and browser checks before rollout. Use the central [release and rollback instructions](../../DroneLinkDatastore/docs/operations.md) and [SEP-01 evidence](../../DroneLinkDatastore/docs/planning/sep-01-protocol-compatibility.md). Reverting the whole pre-adoption codec also restores the known uint32 encoder bug.

Clean `npm ci --ignore-scripts` and these software checks passed; native serial dependencies, physical Wi-Fi/serial and complete gateway/UI startup were not exercised. Existing firmware/module generation sibling-write tools remain unchanged.

## SEP-04 hosted installation and acceptance

The hosted service is an independent installation under `hosted/`. Follow its [runbook](../hosted/README.md): `cd hosted`, `npm ci --omit=dev`, then `npm start`. Missing hosted-root `config.json` produces its own skeleton and exits. Configure MongoDB/Google/session/Mapbox and an explicit verified Client release directory. Never copy the gateway hostname config into hosted. Relative artifact paths now resolve against `hosted/`; explicitly translate old service-relative paths during migration. The old Datastore server remains available through its retained Git revision for rollback, not through a second maintained runtime copy.

For tests, install dev dependencies, run `npm run test:mongo:prepare` explicitly, then `CLIENT_BUILD_DIR=<verified build> npm run test:application` and `npm run test:integration` with the same artifact input. The runner is pinned MongoDB 8.0.34 via `mongodb-memory-server-core` 11.3.0; the core package has no download hook. Tests launch their own loopback process and temporary DB path, reject arbitrary external database URI overrides and disable runtime downloads. `.cache/` is local/ignored. Real data/Google credentials are never test inputs.

Hosted pins `vendor/dronelink-persistence-0.1.2.tgz` in its own manifest/lockfile. New adoption explicitly copies a reviewed immutable release, updates both pin/lock, and reruns storage/API/compatibility/rollback gates. Normal install/start never updates sibling files or publishes/deploys. Production `npm ci --omit=dev` omits runner/original-schema test dependencies; production imports have no gateway/native/terminal requirements. Root `npm test` remains the legacy placeholder; hosted tests are selected from the hosted package.

SEP-04 completion companions: hosted implementation `975651f`, Datastore cutover/evidence `b288660`, persistence release evidence `e006d37`. This follow-up updates source/service paths only; tested hosted runtime bytes are unchanged. Broader live/provider/browser/hardware and generated-artifact gates remain separate.
