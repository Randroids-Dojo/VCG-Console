# Owner questions: credential-free profile management

Last updated: 2026-07-24

The browser rehearsal uses conservative synthetic defaults. None of these
questions authorizes native profile mutation before the vault, registry,
progress-unassignment, failure, privacy, security, and target gates pass.

## Q-103: credential-free household abuse threshold

What measured sibling, guest, visitor, child, simultaneous-player, coercion,
and accidental-motion outcomes would require a stronger local authorization
step despite D-086?

Safe default: keep ordinary play credential-free, but keep native mutation
disabled until representative household tests show that explicit management
entry, exact scope, safe initial focus, review delay, Back/Home recovery, and
controller alternatives bound accidental and hostile changes acceptably. If
they do not, add the smallest justified local ceremony without treating a
portrait, body match, display name, or current player as authentication.

## Q-188: exact reset scope and terminology

Should `Reset local identity data` remove only portrait, calibration, and body
matching, or also profile-scoped accessibility preferences, motion mappings,
history, achievements, leaderboards, and other settings? Should reset retain
the display name and progress links?

Safe default: keep the profile, display name, progress, and global
accessibility settings; remove only explicitly inventoried portrait,
calibration, and body-derived identity state. Do not ship the generic word
`reset` until every retained and removed field is listed in product copy and
the native transaction.

## Q-189: progress sanitization and delete blockers

Which exact game/save schemas can remove a profile link without leaving a
display name, player-authored identifying text, avatar, portrait derivative,
body-derived setting, account ID, or other personal field? What happens when
a game cannot prove safe sanitization?

Safe default: use a reviewed per-runtime and per-title sanitizer allowlist.
Before profile deletion, show any incompatible game and require an explicit
choice to retain linked data temporarily or permanently delete that game's
local progress. Never label opaque relinking alone anonymous and never invent
a generic browser-side save rewrite.

The current browser rehearsal now implements the first fail-closed half of
this default: every preserved link needs an exact synthetic qualification
bound to profile, game, slot, runtime, hosted boundary, sanitizer identity,
and revision at both planning and commit. Missing or revoked evidence blocks
the whole profile deletion and names the affected game/slot/runtime. It does
not yet implement permanent progress deletion or qualify any real sanitizer,
so Q-189 remains open.

## Q-190: destructive confirmation ceremony

What review duration, expiry, wording, focus order, controller input, motion
input, repeated confirmation, and cooldown meet accidental-activation and
accessibility gates for recalibration, reset, and deletion?

Safe default: initially focus the safe choice, require at least the current
1.5-second visible review, never move focus when the destructive choice arms,
expire after 30 seconds, require deliberate focus movement plus activation,
and keep controller Back/Home available. Treat these as test parameters, not
final thresholds, until real-player false-activation and comprehension
evidence passes.

## Q-191: native deletion transaction and recovery order

What journal, protected revision, commit point, and recovery algorithm
atomically revoke sensitive identity data, unassign sanitized progress,
publish the registry, and survive process death, full disk, rollback, update,
and power loss?

Safe default: one privileged broker owns a closed idempotent transaction. It
preflights every record and unassigned destination, persists recovery intent,
revokes render authority, unlinks progress, removes sensitive keys/records,
publishes protected registry/manifest state at one defined commit point, and
reports success only after durable verification. Do not equate registry
removal with deletion or claim an order safe without fault injection on both
targets.

## Q-192: hosted-service guidance and account actions

For each hosted game, what profile screen copy, sign-out action, account-data
deletion link, parental guidance, and service-specific limitation must appear
when local profile deletion cannot erase hosted progress or identity?

Safe default: state before confirmation that VCG removes only console-local
data, name every known separate service, provide reviewed service-owned
guidance where available, and never claim that signing out deletes an account
or that deleting a local profile exercises a hosted privacy right. Require
qualified privacy/legal review for selected services and launch
jurisdictions.
