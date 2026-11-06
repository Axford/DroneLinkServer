# DroneLinkServer documentation

Reviewed: 2026-11-06. Role: independently installed hosted backend, gateway and legacy tools.

- [Local architecture](architecture.md)
- [Local operations](operations.md)
- [System documentation index](../../DroneLinkDatastore/docs/README.md)
- [Critical system summary](../../DroneLinkDatastore/docs/SUMMARY.md)
- [Shared packet/API contracts](../../DroneLinkDatastore/docs/contracts/README.md)
- [Master roadmap and implementation plans](../../DroneLinkDatastore/docs/planning/roadmap.md)
- [Documentation conventions](../../DroneLinkDatastore/docs/contributing.md)

System facts and roadmap status are maintained in Datastore; this repo owns its component details. Cross-repo links assume sibling checkouts with these names.

## Project intent and accepted target boundaries

Read [objectives and requirements](../../DroneLinkDatastore/docs/project/objectives.md), [traceability](../../DroneLinkDatastore/docs/project/traceability.md) and [target repository architecture](../../DroneLinkDatastore/docs/architecture/target.md). The target responsibilities are accepted; bounded extraction/integration/preservation gates SEP-01–SEP-07 are complete. The local architecture guide and central evidence describe current source and limits.

## Architecture baseline

The current cross-repository direction is frozen as [ARCH-1.1](../../DroneLinkDatastore/docs/architecture/baseline.md). Use the [canonical glossary](../../DroneLinkDatastore/docs/project/glossary.md) for actors and terms, and [requirements](../../DroneLinkDatastore/docs/project/requirements.md) for policy. Completed [SEP-01](../../DroneLinkDatastore/docs/planning/sep-01-protocol-compatibility.md) is the bounded compatibility foundation; M1 slice A is the next ready product scope.

The hosted backend is now independently installed under [hosted](../hosted/README.md), alongside the existing root gateway. Runtime separation and its remaining product/deployment limits are recorded in [SEP-04](../../DroneLinkDatastore/docs/planning/repository-separation.md#sep-04-planning-decisions--2026-11-05).

ARCH-1.1 publication (2026-11-06): accepted [ADR-0004](../../DroneLinkDatastore/docs/decisions/0004-cloud-access-and-domain-retirement.md) defines managed-cloud access/domain retirement; [M1 slice A](../../DroneLinkDatastore/docs/planning/m1-contracts-and-telemetry.md#slice-a-implementation-plan--2026-11-06) is ready, runtime implementation unstarted. The local annotated `architecture-v1.1` tag captures this documentation adoption; the original `architecture-v1.0` snapshot is retained unchanged. This component documentation change modifies no runtime, deployment, account or firmware.
