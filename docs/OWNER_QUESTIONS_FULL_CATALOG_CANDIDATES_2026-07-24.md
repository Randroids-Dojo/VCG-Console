# Owner questions: full catalog candidates

Date opened: 2026-07-24

Related work: I-089, I-095, I-096, I-097, I-104, I-105, I-106

The candidate ledger covers all 26 titles but admits none. It grants no
manifest, launcher, permission, or host authority. The following decisions are
needed before creating or promoting per-title public manifests.

## FCC-001: first release inventory

Is the first console release intended to expose only VibeBots, Mi Casa Es Su
Casa, and Determined, or a reviewed subset of all 26?

Safe default: keep the three-title compatibility set as the only visible
museum subset until its controller, service, containment, rights, and recovery
gates pass. Treat the other 23 as an internal review queue, not promised launch
content.

## FCC-002: current three-entry admission

Are the three checked-in museum entries prototype-only, or should they be
treated as already approved for family-mode release?

Safe default: prototype-only. Preserve their visible partial/unverified
labels, but require the same version/origin-scoped trust and content admission
record as any later title before a networked family beta.

## FCC-003: public-manifest author

Who owns each title's public manifest and signs off on its runtime, input,
network, origin, permission, storage, service, rights, and compatibility
claims?

Safe default: require a named game owner plus an independent console reviewer.
Regenerate the candidate ledger from evidence, but author the public manifest
deliberately; never auto-promote a static signal into a permission or
capability.

## FCC-004: input declaration order

Which physical devices and ordinary controls must be supported by each title:
standard gamepad, remote/directional controller, keyboard, pointer, touch, or
Motion?

Safe default: leave input arrays empty and unverified until the exact title is
tested. A family-mode game must disclose any keyboard/pointer/text dependency
before launch and preserve controller-accessible Home, Back, retry, details,
and exit outside the game.

## FCC-005: remote-web architecture claim

What does ARM64/x86-64 compatibility mean for a remote-web title: successful
load, complete play, performance, memory, codec, WebAssembly, graphics, audio,
storage, and failure behavior on each target?

Safe default: require the complete ordinary loop on the exact browser,
compositor, OS image, and hardware tier. Do not infer architecture support from
JavaScript source or a desktop x64 HTTP 200.

## FCC-006: permission and origin review

Which browser and host capabilities may each title request, and which exact
origins are needed after play, login, consent, and failure?

Safe default: grant no host API, profile identity, Motion, camera, microphone,
filesystem, desktop, or arbitrary navigation authority to candidate records.
Review a minimal closed origin/permission set per exact release and enforce it
outside hosted code.

## FCC-007: network and offline vocabulary

Should any title move from conservative `network: required` to optional or
offline-capable?

Safe default: only after complete cold-offline play, required assets,
save/load, restart, network-drop, reconnect, and service-removal tests. A
manifest, worker, cached shell, or fallback screen is insufficient.

## FCC-008: owner-production candidate meaning

Does “first-party repository” imply that VCG owns all code, content, title, and
distribution rights?

Safe default: no. Keep `owner-production-candidate` separate from admission and
redistribution approval. Require the exact rights/authorization record before
local packaging or owner-production trust.

## FCC-009: community candidate evidence

Who supplies source, service, rights, content, input, removal-contact, and
version/origin evidence for Asymptotic Bitrot, Bone Cleaver, and Vibeman
(Hangman)?

Safe default: keep all three blocked and remote-only. Admit through the manual
curated-community process only; never reclassify them as first-party because
their live URLs are reachable.

## FCC-010: catalog mutation ceremony

What review and technical ceremony moves one candidate into a public manifest,
launcher catalog, emergency-disable list, or signed installed catalog?

Safe default: require exact evidence hashes, two-role review, deterministic
validation, version/origin scope, content and rights disposition, rollback and
removal owner, and a separately reviewed explicit commit. The candidate
generator must never write production catalog authority.

## FCC-011: publisher and version identity

What publisher string and immutable release/deployment version should each
remote title expose?

Safe default: do not infer publisher authority from the GitHub organization.
Use an owner-approved display publisher and an exact deployment/build identity
that changes when reviewed behavior changes; a date or mutable branch name
alone is insufficient.

## FCC-012: failed or withdrawn candidate behavior

What happens when a title cannot complete review, loses its origin, changes
services, is withdrawn by its owner, or fails content/safety requirements?

Safe default: keep it absent or disabled without erasing user data. Preserve a
reason code, review history, removal contact, and controller-accessible
unavailable/details/exit experience; never weaken gates to preserve catalog
size.
