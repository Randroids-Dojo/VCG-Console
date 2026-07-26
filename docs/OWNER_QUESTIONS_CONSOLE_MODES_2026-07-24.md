# Owner questions: console operating modes

Last updated: 2026-07-24

These choices do not block a fail-closed launcher model. The current prototype
boots in family mode, requires two visible local confirmations to preview
developer mode, and exposes no deployment endpoint.

## Q-144: local administrator authorization

What authorizes entry into admin mode on a credential-free family console:
a controller PIN, a recovery key, a paired administrator device, a physical
service control, or another mechanism?

Safe default: the browser cannot authorize it. Keep production admin and
developer operations absent until a privileged native path verifies an
owner-selected local factor. Do not derive authority from a profile name,
portrait, body match, hosted account, ordinary controller presence, or LAN
reachability.

## Q-145: persistence across reboot and update

Should admin mode survive navigation, should developer mode survive a service
restart, and may either survive a full console reboot or software update?

Safe default: navigation may preserve a native admin session only while its
authenticated coordinator remains alive. Developer mode, listeners, and
paired-session capabilities end on service restart, reboot, update, crash, or
family lock. The console always presents family mode after boot.

## Q-146: recovery and household misuse

How does the owner recover administrative control without creating a sibling,
guest, or stolen-controller bypass, and what delay or disclosure applies after
repeated failed attempts?

Safe default: no browser-only recovery. Require a deliberate local recovery
flow that cannot expose a general desktop, cannot silently erase profiles or
saves, rate-limits attempts using trusted native state, and gives clear
permanent-data-loss disclosure before any destructive reset.

## Q-147: family-mode settings scope

Which settings are safe for any household player in family mode, and which
require admin authorization?

Safe default: allow reversible play and accessibility controls that cannot add
external authority. Require admin authorization for network trust changes,
update-channel changes, diagnostics export, profile deletion, factory reset,
developer pairing/deployment, trust-key changes, and any setting that weakens
content, privacy, or sandbox policy.
