# Canonical launcher catalog policy

Last updated: 2026-07-24

The minimal shell, its museum view, universal search, and retro qualification list consume one deterministic browser-safe catalog. The catalog is generated from every validated public `vcg-game.json` manifest joined to one strict host-owned presentation and routing policy.

This boundary prevents launcher copies from drifting. It does not make public manifest or browser data installation, trust, or native execution authority. The Rust host continues to resolve privileged launch intent only from its independently signed installed catalog.

## Sources and generated artifact

- `catalog/*.vcg-game.json` remains the canonical public game metadata.
- `catalog/launcher-policy.json` owns shell placement, display order, search metadata, museum origin, visible status copy, and local/remote loading budgets.
- `packages/launcher-catalog` validates and joins those sources.
- `apps/console-lab/src/launcher/catalog.generated.ts` is the checked-in browser artifact. It is generated; hand edits are rejected as stale.

Run:

```sh
pnpm prepare:catalog
pnpm validate:manifests
```

The validation command rebuilds the expected artifact in memory and byte-compares it with the checked-in module. Adding, removing, or renaming a manifest without an exact policy entry fails. Policy references to unknown manifests fail. This makes catalog membership drift visible in ordinary repository gates.

## Policy invariants

The policy schema is exact version `1`, rejects unknown fields, and enforces:

- unique game IDs and display positions;
- one policy entry for every manifest and no policy-only game;
- a credential-free HTTPS origin for the museum;
- bounded search, label, context, and summary text;
- coherent launch budgets satisfying `slowAfterMs < heartbeatTimeoutMs < timeoutMs`;
- `museum` placement only for validated `remote-web` manifests;
- `retro` placement only for validated `libretro` manifests; and
- explicit `hidden` membership for a public manifest that must not enter the browser artifact.

The generated artifact selects only presentation and routing facts: ID, version, title, publisher, runtime, entrypoint, network class, compatibility status, policy placement, search metadata, summary, status label, museum destination, and loading budgets. It omits permissions, rights evidence, notes, artifact hashes, installed paths, keys, commands, environments, profiles, and native authority.

## Current consumers

- Home and museum destination copy use the canonical museum title and origin.
- Museum previews enumerate the three hosted compatibility manifests in policy order.
- Universal search derives every visible game title, runtime, network class, compatibility state, and search terms from the generated artifact.
- The retro list derives the 2048 candidate's title, ID, summary, position, and status from the same artifact.
- Local and remote loading supervisors consume the policy budgets instead of component-local constants.
- The authenticated native host supplies a separately bounded signed-package inventory. The shell refreshes it at startup, on Retro entry, and when focus returns; concurrent triggers share one request. It shows `Installed` and increments the home total only for exact generated-catalog ID/version/runtime matches, reports catalog absence honestly, and does not reveal unknown signed packages as public entries or counts.

Selecting a museum game currently enters the museum view. It does not directly navigate to the manifest entrypoint because the supervised top-level hosted-game lane, origin containment, global Home/Back, and crash return remain unimplemented.

## Remaining boundary

- Make the external museum implementation consume the same release artifact or an authenticated equivalent.
- Join emergency-disable/admission state without letting the public catalog grant authority.
- Implement supervised exact-origin hosted-game deep links and reliable return to the shell.
- Add native reserved controls, navigation containment, crash recovery, and target-device evidence.
- Expand visible policy surfaces only when their runtime adapters exist; use explicit `hidden` membership meanwhile.
