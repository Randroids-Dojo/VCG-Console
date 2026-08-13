# VCG Console shell redesign (v2 visual system)

Status: implemented decision record
Date: 2026-08-12

## Problem

The v1 shell reads as a diagnostics instrument, not a game console. Root
causes, confirmed against 1080p captures of every surface:

1. **Single monospace voice.** OCR-A at small sizes for every word — body
   copy, buttons, metadata — makes the whole screen read as terminal output.
2. **No imagery.** The home surface is three text-only cards pinned to the
   bottom of an empty viewport. Games have no visual identity.
3. **No focus glamour.** Focus is a thin outline; on a TV the focused item
   must be unmistakable from three meters (scale, glow, and color together).
4. **Diagnostics-first gameplay.** The Motion Lab telemetry column is a
   permanent sibling of the game stage, so play always looks like a lab test.
5. **No console chrome.** There is no controller button legend, and the
   layout language (left text rail + bottom strip) resembles a web dashboard.

## References compared

| Paradigm | Strengths | Weaknesses | Fit for a 5–8 title motion console |
|---|---|---|---|
| **Xbox Series dashboard** | Rich card rails; strong "continue playing" recency; deep tile art | Multi-rail store layout needs dozens of tiles; ad-like density; weak identity | Poor — rails would be one-third empty |
| **PS5 home** | Content-first: focused tile drives full-screen ambient art; cinematic focus scaling; minimal chrome floats over art | Hides system detail behind layers; needs per-title art | **Strong** — small catalog becomes a feature: every title gets a hero moment |
| **Nintendo Switch HOME** | Single row scales down gracefully; instant legibility; button legend convention (glyph + label bottom-right) | Utilitarian to a fault; flat white/grey reads cheap on a dark brand | Strong structurally, weak aesthetically |
| **Steam Big Picture / Deck** | Excellent two-pane settings pattern; strong search; good gamepad focus conventions | Library-management energy; grid assumes hundreds of titles | Good for settings/search only |

Cross-cutting 10-foot rules retained from the TV compatibility contract and
platform guidelines (tvOS HIG, Android TV, BBC GEL): 5% safe area, ≥24 CSS px
critical text at 1080p, ≥48 px targets, non-color-only focus, spatial
directional navigation, reduced-motion parity.

## Decision

**Switch skeleton, PS5 skin** — a single Switch-style content rail over a
PS5-style ambient stage, with Steam Deck's two-pane settings. Measured
reference values adopted from platform guidance (Compose-for-TV, tvOS focus
engine timing, Fire TV text floors): focus gain ≈120 ms ease-out with
relax-out ≈320 ms, focused scale ≈1.08 with a ≥3 px ring plus glow (never
color alone), ambient crossfades 400–600 ms animating opacity only, body
text floor 24 CSS px at 1080p (28+ preferred), root safe padding ≈54 px
vertical / 96 px horizontal at 1080p. Specifically:

- **Home** is a full-bleed ambient stage tinted by the focused tile's
  palette. One horizontal rail of large art tiles (16:9-ish cards, generated
  SVG key art per title). The focused tile scales ~1.08 with an accent ring
  and glow; the greeting and the focused title's metadata live above the
  rail; a status strip and controller legend sit inside the bottom safe area.
- **Typography** becomes two-voice: **Inter Variable** (self-hosted,
  lockfile-pinned) for all UI text, **OCR-A** retained as the brand display
  voice — wordmark, kickers, numeric readouts. This keeps the v1 visual
  token contract (`--vcg-font-shell`) and the OCR-A evidence intact while
  ending the terminal-output look.
- **Chrome**: slim top bar (wordmark · search · profile chip · clock) and a
  bottom **button legend** (Ⓐ Select · Ⓑ Back · Ⓨ Search · ☰ Home) rendered
  with CSS glyph badges, present on every launcher surface.
- **Surfaces**: panels move from hairline-bordered rectangles to layered
  elevation — radius 20 px cards, soft top-light gradient, low-alpha
  borders, accent used sparingly as light, not as line color.
- **Hubs** (Motion / Museum / Retro) keep their list semantics but adopt the
  card language: art thumbnail, title, status chip, chevron.
- **Settings** keeps its two-pane layout, restyled: left category rail with
  filled active pill, right content on an elevated sheet.
- **Motion Lab** becomes stage-first: the game canvas is the hero, the
  telemetry column is restyled as a compact "System monitor" drawer that
  remains open by default (test and lab parity) but visually subordinate,
  and the in-game score HUD becomes a floating pill bar.

## Constraints honored

- Visual token contract v1 is unchanged (fonts, grid, focus, motion tokens);
  the v2 system only **adds** tokens (`--vcg-font-ui`, type ramp, radius,
  elevation, legend metrics).
- All Playwright-pinned hooks survive: IDs, `data-*` attributes
  (`data-view-target`, `data-launcher-view`, `data-settings-*`,
  `data-tv-critical-text`, `data-tv-action`, `data-tv-focus`), accessible
  names, and the class names tests select (`.home-heading`,
  `.home-destinations`, `.home-status`, `.library-list`, `.launcher-nav`,
  `.search-overlay`, `.empty-library`, …).
- TV conformance evidence (launcher home, representative surfaces, search),
  OCR-A evidence, and the runtime payload scorecard are regenerated as part
  of the change; counts of marked critical text/actions are re-recorded.

## Copy rule

Shell copy is governed by the strict rule in `CLAUDE.md`: a string must
name a selectable thing, state a needed fact, give a required instruction,
or label an action — otherwise it is cut. No taglines, slogans,
self-description, or decorative numbering anywhere in the shell.

## Key art

No licensed art exists, so every catalog entry gets **generated SVG key
art** (`src/launcher/key-art.ts`): deterministic geometric compositions in
the shell palette — distinct hue families per title, safe under the strict
CSP (inline SVG, no external requests), and legible at tile size on a TV.
