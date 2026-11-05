# DroneLink hosted backend

This package installs and runs independently of the Server gateway. Runtime dependencies include the pinned `@dronelink/persistence` archive; no Datastore checkout, gateway installation, serial device or terminal UI is required.

```sh
npm ci --omit=dev
npm start
```

Run from this directory. Missing `config.json` creates a skeleton here and exits; configure it before starting. This configuration is separate from the gateway's hostname-based root configuration. Supply a verified extracted Client build with `clientBuildDir`; relative values resolve against this hosted root. The default remains `private/build` within this package. Startup validates an explicit artifact, opens persistence, waits for readiness, then listens. Initialization failure exits clearly without an HTTP listener or credential-bearing URI logs. SIGINT/SIGTERM drains HTTP for up to 10 seconds and closes the owned store.

Development/acceptance (Node 22.23.4, npm 10.9.9; real MongoDB 8.0.34 prepared explicitly):

```sh
npm ci
npm run test:mongo:prepare
CLIENT_BUILD_DIR=/absolute/verified/build npm run test:application
CLIENT_BUILD_DIR=/absolute/verified/build npm run test:integration
```

The application gate uses actual middleware/session/routes and isolated storage/provider adapters, plus frozen original-source replay. Integration uses the released real MongoDB adapter with disposable data and a construction-only identity provider. It also replays the original backend against the same synthetic persisted data and starts/stops real CLI children on SIGINT/SIGTERM. Test-only original schemas/Mongoose dependencies never enter production application code. Binary downloads happen only during explicit preparation; test processes bind to loopback and own temporary paths. No Google consent/token exchange, user database, deployment or hardware is touched.

Do not modify `vendor/` archives in place. Persistence 0.1.2 is pinned with lockfile integrity; a change needs a new reviewed version and companion evidence. Source/schema provenance is inside the archive and in Datastore's canonical release manifest. Keep the original backend/dependency revision, selected Client release and configuration/path mapping for rollback. Current command stub, role-policy and telemetry limitations remain; see the [shared plan/evidence](../../DroneLinkDatastore/docs/planning/repository-separation.md#sep-04-planning-decisions--2026-11-05) and [HTTP contract](../../DroneLinkDatastore/docs/contracts/http.md).

## SEP-04 acceptance evidence

The hosted source is imported from filtered history `61e8779017e9751edb8ce831bde0a0540ee4cb58`, derived from Datastore `dd39a23f3e74bb37fbb22bb7df3bcdd54946f79e`. Both original histories/frozen tags remain intact. Persistence companion `e006d37` records verified 0.1.2 (SHA-256 `dc8694a7478528b8f22acba4f60be890c571c83b4cdbb3df8c43a9511ea93ed5`); Datastore completion companion `b288660` records removal of its active runtime and the complete acceptance ledger.

A copy under a temporary directory, with no gateway/Datastore/Client source, installs from its own lock and passes 55 HTTP/lifecycle checks with each of copied pre-extraction and C1 Client artifacts, plus four real integration/CLI signal checks. A separate production `npm ci --omit=dev --offline` installation imports app/startup without config/listening and cannot resolve serialport, terminal UI, Socket.IO or the database test runner. Real integration compares original backend responses against the same synthetic stored state, preserves base64 and absent/null packet fields, and rejects an invite write when its domain disappears before mutation. Standards/spec findings are resolved. Full provider/browser/deployment/hardware validation remains separate.
