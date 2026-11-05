# Working in DroneLinkServer

Read [local documentation](docs/README.md) and the [system summary](../DroneLinkDatastore/docs/SUMMARY.md) before changing behaviour. Follow the [shared documentation conventions](../DroneLinkDatastore/docs/contributing.md).

This repository owns gateway and legacy tools. Consult [local architecture](docs/architecture.md) and [operations](docs/operations.md) for source boundaries and commands. Shared contracts and roadmap status live in Datastore; do not duplicate them here.

When changing a cross-repository boundary, update the owning contract, affected local guide, central plan/evidence and critical summary. Record companion revisions and actual validation; distinguish observed implementation from proposals. Generated reference definitions are not runtime dependencies until their adoption plan is implemented.

## Objective and architecture alignment

Before implementation, follow [project objectives and requirements](../DroneLinkDatastore/docs/project/objectives.md), [traceability](../DroneLinkDatastore/docs/project/traceability.md) and [target architecture](../DroneLinkDatastore/docs/architecture/target.md). Plans must name system requirement IDs and matching acceptance evidence. The confirmed product decisions and accepted ADR-0003 target responsibilities guide future work; package/migration details remain under review. Do not execute runtime extraction while the design interview is ongoing. Preserve current source ownership until the separation gates are accepted and implemented.

## Accepted target ownership

This repository is to own the runnable backend for ingress, authentication, domain administration and commands, with optional gateway tooling isolated. Current source remains as documented until the migration is executed. Read the accepted ADR-0003 and the proposed SEP implementation plan; do not confuse target acceptance with completed extraction.

## Frozen baseline and first slice

Use [ARCH-1.0](../DroneLinkDatastore/docs/architecture/baseline.md) and the [canonical glossary](../DroneLinkDatastore/docs/project/glossary.md). Baseline amendments require explicit acceptance; implementation details must remain within accepted boundaries. The first bounded software slice is [SEP-01](../DroneLinkDatastore/docs/planning/sep-01-protocol-compatibility.md), complete for its agreed non-query software compatibility subset; see its evidence and deferred hardware/query/framing gaps. Do not treat it as approval for application relocation or broader runtime extraction.
