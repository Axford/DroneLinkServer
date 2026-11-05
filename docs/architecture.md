# DroneLinkServer architecture

Status: observed source. Reviewed: 2026-11-04.

The ES-module Node application starts in [index.mjs](../index.mjs), constructs a terminal diagnostic UI and reads configuration by hostname. It creates UDP and serial interfaces plus a [DroneLinkManager](../public/modules/DroneLinkManager.mjs). The manager owns mesh routes, priority/retry/ACK processing, subscriptions, file/firmware messages and telemetry forwarding.

Express serves legacy assets; Socket.IO exposes message/routing/file operations. `public/` contains the old observer/configuration/visualisation, charts, logs/playback, AIS and specialised module interfaces. `sim.mjs` and `public/modules/sim/` provide boat/kite/AIS simulations. These are substantial migration sources; current end-to-end legacy browser operation has not been verified after state-wiring changes.

`sendRxPacketToCloud` posts base64 unframed messages to Datastore. It uses a hard-coded localhost URL and caches duplicate values before upload success. The [shared HTTP baseline](../../DroneLinkDatastore/docs/contracts/http.md) and M1 own the corrective plan.

`functions/` contains Firebase/Firestore ingestion from an earlier direction; Mongoose model files also remain. Their presence is not proof of active deployment. Check deployment usage before removal.

`parseModules.js` reads sibling DroneNode annotated module headers and generates `public/moduleInfo.json` and HTML help. DroneNode's post-build hook copies firmware/version into Server `public/firmware/`. These sibling-path dependencies need to remain explicit.

## Accepted target responsibility boundary

See [target architecture](../../DroneLinkDatastore/docs/architecture/target.md) and [ADR-0003](../../DroneLinkDatastore/docs/decisions/0003-repository-boundaries.md) for the accepted target allocation and [SEP](../../DroneLinkDatastore/docs/planning/repository-separation.md) for review/extraction gates. No runtime relocation is implemented.

Accepted on 2026-11-05: this repository owns runnable backend: ingestion, authentication, domain administration and commands; optional gateway tooling remains isolated. This is target ownership; the observed source described above has not yet moved.
