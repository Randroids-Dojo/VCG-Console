# Owner questions: game and asset redistribution

Date: 2026-07-24

The current register approves zero offline games/assets. These decisions are
needed before any public image can pass the release gate.

## RR-001: repository license

Which license applies to the VCG Console source, documentation, schemas,
hardware files, built-in obstacle prototype, and generated first-party
artifacts?

Safe default: make no public binary/image release until copyright and
contributor authority are confirmed and one repository license plus notice is
selected. Do not assume a license from project intent or dependency choices.

## RR-002: hosted-game ownership

Who owns or can authorize the code, content, names, and presentation for
Determined, Mi Casa Es Su Casa, and VibeBots?

Safe default: retain them as remote-only unreviewed links. Require a signed or
otherwise reviewable owner record before local packaging, screenshots,
marketing, or implied affiliation.

## RR-003: local hosted-game editions

Should any hosted game receive a deliberately maintained offline edition?

Safe default: no static mirroring. Select at most one title only after
inventorying its server routes, data/services, dependencies, content, owner
authority, controller path, update owner, and removal behavior.

## RR-004: pose model

Who will obtain and approve model-specific redistribution terms for the exact
MediaPipe Pose Landmarker Lite `.task` file?

Safe default: treat the model as a release blocker. Package-level Apache-2.0
metadata is insufficient until exact model provenance and terms are recorded.

## RR-005: MediaPipe runtime closure

Is copying every JS/WASM file from `@mediapipe/tasks-vision@0.10.35` the
intended release shape, and who approves its LICENSE/NOTICE/source handling?

Safe default: generate an exact copied-file hash inventory, include upstream
LICENSE/NOTICE material, and review the actual target bundle before approval.

## RR-006: OCR-A approval

Is the recorded upstream Public Domain label and source/release provenance
sufficient for the intended markets, or is a separate legal opinion required?

Safe default: retain the exact provenance and notice, include modification
inputs/source links, and obtain final release review without weakening the
current evidence.

## RR-007: 2048 font

Should the embedded Apple IIgs bitmap font be replaced with a first-party or
separately rights-cleared font, or should its provenance receive a dedicated
audit?

Safe default: replace it only if rendering/behavior can be reproduced under an
explicitly compatible license; otherwise keep the entire core package
blocked.

## RR-008: trademark/title reviewer

Who approves game names, publisher strings, screenshots, clone-derived
visuals/audio, catalog copy, and absence of implied affiliation?

Safe default: a named reviewer separate from dependency-license automation.
Source-code permission is not title/trademark/content approval.

## RR-009: release authority

Who signs the final statement that the target-specific SBOM, notices,
corresponding source, games, models, fonts, browser/OS/runtime, and removal
procedures are complete?

Safe default: require named engineering and qualified legal/release reviewers;
the release gate has no bypass for known blockers.
