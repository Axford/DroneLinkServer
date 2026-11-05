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

## Accepted workbench gateway baseline

Accepted on 2026-11-05: the lightweight local Server gateway is the baseline for workbench hardware/config-file iteration and live Wi-Fi/serial diagnostics, using the shared Client UI. Direct browser-to-node is deferred. Require simple start/minimal config; local storage or a lightweight DB is acceptable where needed. Isolate workbench startup from hosted Server authentication/database composition; reuse existing routing/file adapters. Read/edit/upload starts from files on the node, without a required local project folder. Back up local-workflow files to cloud only in cloud-hosted use; standalone local mode has no cloud-backup dependency. Backups capture read/written node files, not unsaved drafts. Upload and Restart are separate commands, with no combined action or implicit runtime reload. Failed cloud backups are pending/retried without blocking local work or negating node-upload success. Changed contents create backup versions; identical consecutive snapshots do not. Retention limits are configurable, defaults undecided. Restore loads the editor only; Upload and Restart are separate explicit actions, with no automatic deployment/reconnect file write. Trigger, retry/pending durability, credential protocol and concrete persistence remain open. Deliver the modern shared-Client workbench as the next phase after the first cloud release, preserving/verifying existing gateway functionality during initial cloud changes. Each gateway process has exactly one explicitly configured domain, with cloud association authenticated during setup using its own revocable credential separate from node keys. Relay preserves existing subscribed/addressed decoded DroneLink forwarding with unchanged-message suppression; mesh control/transfer protocol traffic stays local and complete-file backup is separate; UI sessions do not independently choose the relay/backup domain. See [target architecture](../../DroneLinkDatastore/docs/architecture/target.md). This is an agreed target, not implemented packaging or a cloud-first scope change.

Source limitation: current receiveDroneLinkMsg forwards to cloud only after next-hop/destination checks, and UDPInterface ignores frames not addressed to its node/broadcast. The user confirmed preserving the existing relay scope; broader overheard/transit/raw mesh forwarding is not required. The pre-HTTP-success suppression-cache behaviour is a separately recorded implementation issue.

Accepted per-node view selection: Client can show reachable nodes from this gateway alongside cloud-only nodes in the same domain, with visible source indicators and manual overrides. Export current route validity, not just retained map keys: `removeRoute` sets `heard=false` and emits removal while retaining the entry. New commands follow selected mode (gateway-direct or cloud dispatch using active Drone transport), without migrating/replaying queued entries. Cloud views/commands require Google identity/domain role, independently of the gateway credential. Direct-local work remains available without cloud login; connected workbench uses cloud-hosted Client plus gateway link, while standalone uses the same Client hosted locally. Validate browser access/handshake/login integration; source overrides persist browser-locally per gateway/domain/node, with Auto default and no shared override propagation.

## Iridium command target — later S1

For later S1 satellite commands, accept authorised hosted-UI requests and submit to the Iridium outbound message queue. Iridium owns store-and-forward delivery; do not add a separate Server satellite delivery queue/retry loop. Server-owned persistent queues remain for HTTP polling. Provider API/packing/status/lifecycle mapping is pending.
