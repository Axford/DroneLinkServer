# DroneLinkServer documentation

Reviewed: 2026-11-05. Role: gateway and legacy tools.

- [Local architecture](architecture.md)
- [Local operations](operations.md)
- [System documentation index](../../DroneLinkDatastore/docs/README.md)
- [Critical system summary](../../DroneLinkDatastore/docs/SUMMARY.md)
- [Shared packet/API contracts](../../DroneLinkDatastore/docs/contracts/README.md)
- [Master roadmap and implementation plans](../../DroneLinkDatastore/docs/planning/roadmap.md)
- [Documentation conventions](../../DroneLinkDatastore/docs/contributing.md)

System facts and roadmap status are maintained in Datastore; this repo owns its component details. Cross-repo links assume sibling checkouts with these names.

## Project intent and accepted target boundaries

Read [objectives and requirements](../../DroneLinkDatastore/docs/project/objectives.md), [traceability](../../DroneLinkDatastore/docs/project/traceability.md) and [target repository architecture](../../DroneLinkDatastore/docs/architecture/target.md). The target responsibilities are accepted; migration is not implemented; the local architecture guide describes current source.

## Architecture baseline

The agreed cross-repository direction is frozen as [ARCH-1.0](../../DroneLinkDatastore/docs/architecture/baseline.md). Use the [canonical glossary](../../DroneLinkDatastore/docs/project/glossary.md) for actors and terms, and [requirements](../../DroneLinkDatastore/docs/project/requirements.md) for policy. The proposed first implementation scope is [SEP-01](../../DroneLinkDatastore/docs/planning/sep-01-protocol-compatibility.md); runtime ownership has not moved.

The hosted backend is now independently installed under [hosted](../hosted/README.md), alongside the existing root gateway. Runtime separation and its remaining product/deployment limits are recorded in [SEP-04](../../DroneLinkDatastore/docs/planning/repository-separation.md#sep-04-planning-decisions--2026-11-05).
