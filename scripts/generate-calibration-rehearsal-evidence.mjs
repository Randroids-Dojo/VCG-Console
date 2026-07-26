import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AcceptedCalibrationResultCollection,
  CALIBRATION_READY_RESULT_LIMIT,
  CALIBRATION_REHEARSAL_CONFIDENCE_GATE,
  CALIBRATION_REHEARSAL_MAX_SAMPLES,
  CALIBRATION_REHEARSAL_MIN_SAMPLES,
  CALIBRATION_REHEARSAL_SESSION_TTL_MS,
  CalibrationRehearsalController,
} from "../apps/console-lab/src/launcher/calibration-rehearsal.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "benchmarks/calibration/camera-free-calibration-rehearsal-v1.json",
);

export const CALIBRATION_REHEARSAL_EVIDENCE_FORMAT =
  "vcg-calibration-rehearsal-evidence/v1";

const provenancePaths = {
  implementationPath:
    "apps/console-lab/src/launcher/calibration-rehearsal.ts",
  contractTestPath:
    "apps/console-lab/src/launcher/calibration-rehearsal.test.ts",
  contractPath: "docs/CALIBRATION_REHEARSAL.md",
  generatorPath: "scripts/generate-calibration-rehearsal-evidence.mjs",
  validatorPath: "scripts/validate-calibration-rehearsal-evidence.mjs",
};

