# VCG Console — repository rules

## UI copy rule (strict, non-negotiable)

Every string the shell renders must justify itself as necessary for the
average player. A string earns its place only if it does one of these:

1. **Names a thing** the player can select (game title, view name, setting).
2. **States a fact the player needs** (status, error, privacy/network
   boundary, capacity).
3. **Gives an instruction the player must follow** (controls, recovery
   steps, confirmation consequences).
4. **Labels an action** (button/legend text).

Everything else is cut immediately — no taglines, mood lines, slogans,
self-description, design commentary, marketing copy, or decorative
numbering. The test when reviewing any line: *"If this disappeared, would a
player lose the ability to do or know something?"* If the answer is no,
delete it. This applies to new features, redesigns, and incidental edits
alike; do not reintroduce filler.

Developer-facing rehearsal surfaces follow the same rule with "average
player" replaced by "developer operating the rehearsal."

## Design system

The shell design system and its rationale live in
`docs/UI_OVERHAUL_DESIGN.md`. UI changes must keep the TV contract floors
(`docs/TV_COMPATIBILITY_CONTRACT.md`): 5% safe area, ≥24 CSS px marked
critical text, ≥48px action targets, visible non-color-only focus, and
reduced-motion parity. Editing `apps/console-lab/src/{styles.css,main.ts,
launcher/*}` or `index.html` requires regenerating the hash-bound evidence
(`scripts/generate-launcher-tv-conformance-evidence.mjs` and friends) before
`pnpm test` passes.
