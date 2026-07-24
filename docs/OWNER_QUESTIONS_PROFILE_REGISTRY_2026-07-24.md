# Owner questions: persistent profile registry

Last updated: 2026-07-24

No answer here blocks strict read-only intake. The implemented boundary stores
only opaque launch IDs and leaves every destructive or sensitive lifecycle
operation absent.

## Q-132: authoritative registry writer

Which privileged component owns profile creation, rename linkage, and registry
publication: the native host, a separate profile service, or image-managed
system configuration?

Safe default: one native privileged service owns a synchronized no-replace
transaction. The browser may request an operation but cannot choose an ID,
path, file contents, or commit point. Readers reject ambiguous temporary or
partially published state.

## Q-133: guest identity

Should guest play use a persistent opaque local profile, an explicitly
ephemeral boot/session identity, or offer both as visibly different choices?

Safe default: do not silently treat an ephemeral launch ID as a durable person.
Until retention and save semantics are selected, use a persistent opaque guest
record for any progress that should survive restart and expose no ephemeral
mode.

## Q-134: registry protection and rollback

Must the profile allowlist itself be protected against privileged rollback or
replacement, and which target mechanism supplies that protection?

Safe default: enforce restrictive ownership and crash-safe publication now,
but do not claim tamper resistance. Before family qualification, threat-model
whether rollback can revive a deleted identity or re-enable access and bind
the required generation/digest to qualified protected state if needed.

## Q-135: removal, saves, and sensitive data

What exact transaction removes a profile from launch authority while
unassigning progress and deleting portrait, calibration, body-profile, vault,
and other sensitive data without deleting game saves silently?

Safe default: registry removal alone is never deletion. Require an explicit
scope preview and confirmation, durably unassign saves, delete sensitive
identity material, publish the new registry, and recover idempotently from
power loss at every step. Never attach old progress to a recreated same-name
profile.
