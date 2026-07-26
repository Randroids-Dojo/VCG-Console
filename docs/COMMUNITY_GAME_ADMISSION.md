# Community game admission and emergency removal

Status: isolated workflow exercise implemented; production authority absent

Last updated: 2026-07-24

VCG admits a community game to ordinary family mode only through a manual,
version-scoped review. Developer sideloading is a separate visibly
unapproved namespace and cannot promote itself. Public metadata and a passing
manifest parser are descriptive inputs, not installation or launch authority.

## Required review record

Every submission binds one exact game ID, version, runtime, manifest digest,
and runtime entrypoint scope. A hosted submission binds its credential-free
HTTPS origin. A local submission binds the reviewed manifest and ultimately
must bind a signed package artifact. Any version, origin, runtime, manifest,
payload, permission, or declared-service change requires a new decision.

The manual record must cover:

1. submitter and publisher authority;
2. content and age/family suitability;
3. controller operation plus console-reserved Home and Back;
4. device, network, storage, and other permissions;
5. privacy, retention, recipients, consent, and deletion;
6. branded loading, offline/network behavior, failure, and return;
7. security review, navigation or package containment, and hostile inputs;
8. a named update owner, monitoring route, and re-review triggers; and
9. emergency disable, revocation, active-session behavior, removal, and user
   data disposition.

Missing or unverifiable evidence blocks production admission. Reviewers do
not convert an unverified fact into a pass by recording an assumption.

## Publication authority

An approval decision is scoped data, not catalog authority by itself.
Production publication still requires the signed catalog/package pipeline,
anti-rollback state, and runtime-specific launch controls. Hosted approval
cannot authorize a different origin. Local approval cannot authorize a
different manifest or package. An unsigned developer build cannot be copied
or relabeled into family mode.

Emergency disable must deny new launches independently of ordinary release
cadence. Revocation must be monotonic unless a separately reviewed
reinstatement decision names the exact replacement scope. Product policy must
also specify whether an already-running game is terminated immediately or
allowed a bounded shutdown, and whether package removal preserves, exports,
quarantines, or deletes local user data.

## Implemented isolated exercise

The checked-in evidence runs the record shape over two real repository
identities:

- the current `determined` hosted manifest; and
- the strict valid local-web manifest fixture.

Both are synthetic test submissions. Each retains every review category and
explicit production blocker, receives only a `test-workflow-only` decision,
enters an isolated test catalog, is emergency-disabled and revoked there, and
records a non-mutating user-data disposition. Ordered path-free audit events
bind every transition to the same version/entrypoint scope digest.

The validator recomputes both manifest identities and all source provenance,
requires canonical bounded JSON, rejects unknown or reordered fields, and
prevents promotion into family, production catalog, production package, or
developer authority. Mutation tests cover identity/scope substitution,
missing review categories, authority promotion, incomplete removal,
fabricated runtime termination, audit tampering, stale provenance, and
weakened claims.

Run:

```sh
pnpm prepare:community-admission
pnpm validate:community-admission
```

## Qualification boundary

This is a deterministic workflow/state-transition exercise, not a review of
either game's publisher rights, content, privacy, security, controller
behavior, runtime containment, offline behavior, update operations, or target
compatibility. It changes no production catalog, installed package, save,
active process, or external service. Production activation remains blocked
by the decisions in
`OWNER_QUESTIONS_COMMUNITY_ADMISSION_2026-07-24.md` and by the signed
catalog/package, compositor/input, sandbox, and target-system work tracked in
I-102, I-106, I-181, I-201, I-205, and I-209.
