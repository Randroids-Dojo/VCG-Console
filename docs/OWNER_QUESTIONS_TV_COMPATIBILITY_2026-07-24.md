# Owner questions: television compatibility

Date opened: 2026-07-24

These decisions do not block use of the conservative desk-only candidate
contract in `TV_COMPATIBILITY_CONTRACT.md`. They do block describing that
contract as the final product standard or closing I-098/Q-056.

## Q-242: final safe-area and legibility policy

Should the five-percent CSS inset, 24 CSS-pixel critical-text minimum, and
48 CSS-pixel action-target minimum become the final authoring floor, or should
physical-TV and seating-distance evidence select larger or mode-specific
values?

Recommended provisional answer: keep 5% / 24 CSS px / 48 CSS px as the
minimum automated lint floor, then require physical-TV checks to define a
larger preferred layout zone and text scale without weakening that floor.

Evidence needed before finalizing:

1. exact primary-room TV model, diagonal, viewing distance, output/scaling
   mode, and overscan settings;
2. the selected ARM64 and x86-64 compositors at 720p, 1080p, and 4K where
   supported;
3. representative launcher, status, recovery, game HUD, and dense-menu
   surfaces;
4. school-age child and adult comprehension from the intended seating and
   standing zones, including corrected and uncorrected vision;
5. long strings, fallback glyphs, localization, high-text-scale,
   high-contrast, and reduced-motion variants; and
6. objective edge clipping plus task completion/error results, not
   screenshots alone.

## Q-243: supported output and frame-timing policy

Which output resolutions, refresh modes, compositor scaling modes, and
frame-pacing gates form the supported baseline for each hardware tier?

Recommended provisional answer: require correct layout at the three CSS
viewports now, make 1080p60 the first physical qualification baseline if the
inventoried TV and target support it, and add 720p and 4K only as actual output
modes pass on each tier. Never infer refresh or performance from CSS viewport
size.

Evidence needed before finalizing:

1. exact target GPU/display stack, cable, TV EDID, compositor, browser/native
   runtime, and scaling configuration;
2. sustained frame-time distributions, missed-frame and long-task counts,
   input-to-photon or the closest bounded pipeline latency, thermals, and
   power under representative concurrent tracking;
3. fixed-refresh and variable-refresh behavior where the target exposes it;
4. resolution/refresh switching, reboot, suspend/resume, HDMI reconnect, and
   safe fallback behavior; and
5. per-title criteria separating correct time-based behavior from the higher
   bar of smooth, responsive, target-qualified performance.

## Handoff

Record the selected policy as a new decision rather than rewriting the
candidate evidence. If the owner defers, the candidate automated checks remain
valid, I-098 stays active, and no physical-TV, frame-rate, or catalog-wide
qualification claim is permitted.
