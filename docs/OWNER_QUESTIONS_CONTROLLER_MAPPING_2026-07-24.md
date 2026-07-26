# Owner questions: controller mapping and remaps

Date: 2026-07-24

The strict canonical profile preserves reserved actions and a minimum shell
set. These product selections remain.

## CM-001: mapping database and update owner

Which exact SDL/Steam Input mapping source, version, review process, signing
authority, and update cadence define the built-in database?

Safe default: pin a reviewed SDL database snapshot; never accept an
unauthenticated mapping update from a game or controller.

## CM-002: “controllers just work” cohort

Which exact current Xbox, PlayStation, 8BitDo, and generic standards-conformant
models/revisions form the first required physical test set?

Safe default: promise only devices that expose an unambiguous reviewed mapping
and publish every observed exception.

## CM-003: ambiguous-device guided mapper

What ordered prompts, timeouts, skip rules, conflict checks, axis dead zones,
and confirmation exercise make a custom mapping acceptable?

Safe default: require every shell direction and confirm, visibly test the
result, and never ask the user to map Home, Back, or Pause.

## CM-004: mapping storage scope

Are custom mappings device-wide, household-wide, or profile-specific, and how
are identical GUIDs with different revisions distinguished?

Safe default: device/revision scoped and household-local, with no profile name
or portrait in the mapping record.

## CM-005: broken-mapping recovery

What hold-at-boot, recovery-remote, or physical-control path resets a bad
mapping without depending on that mapping?

Safe default: a documented recovery-remote or physical service action restores
the pinned built-in database and preserves no custom authority.

## CM-006: per-game remap boundary

Which ordinary game actions may be remapped, who can change them in family
mode, and how are conflicts, defaults, glyphs, reset, and accessibility shown?

Safe default: games declare a bounded semantic action vocabulary; per-game
remaps cannot target or suppress Home, Back, Pause, shell confirm, or the
independent recovery path.
