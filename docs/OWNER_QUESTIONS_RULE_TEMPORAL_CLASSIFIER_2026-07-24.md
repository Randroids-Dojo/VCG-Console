# Owner questions: rule versus temporal classifier

Date: 2026-07-24

The architecture/evidence plan is complete without these answers. Collection,
training, and model selection remain disabled.

## Q-236: participant scale, candidate scope, and selection gates

What consented data and compute budget should the first MMAction2 comparison
use, and what per-label gates must a temporal candidate pass before it may
replace or supplement rules?

The current plan compares rules with both PoseC3D and ST-GCN because they have
different input and resource shapes:

- PoseC3D uses 48-frame keypoint heatmaps and its upstream NTU configuration
  reports 20.6G FLOPs / 2.0M parameters;
- ST-GCN uses 100-frame 2D joint sequences and its upstream NTU configuration
  reports 3.8G FLOPs / 3.1M parameters; and
- neither upstream result measures VCG labels, event timing, false gameplay
  actions, package size, or target performance.

Safe default:

- permit only an environment/import smoke test with upstream checkpoints;
- collect or train on no household data until participant count, consent,
  retention, split, and deletion are approved;
- keep all sessions from one participant in one split;
- preserve one school-age-child and one adult result as separate blocking
  classes, never rescue one with an aggregate;
- require the Negative class and false events per negative minute;
- use validation only for thresholds/checkpoints and a single-use held-out
  test;
- compare both temporal candidates only if the compute/data budget supports
  three fixed-seed runs each;
- otherwise run ST-GCN as the resource-first temporal pilot without treating
  it as a winner; and
- keep rules authoritative until a superseding decision records held-out,
  timing, resource, accessibility, license, and target-tier evidence.

Please provide:

1. the minimum train/validation/test participant count for each blocking
   persona class;
2. whether both PoseC3D and ST-GCN should receive full training or only ST-GCN
   after both import smoke tests;
3. minimum precision/recall/F1 and maximum false events per negative minute
   for each of the ten positive labels;
4. maximum p95/worst trigger timing error; and
5. checkpoint/runtime-package and Raspberry Pi/x86 resource ceilings.

Until answered, the pinned plan keeps participant and selection gates `null`.
