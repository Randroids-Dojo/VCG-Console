# Rule versus temporal-classifier comparison plan

Date: 2026-07-24

Status: architecture and evidence plan implemented; no MMAction2 environment,
VCG training dataset, trained checkpoint, held-out result, or candidate
selection exists.

## Outcome

I-066 now has a pinned comparison contract for:

1. the current deterministic core17 rule baseline;
2. MMAction2 PoseC3D with keypoint heatmaps; and
3. MMAction2 ST-GCN with 2D joints.

The tracked artifact is
[`rule-mmaction2-comparison-plan-v1.json`](../benchmarks/temporal-classifier/rule-mmaction2-comparison-plan-v1.json).
It freezes the upstream boundary, candidate identities, labels, minimized
dataset fields, participant-disjoint split, training controls, metrics,
resource measurements, explainability artifacts, and no-selection gates.

This is not a classifier benchmark. It prevents an upstream demo, checkpoint,
or top-1 number from being mistaken for VCG evidence.

## Official upstream boundary

The plan pins MMAction2 `v1.2.0` and documentation revision `4d6c9347`.
Official OpenMMLab material establishes that:

- [MMAction2 v1.2.0](https://github.com/open-mmlab/mmaction2/releases/tag/v1.2.0)
  is the pinned release rather than mutable `main`;
- the [installation guide](https://github.com/open-mmlab/mmaction2/blob/v1.2.0/docs/en/get_started/installation.md)
  requires the PyTorch/OpenMMLab dependency stack and supports source
  installation for custom work;
- the [custom dataset guide](https://mmaction2.readthedocs.io/en/stable/advanced_guides/customize_dataset.html)
  defines `PoseDataset` for skeleton recognition and lists COCO,
  NTU-RGB+D, and OpenPose keypoint formats;
- the [PoseC3D configuration](https://github.com/open-mmlab/mmaction2/blob/v1.2.0/configs/skeleton/posec3d/README.md)
  uses 48-frame keypoint heatmaps and reports 20.6G FLOPs / 2.0M parameters
  for its upstream NTU60 cross-subject configuration; and
- the [ST-GCN configuration](https://github.com/open-mmlab/mmaction2/blob/v1.2.0/configs/skeleton/stgcn/README.md)
  uses 100-frame 2D joint sequences and reports 3.8G FLOPs / 3.1M parameters
  for its upstream NTU60 cross-subject configuration.

Those upstream complexity figures describe those exact published protocols.
They are not measurements on VCG data, hardware, clip cadence, runtime, or
package. Upstream checkpoints use different label spaces and may verify
installation only; they cannot score as VCG action evidence.

Before execution, the Python version, PyTorch, MMEngine, MMCV, MMAction2,
repository revision, config, custom adapter, label map, transforms, and every
checkpoint must be pinned and hashed. No environment has been created yet.

## Common input and labels

Every candidate receives the exact same ordered Motion `0.4.0`
`body.core17` normalized 2D skeleton traces and independent labels. The frozen
11-class vocabulary is:

- Jump and Squat;
- anatomical left/right Lean, Step, Reach, and Punch; and
- Negative.

The Negative class is mandatory. It includes neutral standing, ordinary setup
movement, crossed arms, self-occlusion, partial exit/re-entry, camera shifts,
spectator/passersby, and controller-only recovery. A comparison that measures
positive clips without exposure-normalized false events is invalid.

Persistent dataset fields are limited to opaque participant/session code,
persona class, monotonic skeleton timestamps, the 17 named normalized points,
observation/confidence state, independent labels, context, and invalid
reasons. RGB/depth images, video, audio, names, portraits, facial embeddings,
and durable body identity remain prohibited by default.

## Participant-disjoint data

All sessions from one participant belong to exactly one of Train, Validation,
or held-out Test. The participant assignment and skeleton-trace hashes are
frozen before:

- model training;
- rule threshold tuning;
- augmentation selection;
- checkpoint selection; or
- action-lifecycle threshold selection.

No clip-level random split is allowed because adjacent clips or multiple
sessions from one person would leak body proportions and movement style.
Held-out Test is single-use. Training augmentation must remain training-only,
and every transform probability, seed, and anatomical left/right remap is
hashed.

The blocking classes remain school-age child standing and adult standing.
Seated and limited-range evidence is separate and exploratory. Each positive
label schedules 20 attempts per participant, plus 15 negative minutes per
participant. The minimum participant count per blocking class remains
explicitly `null` pending Q-236, so collection and candidate selection are not
authorized.

## Fair candidate comparison

The rule candidate freezes calibration, thresholds, hysteresis, cooldown, and
the lifecycle adapter before held-out evaluation. Temporal candidates train
custom VCG 11-label heads; upstream classifier heads do not qualify.

Temporal training uses three fixed seeds (`17`, `23`, `47`) and requests
deterministic mode. Validation alone may select an epoch, class threshold, or
event adapter. Natural held-out prevalence is reported even if a balanced
training sampler is also evaluated.

All candidates are converted through one versioned validation-tuned action
lifecycle adapter. This is necessary because:

- rules naturally produce threshold/state transitions;
- temporal classifiers naturally produce window scores;
- clip classification accuracy does not establish event trigger timing; and
- different post-processing could dominate the comparison.

## Required evidence

Every label reports:

- precision, recall, and F1;
- false events per negative minute;
- trigger signed-error p50 and p95; and
- worst absolute trigger error.

Aggregate reporting includes participant-macro and persona-macro metrics, a
complete confusion matrix, and every invalid or unavailable attempt.
Aggregate accuracy alone cannot select a candidate.

The resource comparison includes:

- training wall time and peak RAM/VRAM;
- checkpoint and runtime-package bytes;
- cold-load time;
- per-window p50/p95/p99/worst inference;
- full exposure-to-action p50/p95/p99/worst; and
- runtime CPU, RAM, GPU, and VRAM.

Explainability remains asymmetric and explicit:

- rules retain threshold and state-transition traces;
- temporal models retain per-class score timelines;
- temporal joint/time attribution must name its method and limitations; and
- both retain bounded skeleton-only false-positive and false-negative
  exemplars.

Attribution is diagnostic evidence, not proof of causal or human-readable
reasoning.

## No-selection gates

The plan keeps three fields unset:

- minimum held-out participants per blocking persona;
- per-label metric gates; and
- resource/package gates.

The validator requires all three to remain `null`. Q-236 must be resolved and
a superseding plan committed before data collection or training. Even after
that, a candidate must pass every blocking persona and privileged false-event
gate, fit both target tiers, preserve action timing, and report accessibility
separately.

## Validation

```powershell
node scripts/validate-rule-temporal-comparison-plan.mjs
node --test scripts/validate-rule-temporal-comparison-plan.test.mjs
```

Ten tests reject:

- raw-frame retention;
- a mutable/substituted upstream release;
- upstream checkpoint accuracy presented as VCG evidence;
- participant leakage across splits;
- unseeded single-run temporal evaluation;
- omission of the Negative class;
- prematurely filled collection or selection gates;
- aggregate-only candidate selection; and
- undeclared selected-candidate claims.

## Remaining execution boundary

I-066 remains active. Required work includes:

1. Q-236 data scale, metric gates, candidate scope, and compute authorization;
2. consent/assent and minimized skeleton-only collection;
3. a frozen participant-disjoint dataset and independent labels;
4. reproducible dependency locks, custom dataset adapter, configs, and label
   map;
5. three deterministic training runs per temporal candidate;
6. single-use held-out evaluation with complete negative exposure;
7. common lifecycle/event timing and explainability artifacts;
8. model/package license and dataset-rights review;
9. ordinary x86-64 Linux and Raspberry Pi resource/runtime measurement; and
10. an explicit no-selection or selected-candidate decision record.

No classifier candidate is recommended by this plan.
