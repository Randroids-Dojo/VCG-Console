# Owner questions: installed package trust

Last updated: 2026-07-23

No answer here blocks the current software-only desk proof. The implementation uses the safest reversible defaults described below and keeps production trust policy open.

## Q-105: signing-key hierarchy

Should production use an offline root that authorizes rotating release/catalog keys, or provision one long-lived catalog key directly into each image?

Implemented software boundary: a bounded offline-root threshold authorizes distinct channel/catalog/target keys, exact next-generation dual-threshold rotation, expiry, and revocation by omission. Production must still select thresholds/custody and provision anchors, accepted-root history, generation floors, and trusted time through protected platform mechanisms. Keep every private key out of this repository, the browser, package payloads, command lines, logs, and target devices.

## Q-106: rollback scope

Should installed-catalog generation be monotonic across the entire device, or separately monotonic per release channel?

Safe default: make generation monotonic per signed channel, persist the highest accepted generation outside the replaceable catalog/package tree, and require an explicit authenticated recovery ceremony to lower it. This permits deliberate stable/beta channel movement without allowing an attacker to replay an older valid catalog silently.

## Q-107: profile identity at the native boundary

Should guest and child profiles receive persistent opaque host IDs, or should the first native launch operation support an explicitly ephemeral session profile?

Safe default: use a stable opaque local ID for every persisted profile, never a display name or browser-selected filesystem segment. If ephemeral guest play is required, represent it as a separately typed host-created session ID with a documented save-retention policy.
