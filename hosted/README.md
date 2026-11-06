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
