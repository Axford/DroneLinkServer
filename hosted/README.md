# Dronewright hosted backend

The independent hosted service uses pinned native Firestore persistence 0.2.0. Install with Node22+ using `npm ci --omit=dev`; run `npm start`. No MongoDB, gateway, emulator, Java or sibling source is required in production.

Supply `GOOGLE_CLOUD_PROJECT`, `PUBLIC_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (32+characters), optional `FIRESTORE_DATABASE` (default `(default)`), `MAPBOX_ACCESS_TOKEN`, `CLIENT_BUILD_DIR` and `PORT`. A local ignored hosted `config.json` may supply equivalent camelCase fields. Startup never creates configuration or downloads credentials. Production uses the service identity and Secret Manager values; no service-account key file. Client build defaults to hosted `private/build`; an explicit path must contain index.html/static. Validate a release before selection.

Google/Passport uses an absolute configured callback and state checking. Firestore sessions expire thirty days from sign-in; no polling touch writes. `__session` is host-only, HttpOnly, SameSite=Lax and Secure for HTTPS, compatible with Firebase Hosting proxying. New users receive `stagingAccess:false`; after approval in the Firestore console, sign out/in. Disabling the flag blocks existing sessions. Pending users see Access pending. APIs return401/403 and private/no-store; delayed telemetry rechecks session expiry/revocation and current membership. Public/machine ingress does not create sessions. No new admin UI or role model is introduced.

Packet ingress returns202 `Packet received` after bounded volatile admission, before persistence. The adapter batches approx one second (1024packets/128KiB max), with8MiB total accounting and a five-second actual RPC deadline. Restart/deploy/write failure may lose admitted packets; failures drop with sanitized diagnostics and no retry backlog. Management/sessions remain durable operations. Domain deletion retains inaccessible packet history under the old ID. Counts are persisted retained counts requested explicitly. Commands return501 until M2.

Domain lists use opaque cursor Next/Previous; history follows every fixed-window page and continues into listener-backed long polling. Server composition owns admission, session policy and HTTP mapping; Datastore owns transactions, native queries/chunks and resource lifecycle. HTTP draining and store shutdown begin together under the existing ten-second HTTP grace; packet flush is bounded within it. Importing app/startup connects or listens to nothing.

## Local checks

```sh
npm ci
npm run test:firestore:prepare
CLIENT_BUILD_DIR=/absolute/verified/build npm run test:application
CLIENT_BUILD_DIR=/absolute/verified/build npm run test:integration
npm run test:operations
```

Preparation explicitly downloads the pinned official Firestore emulator1.22.0 (Java21); tests never download it. Each native HTTP test owns an isolated disposable loopback emulator. A construction-only Google provider adapter exercises actual Passport/session composition without Google consent or production data. Historical application/Mongo fixtures remain for earlier evidence and are excluded from the native gate; intentional API changes are in the [HTTP contract](../../DroneLinkDatastore/docs/contracts/http.md). Production installs exclude test tooling.

## Manual staging operations

All cloud commands require the explicit agreed `--project dronelink-25dbc`; cloud mutations default to dry run and require `--apply`. Use a deliberate durable private archive directory outside Git. No command creates production resources or runs automatic releases.

```sh
npm run legacy:archive -- --project dronelink-25dbc --archive /private/archive/new-name --export-bucket gs://PRIVATE_EU_BUCKET
npm run legacy:archive -- --project dronelink-25dbc --archive /private/archive/new-name --export-bucket gs://PRIVATE_EU_BUCKET --apply
npm run legacy:verify -- --project dronelink-25dbc --archive /private/archive/new-name
npm run legacy:cleanse -- --project dronelink-25dbc --archive /private/archive/new-name
npm run legacy:cleanse -- --project dronelink-25dbc --archive /private/archive/new-name --apply
npm run release:prepare -- --client /absolute/client.tgz --release /absolute/new-release
npm run release:verify -- --release /absolute/new-release
npm run deploy:staging -- --project dronelink-25dbc --release /absolute/new-release --settings /private/staging-settings.json --evidence /private/new-deployment.json
npm run rollback:staging -- --project dronelink-25dbc --deployment /private/previous-deployment.json
npm run rollback:staging -- --project dronelink-25dbc --maintenance
```

Archive preserves deployed Function metadata/source, retires the only legacy `addRxPacket` writer, then exports native Firestore to a separate explicitly private EU bucket (uniform access/PAP enforced). It recursively extracts typed documents, including children under missing parents; downloads all native-export objects and historic Storage logs with inventories/checksums; verifies stable source inventories and mandatory local components. Cleanse verifies again, requires current documents to match the archive, deletes only those documents with update-time preconditions and verifies the existing database resource is unchanged. Failure leaves archives in place and never implies cleansing succeeded. `legacy:archive --resume --apply` can resume a quiesced archive with a completed export, preserving its Function inventory and previously verified downloads. Python HTTPS must use a valid trusted CA bundle; use `SSL_CERT_FILE` when the local Python installation lacks its certificates, never disable verification. No restore rehearsal is performed or claimed. If archival fails midway, retain that directory and its preserved Function source/configuration; investigate before retrying or cleansing.

Release preparation requires clean committed Server source, checks the Client archive/manifest/file hashes and persistence lock integrity, and creates one standalone container build context with declared native storage format1. Deployment builds it in Cloud Build, deploys the exact image digest in Belgium with instance billing, min0/service max1,1vCPU/512MiB/concurrency32, explicitly routes traffic and publishes a Firebase Hosting rewrite. The separately provisioned runtime service account needs Firestore access and only the two selected Secret Manager secrets; settings pin numbered secret versions. Settings fields: project, region, service, publicOrigin, serviceAccount, googleClientID, googleSecret (`name:version`), sessionSecret (`name:version`), optional public mapboxAccessToken. Secrets themselves never enter release bytes/settings/evidence.

Provision required APIs, private artifact repository, service identity, secrets and declared Firestore indexes before deployment. Deny direct browser/client Firestore reads and writes with hosted/firestore.rules; Server uses its scoped IAM identity, so all staging admission/domain checks stay in the hosted boundary. Configure `staging.dronewright.com` in Hosting/DNS and the Google callback before real sign-in acceptance. Pin persistence archives; never overwrite them. Compatible rollback selects an existing recorded image/revision and Hosting version without altering Firestore. First release uses the explicit maintenance/disabled-service fallback; the old Mongo runtime cannot read native data. Backup restoration is a separate operator procedure.

Actual cloud/browser results and exact companions belong in the central [SEP-06 evidence](../../DroneLinkDatastore/docs/planning/repository-separation.md). Local tests are not managed-index, Google-consent or deployment proof.

## SEP-04 acceptance evidence

The hosted source is imported from filtered history `61e8779017e9751edb8ce831bde0a0540ee4cb58`, derived from Datastore `dd39a23f3e74bb37fbb22bb7df3bcdd54946f79e`. Both original histories/frozen tags remain intact. Persistence companion `e006d37` records verified 0.1.2 (SHA-256 `dc8694a7478528b8f22acba4f60be890c571c83b4cdbb3df8c43a9511ea93ed5`); Datastore completion companion `b288660` records removal of its active runtime and the complete acceptance ledger.

A copy under a temporary directory, with no gateway/Datastore/Client source, installs from its own lock and passes 55 HTTP/lifecycle checks with each of copied pre-extraction and C1 Client artifacts, plus four real integration/CLI signal checks. A separate production `npm ci --omit=dev --offline` installation imports app/startup without config/listening and cannot resolve serialport, terminal UI, Socket.IO or the database test runner. Real integration compares original backend responses against the same synthetic stored state, preserves base64 and absent/null packet fields, and rejects an invite write when its domain disappears before mutation. Standards/spec findings are resolved. Full provider/browser/deployment/hardware validation remains separate.

## SEP-06 execution checkpoint

Reviewed software checkpoint0726f4a pairs Clientf638585 with persistence0.2.0. Clean hosted install passes six application/two native integration scenarios and seven operator tests; Client passes six React/20codec/12release tests and a successful production build. Independent production context imports without MongoDB/gateway/test dependencies. Live legacy preservation/cleanse completed with verified402documents,274logs and7native export objects; see central ledger/private archive for hashes and resource identity. Six moderate upstream SDK-tooling audit advisories remain after compatible security lock updates; no high/critical findings remain in that audited graph. Full staging deployment/browser gates are still pending.

## Managed acceptance command

`npm run test:staging -- --project dronelink-25dbc` is a dry run. Add `--apply --evidence /private/new-check.json` to create clearly named synthetic staging data and exercise actual managed indexes, transactions, session expiry/revocation, listeners/cancellation,66packets/s buffered chunks, individual history cursor pages and retained counts. It uses operator ADC, never real Google account credentials or historic archives. The generated synthetic user/domain/packets remain labeled for inspection; it is not a full Google/browser/Cloud Run load test. Real sign-in and map/inspector/reconnect acceptance remain separate. Production is rejected by the command.

Actual staging image source is9bd6bf1 paired with Clientf638585 and persistence0.2.0. Managed storage probe passed792packets at66/s; a separate Hosting/Cloud Run ingress check accepted528packets with528HTTP202responses and matched retained-count increase. Monitoring sampled one instance and memory-utilization mean below30% of512MiB; these samples are not peak-memory guarantees. The first-release maintenance fallback and compatible restoration were exercised with Firestore retained. Operator fixes now use asynchronous structured Cloud Build polling (`--build` resumes the exact existing build), explicit new-revision traffic and a fresh equivalent Hosting version for rollback; Firebase's two reserved init files are allowed, other static content is rejected. Final DNS/Google/browser acceptance and closure are still pending in the central plan.

Authenticated native HTTP gates also pass with the explicitly verified Clientf638585 build, including exact shell/deep-link bytes and private/no-store responses. Source remains on the current branch; operator/test-only follow-up commits do not change the deployed9bd6bf1 application bytes. Final count/target comparison reverified native402 versus readable402 before archive acceptance.

The deployment follow-up selects `latestCreatedRevisionName`, verifies its image digest, routes it to100% and reads actual traffic back before publishing Hosting/evidence. An actual post-rollback rollout demonstrated that `latestReadyRevisionName` can remain the older revision even when the new image is created and Ready/Retired. The operator regression fixture covers that state. The corrected rollout serves Client19619c7 on revision dronewright-staging-00003-bt8, image digest708411c97d05fac52830dd0d02519bc1c67b11a0fb27df9e248c3a62e53019b7; canonical HTTPS static bytes match the verified Client archive. Backend artifact source remains1fd14d5. Real Google consent and browser acceptance follow after the user's first sign-in.

## SEP-06 completion — 2026-11-06

The accepted hosted integration gate is complete. Canonical DNS/HTTPS, real Google sign-in, pending/approved/disabled access and logout, fixed thirty-day session evidence, browser domain creation, retained counts, Mapbox rendering and decoded history/live updates pass. The user confirmed reload/reconnect reconstructed six messages/value43.5, then a seventh synthetic HTTPS packet updated the open page to44.5 without refresh. The owner remains approved. Final matched runtime is Server artifact1fd14d5, Client19619c7, persistence0.2.0, image708411c97d05fac52830dd0d02519bc1c67b11a0fb27df9e248c3a62e53019b7 on revision dronewright-staging-00003-bt8; operator correctiond91f595 governs future deployments. See the central completion ledger for all archive/load/recovery checks and exclusions. Test data is clearly labeled and retained for inspection. Native keyboard automation was stopped after desktop input interference; the final reconnect/live observation was manual.

Pre-existing Expand All UI behavior remains a documented inspector follow-up; individual channel expansion works. This completion does not deliver production provisioning, physical gateway preservation, M1 snapshots/roles/adapters or M2 commands. Six moderate upstream SDK-tooling advisories and longer-term cost/instance-lifetime observation remain explicit operational follow-ups.

## M1 A.1 privileged access operator

The hosted runtime remains pinned to persistence0.2.0 until matched A.2/A.3 adoption. The separate operator tool pins0.3.0 in `tools/access-control/package.json`; install it explicitly with `npm ci --prefix tools/access-control`. Normal hosted installation/start does not install or invoke it. Never expose its entry point through HTTP or run it using ordinary runtime credentials.

Run `node tools/access-control.cjs <command>` from hosted. Every command requires explicit `--project <id> --database <id>` and exactly one of `--managed` or `--emulator 127.0.0.1:port`; emulator projects must start `demo-`. Managed targets are restricted to the existing staging project (`dronelink-25dbc`), with its database selected explicitly. Ambient emulator redirection, duplicates, unknown flags, missing targets and unsupported schemas are rejected. No production target is supported.

1. `plan --output <new-private-file>` reads a bounded inventory and writes a mode0600 preview, never overwriting an existing file. Review the target, source digests, canonical identity/name collisions, mappings and unresolved Owners. Keys/tokens/sessions are excluded. No migration runs at preview time.
2. After old runtime traffic is stopped and backup/recovery reviewed, `apply --plan <reviewed-file> --apply --stopped-traffic` begins maintenance and applies canonical-user/domain mappings with individual progress markers. A source conflict leaves maintenance enabled. Rerun the same plan safely; for changed remaining source, generate/review a new plan and add `--revise-plan`. Completed mappings are not reset.
3. `grant-admin --plan <reviewed-identity-preview> --google-id <subject>` previews the sole Damian grant. Add `--apply --revision <current-control-revision>` to commit. The existing sign-in must carry verified Damian claims; staging flags never grant authority. Read the current revision through `check --plan <migration-file>`; preview made before begin has no control revision.
4. `repair-owner --domain <id> --user <id> --reason <text> --revision <domain-revision>` previews a specific repair. Add `--apply` for the same reviewed revision. Other member overrides are library-only reviewed operator work; public APIs have no override flag.
5. `check --plan <migration-file>` reports mapping/link/Owner/grant and index readiness, without secrets. Managed mode inspects actual composite indexes; emulator mode explicitly does not verify managed readiness. Index deployment/readiness is required before activation.
6. `activate --plan <migration-file> --apply --revision <control-revision>` atomically checks readiness and enables the new contract. This is A.4 rollout work: never activate while old Server/Client revisions remain reachable.

Recovery uses `recover-admin --plan <fresh-reviewed-identity-preview> --old-google-id <old> --new-google-id <new> --reason <text>`, then the same arguments with `--apply --revision <control-revision>`. It swaps only the singleton grant, increments the session epoch, records the reason and retains the original account/memberships. Do not transfer memberships implicitly. The CLI closes storage only after each operation completes.

`npm run test:operations` includes argument-protection checks and a real installed-archive CLI rehearsal against a disposable emulator. Prepare the pinned emulator explicitly first. A.1 does not deploy or activate new access policy on staging. After M1 activation, recovery is maintenance plus a matched compatible release; the old membership-only Server is unsafe.

A.1 acceptance on2026-11-06: persistence source Datastore `50f6575`; immutable0.3.0 SHA-256 `938c55c9c9a7bbb2c4950c9a6848e64ca4221f2c1396b29582464503d959a23e`. The independent operator install and all8 existing Python operations checks plus3 CLI checks (including real native migration/check/repair/activation) pass on Node22.23.4/Java21.0.13 with the owned pinned emulator. CLI tests create only disposable demo projects and private temporary plans. Managed indexes, real Google identities, HTTP/Client roles and staging rollout remain A.2–A.4 acceptance work. No existing staging account/data/deployment or protected archive was changed.

## M1 A.2 Server source boundary — 2026-11-06

Hosted source now pins persistence0.3.0 and requires its access schema. This source must be paired with the A.3 Client and A.4 maintenance transition; it has not replaced the deployed SEP-06 release. Startup reads access control before listening and rejects unsupported schemas; missing control means domain maintenance. Google/self/session flows remain available in maintenance so verified identity can be registered for explicit provisioning.

The pinned Google OpenID profile parser supplies `emails[0].verified`; false/missing claims are denied. Sessions carry stable subject, canonical verified email and access epoch, never roles. Current storage checks drive every authenticated request; delayed lists/history/counts/streams recheck before response. Domain summaries and self profiles are explicit allowlists; keys have a dedicated Owner/Editor/Admin route. Role mutations/invitations/archive use transaction preconditions. Shared invites and permanent deletion are retired; command delivery remains501.

Unsafe human requests require exact configured Origin, per-session X-CSRF-Token from GET /api/session, and JSON. Sign out is POST /auth/logout under the same checks; GET returns405 without revoking a session. OAuth state and invitation return paths use the real pinned strategy and a ten-minute relative-path flow. Machine ingestion has no browser session/administration authority and retains the accepted pre-archive gate/in-flight behavior. Error bodies contain stable sanitized codes.

Local A.2 checks: CLIENT_BUILD_DIR pointing at the existing artifact,14 application/lifecycle scenarios and10 native integration scenarios pass; these include two app instances, current permissions/epoch, delayed history/list denial, logout/expiry, actual OAuth state and profile parsing with provider responses substituted, archive/restore/retained keys and pre-archive input completing late. This is local HTTP evidence, not real Google or managed acceptance. The new Client and staged cutover remain required.

## M1 matched release/cutover guards

Client and hosted manifests now require accessPolicyVersion1, and packaging requires the exact persistence0.3.0 archive. Old Client/membership-only release manifests are rejected before release/deployment. `deploy:staging -- --maintenance ... --apply` explicitly closes external service ingress and clears old tags, builds/deploys with no traffic under internal ingress, verifies the image and100% target traffic with no tags, then restores external access. An interrupted/failed traffic check remains closed. Compatible rollback uses the same internal/select/verify/reopen ordering. A pre-M1 rollback manifest is refused; use `rollback:staging -- --maintenance` and a compatible forward release.

`npm run test:operations` passes11 Python safety checks plus3 installed-CLI checks. Native `test:application` passes15 scenarios and `test:integration`11, including the complete domain-route role matrix. The optional local two-context Chrome rehearsal is:

```sh
CLIENT_BUILD_DIR=<explicit-built-artifact> DRONELINK_PLAYWRIGHT_MODULE=<installed-playwright-module> node tests/browser/access.cjs
```

The rehearsal uses disposable demo projects and substituted provider responses through the real OAuth strategy, never live identities or the user's browser profile. It passes creation, targeted manual copy/accept, Viewer key exclusion, Editor/demotion cleanup, archive/reload/restore. Run it on the matching build; no browser download occurs.

Managed read-only preview finds3 development domains/3 users with no collisions or missing Owners;3 shared links will retire, with keys/history retained. Private preview/digest and review gate are in the central M1 ledger. No M1 deployment/migration/grant/activation has run. The user selected their real Admin account and explicitly deferred managed ordinary-account tests; do not claim full A-T8/M1 closure.
