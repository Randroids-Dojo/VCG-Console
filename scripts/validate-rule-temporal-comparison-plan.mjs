import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  RULE_TEMPORAL_CAMPAIGN_ID,
  RULE_TEMPORAL_LABELS,
  RULE_TEMPORAL_PLAN_FORMAT,
  RULE_TEMPORAL_PLAN_VERSION,
} from "./generate-rule-temporal-comparison-plan.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const candidateIds = [
  "core17-rules-v1",
  "mmaction2-posec3d-keypoint",
  "mmaction2-stgcn-joint-2d",
];

function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requireExactKeys(value, keys, name) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} keys must be exactly ${expected.join(", ")}`);
  }
}

function requireEqual(actual, expected, name) {
  if (actual !== expected) {
    throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
  }
}

function requireText(value, name, maximum = 2_048) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maximum
  ) {
    throw new Error(`${name} must be bounded non-empty text`);
  }
}

function requireExactArray(value, expected, name) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  requireEqual(JSON.stringify(value), JSON.stringify(expected), name);
}

function requireTextArray(value, expectedLength, name) {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(`${name} must contain exactly ${expectedLength} entries`);
  }
  value.forEach((entry, index) => requireText(entry, `${name}[${index}]`));
}

function requireHttps(value, expected, name) {
  requireEqual(value, expected, name);
  if (!value.startsWith("https://")) {
    throw new Error(`${name} must use HTTPS`);
  }
}

function validateUpstream(upstream) {
  requireRecord(upstream, "upstream");
  requireExactKeys(
    upstream,
    [
      "project",
      "release",
      "documentationRevision",
      "releaseUrl",
      "installationUrl",
      "customDatasetUrl",
      "posec3dUrl",
      "stgcnUrl",
      "supportedKeypointFormats",
      "dependencyBoundary",
    ],
    "upstream",
  );
  requireEqual(upstream.project, "open-mmlab/mmaction2", "upstream.project");
  requireEqual(upstream.release, "v1.2.0", "upstream.release");
  requireEqual(
    upstream.documentationRevision,
    "4d6c9347",
    "upstream.documentationRevision",
  );
  requireHttps(
    upstream.releaseUrl,
    "https://github.com/open-mmlab/mmaction2/releases/tag/v1.2.0",
    "upstream.releaseUrl",
  );
  requireHttps(
    upstream.installationUrl,
    "https://github.com/open-mmlab/mmaction2/blob/v1.2.0/docs/en/get_started/installation.md",
    "upstream.installationUrl",
  );
  requireHttps(
    upstream.customDatasetUrl,
    "https://mmaction2.readthedocs.io/en/stable/advanced_guides/customize_dataset.html",
    "upstream.customDatasetUrl",
  );
  requireHttps(
    upstream.posec3dUrl,
    "https://github.com/open-mmlab/mmaction2/blob/v1.2.0/configs/skeleton/posec3d/README.md",
    "upstream.posec3dUrl",
  );
  requireHttps(
    upstream.stgcnUrl,
    "https://github.com/open-mmlab/mmaction2/blob/v1.2.0/configs/skeleton/stgcn/README.md",
    "upstream.stgcnUrl",
  );
  requireExactArray(
    upstream.supportedKeypointFormats,
    ["coco", "nturgb+d", "openpose"],
    "upstream.supportedKeypointFormats",
  );
  requireEqual(
    upstream.dependencyBoundary,
    "pin and hash Python, PyTorch, MMEngine, MMCV, MMAction2, config, custom dataset adapter, and every checkpoint before execution",
    "upstream.dependencyBoundary",
  );
}

function validateCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length !== 3) {
    throw new Error("candidates must contain exactly three entries");
  }
  const expected = [
    {
      candidateId: "core17-rules-v1",
      family: "deterministic-rule",
      implementation:
        "packages/motion-contract/src/rule-baselines.ts",
      temporalInputFrames: null,
      upstreamReportedFlops: null,
      upstreamReportedParameters: null,
      upstreamMetricBoundary:
        "VCG camera-free synthetic evidence only; no real-player qualification",
      checkpointPolicy: "no checkpoint",
    },
    {
      candidateId: "mmaction2-posec3d-keypoint",
      family: "skeleton-temporal-classifier",
      implementation:
        "configs/skeleton/posec3d/slowonly_r50_8xb16-u48-240e_ntu60-xsub-keypoint.py",
      temporalInputFrames: 48,
      upstreamReportedFlops: "20.6G",
      upstreamReportedParameters: "2.0M",
      upstreamMetricBoundary:
        "upstream NTU60 cross-subject keypoint configuration; not VCG labels, data, event timing, or runtime",
      checkpointPolicy:
        "upstream checkpoints may verify installation only and cannot score as VCG evidence",
    },
    {
      candidateId: "mmaction2-stgcn-joint-2d",
      family: "skeleton-temporal-classifier",
      implementation:
        "configs/skeleton/stgcn/stgcn_8xb16-joint-u100-80e_ntu60-xsub-keypoint-2d.py",
      temporalInputFrames: 100,
      upstreamReportedFlops: "3.8G",
      upstreamReportedParameters: "3.1M",
      upstreamMetricBoundary:
        "upstream NTU60 cross-subject 2D joint configuration; not VCG labels, data, event timing, or runtime",
      checkpointPolicy:
        "upstream checkpoints may verify installation only and cannot score as VCG evidence",
    },
  ];
  candidates.forEach((candidate, index) => {
    const name = `candidates[${index}]`;
    requireRecord(candidate, name);
    requireExactKeys(candidate, Object.keys(expected[index]), name);
    requireEqual(
      JSON.stringify(candidate),
      JSON.stringify(expected[index]),
      name,
    );
  });
  requireExactArray(
    candidates.map(({ candidateId }) => candidateId),
    candidateIds,
    "candidate IDs",
  );
}

function validateDataset(dataset) {
  requireRecord(dataset, "dataset");
  requireExactKeys(
    dataset,
    [
      "inputProfile",
      "rawFramesRetainedByDefault",
      "persistentFields",
      "prohibitedFields",
      "blockingPersonaClasses",
      "exploratoryPersonaClasses",
      "splitUnit",
      "splitOrder",
      "minimumParticipantsPerBlockingClass",
      "attemptsPerPositiveLabelPerParticipant",
      "negativeMinutesPerParticipant",
      "requiredNegativeStrata",
      "augmentationPolicy",
    ],
    "dataset",
  );
  requireEqual(
    dataset.inputProfile,
    "Motion 0.4.0 body.core17 normalized 2D skeleton-only",
    "dataset.inputProfile",
  );
  requireEqual(
    dataset.rawFramesRetainedByDefault,
    false,
    "dataset.rawFramesRetainedByDefault",
  );
  requireExactArray(
    dataset.persistentFields,
    [
      "opaque participant/session code",
      "persona class",
      "monotonic skeleton timestamps",
      "17 named normalized 2D landmarks",
      "per-landmark observed and confidence state",
      "independent action/event labels",
      "bounded context and invalid-reason fields",
    ],
    "dataset.persistentFields",
  );
  requireExactArray(
    dataset.prohibitedFields,
    [
      "RGB image",
      "depth image",
      "video",
      "audio",
      "name",
      "portrait",
      "face embedding",
      "durable body identity",
    ],
    "dataset.prohibitedFields",
  );
  requireExactArray(
    dataset.blockingPersonaClasses,
    ["school-age-child-standing", "adult-standing"],
    "dataset.blockingPersonaClasses",
  );
  requireExactArray(
    dataset.exploratoryPersonaClasses,
    ["seated-exploratory", "limited-range-exploratory"],
    "dataset.exploratoryPersonaClasses",
  );
  requireEqual(
    dataset.splitUnit,
    "participant; every session from one participant belongs to exactly one of train, validation, or held-out test",
    "dataset.splitUnit",
  );
  requireEqual(
    dataset.splitOrder,
    "freeze participant assignment and trace hashes before any model training or rule-threshold tuning",
    "dataset.splitOrder",
  );
  requireEqual(
    dataset.minimumParticipantsPerBlockingClass,
    null,
    "dataset.minimumParticipantsPerBlockingClass",
  );
  requireEqual(
    dataset.attemptsPerPositiveLabelPerParticipant,
    20,
    "dataset.attemptsPerPositiveLabelPerParticipant",
  );
  requireEqual(
    dataset.negativeMinutesPerParticipant,
    15,
    "dataset.negativeMinutesPerParticipant",
  );
  requireExactArray(
    dataset.requiredNegativeStrata,
    [
      "neutral standing",
      "ordinary setup movement",
      "crossed arms",
      "self-occlusion",
      "partial exit and re-entry",
      "camera shift",
      "spectator or passerby",
      "controller-only recovery",
    ],
    "dataset.requiredNegativeStrata",
  );
  requireEqual(
    dataset.augmentationPolicy,
    "training split only; every transform, probability, seed, and left/right label remap is frozen and hashed",
    "dataset.augmentationPolicy",
  );
}

function validateTraining(training) {
  requireRecord(training, "training");
  requireExactKeys(
    training,
    [
      "seeds",
      "deterministicModeRequested",
      "repeatedRunsPerTemporalCandidate",
      "rulesTrainingPolicy",
      "temporalTrainingPolicy",
      "classBalancePolicy",
      "earlyStoppingSource",
      "prohibitedLeakage",
    ],
    "training",
  );
  requireExactArray(training.seeds, [17, 23, 47], "training.seeds");
  requireEqual(
    training.deterministicModeRequested,
    true,
    "training.deterministicModeRequested",
  );
  requireEqual(
    training.repeatedRunsPerTemporalCandidate,
    3,
    "training.repeatedRunsPerTemporalCandidate",
  );
  requireText(training.rulesTrainingPolicy, "training.rulesTrainingPolicy");
  requireText(
    training.temporalTrainingPolicy,
    "training.temporalTrainingPolicy",
  );
  if (!training.temporalTrainingPolicy.includes("held-out test is single-use")) {
    throw new Error("training.temporalTrainingPolicy must keep test single-use");
  }
  requireText(training.classBalancePolicy, "training.classBalancePolicy");
  requireEqual(
    training.earlyStoppingSource,
    "validation split only",
    "training.earlyStoppingSource",
  );
  requireExactArray(
    training.prohibitedLeakage,
    [
      "participant across splits",
      "session fragment across splits",
      "held-out threshold tuning",
      "held-out augmentation selection",
      "test-set checkpoint selection",
      "synthetic test truth passed to a candidate",
    ],
    "training.prohibitedLeakage",
  );
}

function validateEvaluation(evaluation) {
  requireRecord(evaluation, "evaluation");
  requireExactKeys(
    evaluation,
    [
      "commonInput",
      "commonOutput",
      "requiredPerLabelMetrics",
      "requiredAggregateMetrics",
      "requiredResourceMetrics",
      "requiredExplainabilityArtifacts",
      "reportSlices",
      "selectionPolicy",
      "minimumHeldOutParticipantsPerBlockingClass",
      "perLabelMetricGates",
      "resourceGates",
    ],
    "evaluation",
  );
  requireEqual(
    evaluation.commonInput,
    "the exact same ordered core17 skeleton traces and independent labels for every candidate",
    "evaluation.commonInput",
  );
  requireEqual(
    evaluation.commonOutput,
    "candidate-specific scores converted through one versioned validation-tuned action lifecycle adapter",
    "evaluation.commonOutput",
  );
  requireExactArray(
    evaluation.requiredPerLabelMetrics,
    [
      "precision",
      "recall",
      "f1",
      "false events per negative minute",
      "trigger signed-error p50",
      "trigger signed-error p95",
      "trigger worst absolute error",
    ],
    "evaluation.requiredPerLabelMetrics",
  );
  requireExactArray(
    evaluation.requiredAggregateMetrics,
    [
      "participant-macro precision",
      "participant-macro recall",
      "participant-macro f1",
      "persona-macro f1",
      "confusion matrix",
      "invalid and unavailable attempt counts",
    ],
    "evaluation.requiredAggregateMetrics",
  );
  requireTextArray(
    evaluation.requiredResourceMetrics,
    8,
    "evaluation.requiredResourceMetrics",
  );
  requireTextArray(
    evaluation.requiredExplainabilityArtifacts,
    4,
    "evaluation.requiredExplainabilityArtifacts",
  );
  requireExactArray(
    evaluation.reportSlices,
    [
      "participant",
      "persona class",
      "camera position",
      "backend",
      "movement amplitude",
      "occlusion stratum",
      "target platform",
    ],
    "evaluation.reportSlices",
  );
  requireText(evaluation.selectionPolicy, "evaluation.selectionPolicy");
  if (!evaluation.selectionPolicy.includes("no candidate selection from aggregate accuracy alone")) {
    throw new Error("evaluation.selectionPolicy must reject aggregate-only selection");
  }
  for (const field of [
    "minimumHeldOutParticipantsPerBlockingClass",
    "perLabelMetricGates",
    "resourceGates",
  ]) {
    requireEqual(evaluation[field], null, `evaluation.${field}`);
  }
}

export function validateRuleTemporalComparisonPlan(plan) {
  requireRecord(plan, "plan");
  requireExactKeys(
    plan,
    [
      "format",
      "formatVersion",
      "documentType",
      "campaignId",
      "generatedAt",
      "sourceCommit",
      "workingTreeClean",
      "claimBoundary",
      "upstream",
      "candidates",
      "labels",
      "dataset",
      "training",
      "evaluation",
      "requiredArtifacts",
    ],
    "plan",
  );
  requireEqual(plan.format, RULE_TEMPORAL_PLAN_FORMAT, "plan.format");
  requireEqual(
    plan.formatVersion,
    RULE_TEMPORAL_PLAN_VERSION,
    "plan.formatVersion",
  );
  requireEqual(plan.documentType, "plan", "plan.documentType");
  requireEqual(plan.campaignId, RULE_TEMPORAL_CAMPAIGN_ID, "plan.campaignId");
  if (
    typeof plan.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(plan.generatedAt))
  ) {
    throw new Error("plan.generatedAt must be an ISO date-time");
  }
  if (
    typeof plan.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(plan.sourceCommit)
  ) {
    throw new Error("plan.sourceCommit must be a lowercase Git commit");
  }
  if (typeof plan.workingTreeClean !== "boolean") {
    throw new Error("plan.workingTreeClean must be boolean");
  }
  requireText(plan.claimBoundary, "plan.claimBoundary");
  for (const phrase of [
    "Architecture and evidence plan only",
    "No MMAction2 environment",
    "custom VCG dataset",
    "held-out participant",
    "model selection",
  ]) {
    if (!plan.claimBoundary.includes(phrase)) {
      throw new Error(`plan.claimBoundary must address ${phrase}`);
    }
  }
  validateUpstream(plan.upstream);
  validateCandidates(plan.candidates);
  requireExactArray(plan.labels, RULE_TEMPORAL_LABELS, "plan.labels");
  validateDataset(plan.dataset);
  validateTraining(plan.training);
  validateEvaluation(plan.evaluation);
  requireTextArray(plan.requiredArtifacts, 12, "plan.requiredArtifacts");
  for (const phrase of [
    "dataset manifest",
    "split manifest",
    "MMAction2",
    "checkpoint",
    "held-out metrics",
    "license",
    "no-selection",
  ]) {
    if (!plan.requiredArtifacts.some((value) => value.includes(phrase))) {
      throw new Error(`plan.requiredArtifacts must include ${phrase}`);
    }
  }
  return plan;
}

export async function validateTrackedRuleTemporalComparisonPlan(
  root = repositoryRoot,
) {
  const path = resolve(
    root,
    "benchmarks/temporal-classifier/rule-mmaction2-comparison-plan-v1.json",
  );
  const bytes = await readFile(path);
  if (bytes.length > 200_000) {
    throw new Error("tracked rule/temporal comparison plan exceeds 200 KB");
  }
  return validateRuleTemporalComparisonPlan(JSON.parse(bytes));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const plan = await validateTrackedRuleTemporalComparisonPlan();
  console.log(
    `validated ${plan.campaignId} (${plan.candidates.length} candidates, ${plan.labels.length} labels)`,
  );
}
