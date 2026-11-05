# DroneLinkServer operations

Status: source-derived; runtime/hardware not verified for this documentation baseline. Reviewed: 2026-11-04.

1. Install a compatible Node.js/npm environment; run `npm ci` in this repository. Serial-port dependencies may require host support. Verified runtime versions remain an M1 deliverable.
2. Set the hostname-specific `config.json` entry: node ID, firmware/log paths, telemetry serial port, domain ID and domain API key. Startup creates missing skeleton entries and exits for missing host configuration. Do not commit actual keys.
3. Start the gateway using `node index.mjs`. It provides a terminal UI and serves the legacy web interface. UDP uses port 8007; inspect `index.mjs` for web port selection. Ensure the configured serial device and local network are accessible.
4. Start Datastore at the currently hard-coded forwarding destination `http://localhost:8003` if testing ingestion. M1 will make this configurable.
5. Simulation: `npm run sim`, with suitable `sim.json` and gateway connectivity. Do not assume a simulation pass proves firmware hardware behaviour.

Root `npm test` is a placeholder failure. No gateway integration suite is established. The help generator uses CommonJS despite the package's ES-module mode: invocation/compatibility needs verification before using `parseModules.js`. Firebase deployment is a separate, unverified path; do not deploy it merely because `functions/` exists.

Verify docs from this repo with `python3 ../DroneLinkDatastore/tools/check_docs.py`. Runtime checks and packet/command smoke gates are defined in the central M1/M2 plans.