function sha256(value) {
  const normalized = value.toString("utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

async function buildProvenance() {
  const entries = await Promise.all(
    Object.values(provenancePaths).map((path) => readFile(resolve(root, path))),
  );
  return {
    ...provenancePaths,
    implementationSha256: sha256(entries[0]),
    contractTestSha256: sha256(entries[1]),
    contractSha256: sha256(entries[2]),
    generatorSha256: sha256(entries[3]),
    validatorSha256: sha256(entries[4]),
  };
}

function observation(sampleNumber, overrides = {}) {
  return {
    sampleNumber,
    bodyCount: 1,
    fullBodyVisible: true,
    feetVisible: true,
    cameraStable: true,
    zoneClear: true,
    floorConfidence: 0.93,
    zoneConfidence: 0.94,
    scaleConfidence: 0.92,
    neutralConfidence: 0.91,
    rangeConfidence: 0.9,
    ...overrides,
  };
}

function start(acceptedResults = new AcceptedCalibrationResultCollection()) {
  const controller = new CalibrationRehearsalController(acceptedResults);
  controller.open(
    "profile-fixture",
    "room-fixture-a",
    "camera-fixture-a",
    0,
  );
  return {
    acceptedResults,
    controller,
    attempt: controller.beginAutomatic(1),
  };
}

function submit(controller, attempt, overrides = () => ({})) {
  for (
    let sampleNumber = 1;
    sampleNumber <= CALIBRATION_REHEARSAL_MIN_SAMPLES;
    sampleNumber += 1
  ) {
    controller.submitObservation(
      attempt,
      observation(sampleNumber, overrides(sampleNumber)),
      1 + sampleNumber,
    );
  }
}

function rejected(operation) {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}

function projectScenario(scenarioId, snapshot, checks = {}) {
  return {
    scenarioId,
    terminalPhase: snapshot.phase,
    terminalSampleCount: snapshot.sampleCount,
    dimensionStatuses: snapshot.dimensions.map(
      ({ dimension, status, confidence }) => ({
        dimension,
        status,
        confidence,
      }),
    ),
    issues: [...snapshot.issues],
    guidedSteps: [...snapshot.guidedSteps],
    readyLimited: snapshot.readyResult?.limited ?? null,
    readyResultIssued: checks.readyResultIssued ?? false,
    requiredGuidanceSkipRejected:
      checks.requiredGuidanceSkipRejected ?? false,
    staleAttemptRejected: checks.staleAttemptRejected ?? false,
    substitutedResultRejected: checks.substitutedResultRejected ?? false,
    firstConsumeAccepted: checks.firstConsumeAccepted ?? false,
    replayConsumeRejected: checks.replayConsumeRejected ?? false,
    invalidationRevoked: checks.invalidationRevoked ?? false,
    expiryRevoked: checks.expiryRevoked ?? false,
  };
}

function buildScenarioResults() {
  const results = [];

  {
    const { acceptedResults, controller, attempt } = start();
    submit(controller, attempt);
    const snapshot = controller.evaluate(20);
    results.push(projectScenario("all-required-ready", snapshot, {
      readyResultIssued: acceptedResults.hasExact(snapshot.readyResult, 20),
    }));
  }

  {
    const { controller, attempt } = start();
    submit(controller, attempt, () => ({
      feetVisible: false,
      floorConfidence: 0.61,
    }));
    const snapshot = controller.evaluate(20);
    results.push(projectScenario("floor-guidance-required", snapshot, {
      requiredGuidanceSkipRejected: rejected(() =>
        controller.skipOptionalGuidance(21)
      ),
    }));
  }

  {
    const { controller, attempt } = start();
    submit(controller, attempt, (sampleNumber) => ({
      zoneClear: sampleNumber !== 4,
    }));
    const snapshot = controller.evaluate(20);
    results.push(projectScenario("unsafe-zone-blocked", snapshot, {
      requiredGuidanceSkipRejected: rejected(() =>
        controller.skipOptionalGuidance(21)
      ),
    }));
  }

  {
    const { acceptedResults, controller, attempt } = start();
    submit(controller, attempt, () => ({
      neutralConfidence: 0.6,
      rangeConfidence: 0.55,
    }));
    controller.evaluate(20);
    const snapshot = controller.skipOptionalGuidance(21);
    results.push(projectScenario("optional-limited-fallback", snapshot, {
      readyResultIssued: acceptedResults.hasExact(snapshot.readyResult, 21),
    }));
  }

  {
    const { acceptedResults, controller, attempt } = start();
    submit(controller, attempt);
    const ready = controller.evaluate(20).readyResult;
    const issuedBefore = acceptedResults.hasExact(ready, 20);
    const snapshot = controller.invalidate(
      "room-change",
      "room-fixture-b",
      "camera-fixture-a",
      21,
    );
    results.push(projectScenario("changed-room-revocation", snapshot, {
      invalidationRevoked:
        issuedBefore && !acceptedResults.hasExact(ready, 21),
    }));
  }

  {
    const { controller, attempt } = start();
    submit(controller, attempt, () => ({
      feetVisible: false,
      floorConfidence: 0.61,
    }));
    controller.evaluate(20);
    controller.beginAutomatic(21);
    const snapshot = controller.snapshot();
    results.push(projectScenario("replaced-attempt-rejects-stale-sample", snapshot, {
      staleAttemptRejected: rejected(() =>
        controller.submitObservation(attempt, observation(1), 22)
      ),
    }));
  }

  {
    const { acceptedResults, controller, attempt } = start();
    submit(controller, attempt);
    const snapshot = controller.evaluate(20);
    const result = snapshot.readyResult;
    const substitutedResultRejected = !acceptedResults.hasExact(
      { ...result, limited: true },
      20,
    );
    const firstConsumeAccepted = acceptedResults.consumeExact(result, 20);
    const replayConsumeRejected = !acceptedResults.consumeExact(result, 20);
    results.push(projectScenario("exact-result-consumed-once", snapshot, {
      substitutedResultRejected,
      firstConsumeAccepted,
      replayConsumeRejected,
    }));
  }

  {
    const { acceptedResults, controller, attempt } = start();
    submit(controller, attempt);
    const ready = controller.evaluate(20).readyResult;
    const issuedBefore = acceptedResults.hasExact(ready, 20);
    const snapshot = controller.expire(
      CALIBRATION_REHEARSAL_SESSION_TTL_MS + 1,
    );
    results.push(projectScenario("expired-result-revoked", snapshot, {
      expiryRevoked:
        issuedBefore
        && !acceptedResults.hasExact(
          ready,
          CALIBRATION_REHEARSAL_SESSION_TTL_MS + 1,
        ),
    }));
  }

  return results;
}

export async function generateCalibrationRehearsalEvidence() {
  const firstRun = buildScenarioResults();
  const secondRun = buildScenarioResults();
  const firstRunBytes = Buffer.from(JSON.stringify(firstRun));
  const phaseCounts = Object.fromEntries(
    ["ready", "guided", "blocked", "invalidated", "observing", "idle"].map(
      (phase) => [
        phase,
        firstRun.filter(({ terminalPhase }) => terminalPhase === phase).length,
      ],
    ),
  );
  return {
    format: CALIBRATION_REHEARSAL_EVIDENCE_FORMAT,
    evidenceDate: "2026-07-25",
    evidenceClass: "camera-free-synthetic-state-machine-exercise",
    qualification: "contract-evidence-only-not-physical-calibration",
    policy: {
      minimumSamplesPerAttempt: CALIBRATION_REHEARSAL_MIN_SAMPLES,
      maximumSamplesPerAttempt: CALIBRATION_REHEARSAL_MAX_SAMPLES,
      syntheticConfidenceGate: CALIBRATION_REHEARSAL_CONFIDENCE_GATE,
      sessionTtlMs: CALIBRATION_REHEARSAL_SESSION_TTL_MS,
      maximumUnconsumedResults: CALIBRATION_READY_RESULT_LIMIT,
      realCameraUsed: false,
      participantCount: 0,
      bodyMeasurementsRetained: false,
      physicalSafetyQualified: false,
      productionThresholdSelected: false,
      persistentCalibrationImplemented: false,
    },
    scenarioResults: firstRun,
    repeatability: {
      runCount: 2,
      exactScenarioEquality:
        JSON.stringify(firstRun) === JSON.stringify(secondRun),
      scenarioSha256: sha256(firstRunBytes),
    },
    summary: {
      scenarioCount: firstRun.length,
      terminalPhaseCounts: phaseCounts,
      passedClosedGuardCount: firstRun.reduce(
        (count, scenario) =>
          count
          + [
            scenario.requiredGuidanceSkipRejected,
            scenario.staleAttemptRejected,
            scenario.substitutedResultRejected,
            scenario.firstConsumeAccepted,
            scenario.replayConsumeRejected,
            scenario.invalidationRevoked,
            scenario.expiryRevoked,
          ].filter(Boolean).length,
        0,
      ),
      physicalTrialCount: 0,
      gameplayErrorMeasurementCount: 0,
      roomChangeDetectionTrialCount: 0,
    },
    provenance: await buildProvenance(),
    claimBoundary:
      "This deterministic camera-free exercise proves only the current bounded calibration rehearsal state machine: exact ordered synthetic observations, visible dimension-specific guidance, fail-closed unsafe placement, explicit limited fallback, stale-attempt refusal, exact one-shot result authority, invalidation, expiry, and repeatable outcomes. It does not estimate or qualify a real floor, room, play zone, person, scale, stance, range, camera configuration, gameplay threshold, accessibility mode, or safety outcome.",
    limitations: [
      "No camera, frame, landmark, room, floor reference, participant, controller, target console, or game runtime was used.",
      "The eight-sample minimum and 0.82 confidence gate are synthetic UI fixtures, not production thresholds or measured confidence calibration.",
      "Exact repeated synthetic output is software determinism only; no physical repeatability, gameplay error, false-accept, false-reject, or cohort distribution was measured.",
      "Opaque room and camera tokens are authored fixtures. No privileged room-change, mount-shift, crop, rotation, floor, lighting, or camera-replacement detector exists.",
      "No persistent calibration schema, native broker transaction, protected vault commit, migration, reset, deletion, power-loss, full-disk, update, rollback, privacy, accessibility, safety, or legal qualification ran.",
    ],
  };
}

async function main() {
  const artifact = await generateCalibrationRehearsalEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${artifact.summary.scenarioCount} calibration scenarios / ${artifact.summary.passedClosedGuardCount} closed guards to ${outputPath}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
