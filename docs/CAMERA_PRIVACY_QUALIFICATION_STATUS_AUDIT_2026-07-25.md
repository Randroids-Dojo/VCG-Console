# Camera and microphone qualification status audit

Date: 2026-07-25

Status: I-177/I-179 status reconciliation; no physical result

## Outcome

The investigation register still marked I-177 and I-179 `open`, but the current
repository contains committed strict blocked plans, ready-plan transitions,
result derivation, dedicated owner questions and focused adversarial tests for
both tasks. Their accurate status is `active`, not complete.

This audit does not touch or interpret the separate concurrently owned I-178
capture/inference result tranche.

## I-177 shared UVC camera

Commits `e69be7e` and `6230bf8` provide:

- `benchmarks/camera-qualification/shared-wide-angle-uvc-camera-plan-v1.json`;
- `docs/SHARED_CAMERA_QUALIFICATION_PLAN_2026-07-25.md`;
- `docs/OWNER_QUESTIONS_SHARED_CAMERA_QUALIFICATION_2026-07-25.md`;
- a strict blocked-plan validator; and
- a separate exact ready-plan/result validator.

The plan fixes all ordinary x86 Linux, SteamOS and Pi target rows and derives
40 exact shared, per-target and packaging cells. It preserves genuine
1920x1080 at 60 FPS, D-110's 120 ms p95 exposure-to-action boundary, physical
shutter, visible capture indication, replaceable connector and default-disabled
audio requirements. Manufacturer claims, duplicated frames, capture-arrival
timing, muted audio and UI-only privacy state cannot satisfy those gates.

The result validator binds exact ready-plan bytes, complete ordered cells and
attempts, unique evidence, privacy policy and derived incomplete/rejected/
qualified target dispositions. Qualification does not automatically select or
purchase a camera or mutate the BOM.

The current focused gate passes 26 tests. The tracked plan remains blocked with
zero purchase, execution, result, selection or BOM authority.

## I-179 microphone disablement

Commits `d0013db` and `d23fdd9` provide:

- `benchmarks/microphone-disablement/microphone-disablement-qualification-plan-v1.json`;
- `docs/MICROPHONE_DISABLEMENT_QUALIFICATION_PLAN_2026-07-25.md`;
- `docs/OWNER_QUESTIONS_MICROPHONE_DISABLEMENT_2026-07-25.md`;
- a strict blocked-plan validator; and
- a separate exact ready-plan/result validator.

The plan derives 192 target/layer/phase cells across Raspberry Pi OS, SteamOS
and the Windows fallback. Eight enforcement layers span USB inventory, kernel,
audio service, sandbox, browser, bundled web/native packages and launcher/
tracker/developer/profile behavior. Eight phases span fresh install, first
ordinary boot, replug, offline restart, update, rollback, recovery and reset.

Any returned audio buffer or byte is failure even when silent. A pass requires
denial before sample delivery. Update/recovery must restore policy before
ordinary-user access, and no platform or aggregate can rescue a failed cell.
Raw audio, transmission, transcription, voiceprint, participant identity and
free text remain prohibited.

The current focused gate passes 25 tests. The tracked plan remains blocked with
zero OS-policy mutation, audio-probe, diagnostic-unlock or result authority.

## Remaining boundary

I-177 still lacks an exact received/delivered camera, target hardware/runtime/
USB/packaging tuples, room and optical evidence, trustworthy exposure clock,
approved schedules/gates, participant/data authority and all 40 physical cells.

I-179 still lacks exact received camera/USB identities, OS/audio/sandbox/browser
policy tuples, probe bundle, schedule, attempts/timeouts, safe failed-protection
handling authority and all 192 physical cells. The administrative diagnostic
path remains unresolved in its existing owner-question document.
