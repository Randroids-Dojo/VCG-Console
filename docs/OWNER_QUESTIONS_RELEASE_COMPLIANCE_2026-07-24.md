# Owner questions: release compliance

Date: 2026-07-24

Scope: decisions deliberately deferred by the autonomous I-137 tranche

## Q-RC-001: first-party license selection

Which licenses should apply to:

1. source code and build scripts;
2. documentation and safe-play material; and
3. future enclosure/CAD/template files?

A single license for all three categories is possible but not assumed. The
selected answer needs exact license texts, SPDX identifiers where applicable,
copyright-holder wording, contribution policy, compatibility review for
inbound/outbound contributions, and confirmation that the open-source DIY
intent in D-104 is satisfied.

Until this is answered, the SBOM marks all seven first-party components
`unresolved-project-license` and `pnpm validate:release-compliance` fails.

## Q-RC-002: pinned pose-model redistribution evidence

What exact terms authorize redistribution of
`pose_landmarker_lite.task`, SHA-256
`59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`,
from the recorded Google Storage URL?

Required closure evidence is an authoritative model-specific license/terms
record, exact attribution and notice obligations, modification/redistribution
conditions, and confirmation that the evidence covers this artifact rather
than only the MediaPipe source repository or npm runtime package. If that
evidence cannot be established, the release-safe choices are to replace the
model with one having exact compatible terms or omit it from distributed
artifacts and require a clearly documented user-side acquisition step.

Until this is answered, the SBOM marks the model
`unresolved-model-license` and the release gate fails.

## No decision requested for current evidence generation

The evidence gate, deterministic CycloneDX document, human dependency
inventory, and target-architecture regeneration plan do not depend on either
answer and are safe to retain.
