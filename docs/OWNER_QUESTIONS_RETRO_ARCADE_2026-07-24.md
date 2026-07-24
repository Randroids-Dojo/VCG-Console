# Owner questions: arcade set compatibility

Date: 2026-07-24

The repository now has a strict synthetic parent/clone preflight. These
selections remain before any real arcade-set support.

## RA-001: exact core and set organization

Which exact MAME/libretro core and version is selected, and are supported
imports merged, split, non-merged, or another audited organization?

Safe default: support none until one exact core/set pair is qualified; never
guess from a filename.

## RA-002: first rights-cleared fixtures

Which exact parent and clone artifacts have reviewed code/content/trademark
rights for automated tests and redistribution, if any?

Safe default: keep synthetic hash-only fixtures and no bundled ROM bytes.

## RA-003: dependency scope

Must the first arcade milestone support BIOS/device sets, samples, artwork,
CHDs, software lists, or only a deliberately narrow ROM-only subset?

Safe default: reject every undeclared dependency class.

## RA-004: import packaging

Will users select each required archive, one reviewed bundle, or a directory
that a privileged service scans into an atomic managed transaction?

Safe default: explicit selected files only, exact metadata-driven
relationships, no recursive unrestricted filesystem scan.

## RA-005: diagnostics and repair

Which reviewed labels may identify a missing parent/clone/dependency without
suggesting unauthorized download sources or leaking household paths?

Safe default: show system/title, version mismatch class, and opaque missing
dependency IDs linked only to reviewed local-import help.

## RA-006: update and removal

When the selected core/set version changes, are installed sets migrated,
retained inactive, or removed, and how are shared parents protected while any
clone depends on them?

Safe default: retain old objects inactive; require a new signed policy and
explicitly reference-counted removal after every dependent title is blocked.
