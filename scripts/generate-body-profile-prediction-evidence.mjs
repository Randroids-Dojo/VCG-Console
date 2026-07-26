import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BODY_PROFILE_FEATURE_NAMES,
  BodyProfilePredictionController,
  BodyProfileProbeSchema,
  BodyProfileTemplateSchema,
} from "@vcg/motion-contract";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "benchmarks/body-profile-prediction/camera-free-abstention-confirmation-v1.json",
);

export const BODY_PROFILE_PREDICTION_EVIDENCE_FORMAT =
  "vcg-body-profile-prediction-evidence/v1";

const context = "a".repeat(64);
const provenancePaths = {
  implementationPath:
    "packages/motion-contract/src/body-profile-prediction.ts",
  contractTestPath:
    "packages/motion-contract/tests/body-profile-prediction.test.ts",
  generatorPath: "scripts/generate-body-profile-prediction-evidence.mjs",
  validatorPath: "scripts/validate-body-profile-prediction-evidence.mjs",
};

function sha256(value) {
  const normalized = value.toString("utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

async function buildProvenance() {
  const [implementation, contractTest, generator, validator] = await Promise.all(
    [
      readFile(resolve(root, provenancePaths.implementationPath)),
      readFile(resolve(root, provenancePaths.contractTestPath)),
      readFile(resolve(root, provenancePaths.generatorPath)),
      readFile(resolve(root, provenancePaths.validatorPath)),
    ],
  );
  return {
    ...provenancePaths,
    implementationSha256: sha256(implementation),
    contractTestSha256: sha256(contractTest),
    generatorSha256: sha256(generator),
    validatorSha256: sha256(validator),
  };
}

function features(offset = 0) {
  return {
    featureSchemaId: "core17-body-ratios-v1",
    extractorId: "camera-free-synthetic-core17-ratios-v1",
    sampleCount: 90,
    ratios: {
      shoulderWidthOverTorso: 0.8 + offset,
      hipWidthOverTorso: 0.65 + offset,
      upperArmOverTorso: 0.72 + offset,
      forearmOverTorso: 0.62 + offset,
      thighOverTorso: 0.9 + offset,
      shinOverTorso: 0.86 + offset,
    },
  };
}

function template(profileId, offset = 0, overrides = {}) {
  return {
    schemaVersion: 1,
    profileId,
    templateRevision: 1,
    calibrationRevision: 1,
    calibrationContextSha256: context,
    status: "active",
    invalidationReason: null,
    features: features(offset),
    ...overrides,
  };
}

function probe(attemptId, overrides = {}) {
  return {
    schemaVersion: 1,
    attemptId,
    epochId: "evidence-epoch",
    occurredAtMs: 1_000,
    trackerHealth: "ready",
    matchingEnabled: true,
    singlePlayerVisible: true,
    calibrationContextSha256: context,
    features: features(0.01),
    ...overrides,
  };
}

function predict(id, probeValue, templates) {
  return new BodyProfilePredictionController().predict({
    predictionId: id,
    probe: probeValue,
    templates,
  });
}

function caught(operation) {
  try {
    operation();
    return false;
  } catch {
    return true;
  }
}

function buildPredictionScenarios() {
  return [
    {
      scenarioId: "separated-candidate",
      prediction: predict(
        "prediction-separated",
        probe("attempt-separated"),
        [template("profile-a"), template("profile-b", 0.25)],
      ),
    },
    {
      scenarioId: "lookalike-ambiguity",
      prediction: predict(
        "prediction-ambiguous",
        probe("attempt-ambiguous"),
        [template("profile-a"), template("profile-b", 0.02)],
      ),
    },
    {
      scenarioId: "distant-body-vector",
      prediction: predict(
        "prediction-distant",
        probe("attempt-distant", { features: features(0.2) }),
        [template("profile-a")],
      ),
    },
    {
      scenarioId: "matching-disabled",
      prediction: predict(
        "prediction-disabled",
        probe("attempt-disabled", { matchingEnabled: false }),
        [template("profile-a")],
      ),
    },
    {
      scenarioId: "tracker-degraded",
      prediction: predict(
        "prediction-degraded",
        probe("attempt-degraded", { trackerHealth: "degraded" }),
        [template("profile-a")],
      ),
    },
    {
      scenarioId: "multiple-people-visible",
      prediction: predict(
        "prediction-multiple",
        probe("attempt-multiple", { singlePlayerVisible: false }),
        [template("profile-a")],
      ),
    },
    {
      scenarioId: "calibration-context-changed",
      prediction: predict(
        "prediction-context",
        probe("attempt-context", {
          calibrationContextSha256: "b".repeat(64),
        }),
        [template("profile-a")],
      ),
    },
    {
      scenarioId: "opted-out-and-invalidated-only",
      prediction: predict(
        "prediction-inactive",
        probe("attempt-inactive"),
        [
          template("profile-opted-out", 0, {
            status: "opted-out",
            invalidationReason: "matching-disabled",
          }),
          template("profile-invalidated", 0, {
            status: "invalidated",
            invalidationReason: "recalibration",
          }),
        ],
      ),
    },
    {
      scenarioId: "vault-or-factory-loss-empty",
      prediction: predict(
        "prediction-after-loss",
        probe("attempt-after-loss"),
        [],
      ),
    },
    {
      scenarioId: "fresh-profile-after-loss",
      prediction: predict(
        "prediction-fresh",
        probe("attempt-fresh"),
        [template("fresh-profile")],
      ),
    },
  ];
}

function confirmation(
  predictionId,
  decision,
  templates = [template("profile-a"), template("profile-b", 0.25)],
) {
  const controller = new BodyProfilePredictionController();
  const prediction = controller.predict({
    predictionId,
    probe: probe(`attempt-${predictionId}`),
    templates,
  });
  return controller.confirm(prediction, decision, 1_100);
}

function buildConfirmationResults() {
  return [
    {
      confirmationId: "accept-separated-candidate",
      result: confirmation("confirm-accept", {
        kind: "accept-prediction",
        profileId: null,
      }),
    },
    {
      confirmationId: "correct-to-visible-profile",
      result: confirmation("confirm-correct", {
        kind: "select-profile",
        profileId: "profile-b",
      }),
    },
    {
      confirmationId: "choose-new-player",
      result: confirmation("confirm-new", {
        kind: "new-player",
        profileId: null,
      }),
    },
    {
      confirmationId: "disable-future-matching",
      result: confirmation("confirm-opt-out", {
        kind: "opt-out",
        profileId: null,
      }),
    },
  ];
}

function buildGuardChecks() {
  const baseProbe = probe("attempt-canary");
  const baseTemplate = template("profile-a");
  const forbiddenKeys = [
    "portraitPixels",
    "portraitHandle",
    "faceEmbedding",
    "noseCoordinate",
    "displayName",
    "email",
  ];
  const canariesRejected = forbiddenKeys.every(
    (key) =>
      !BodyProfileProbeSchema.safeParse({ ...baseProbe, [key]: "canary" })
        .success
      && !BodyProfileTemplateSchema.safeParse({
        ...baseTemplate,
        features: { ...baseTemplate.features, [key]: "canary" },
      }).success,
  );

  const cloneController = new BodyProfilePredictionController();
  const clonePrediction = cloneController.predict({
    predictionId: "guard-clone",
    probe: probe("attempt-guard-clone"),
    templates: [baseTemplate],
  });
  const expiryController = new BodyProfilePredictionController();
  const expiryPrediction = expiryController.predict({
    predictionId: "guard-expiry",
    probe: probe("attempt-guard-expiry"),
    templates: [baseTemplate],
  });
  const duplicateController = new BodyProfilePredictionController();
  const inactiveController = new BodyProfilePredictionController();
  const inactivePrediction = inactiveController.predict({
    predictionId: "guard-inactive",
    probe: probe("attempt-guard-inactive"),
    templates: [
      baseTemplate,
      template("profile-disabled", 0.25, {
        status: "opted-out",
        invalidationReason: "matching-disabled",
      }),
    ],
  });

  const checks = [
    {
      checkId: "portrait-face-name-canaries-rejected",
      passed: canariesRejected,
    },
    {
      checkId: "cloned-prediction-rejected",
      passed: caught(() =>
        cloneController.confirm(
          structuredClone(clonePrediction),
          { kind: "accept-prediction", profileId: null },
          1_100,
        ),
      ),
    },
    {
      checkId: "cross-controller-prediction-rejected",
      passed: caught(() =>
        new BodyProfilePredictionController().confirm(
          clonePrediction,
          { kind: "accept-prediction", profileId: null },
          1_100,
        ),
      ),
    },
    {
      checkId: "expired-confirmation-rejected",
      passed: caught(() =>
        expiryController.confirm(
          expiryPrediction,
          { kind: "accept-prediction", profileId: null },
          expiryPrediction.expiresAtMs + 1,
        ),
      ),
    },
    {
      checkId: "unsupported-schema-version-rejected",
      passed: !BodyProfileTemplateSchema.safeParse({
        ...baseTemplate,
        schemaVersion: 2,
      }).success,
    },
    {
      checkId: "duplicate-profile-template-rejected",
      passed: caught(() =>
        duplicateController.predict({
          predictionId: "guard-duplicate",
          probe: probe("attempt-guard-duplicate"),
          templates: [baseTemplate, structuredClone(baseTemplate)],
        }),
      ),
    },
    {
      checkId: "inactive-correction-rejected",
      passed: caught(() =>
        inactiveController.confirm(
          inactivePrediction,
          { kind: "select-profile", profileId: "profile-disabled" },
          1_100,
        ),
      ),
    },
    {
      checkId: "prediction-output-excludes-vector-and-scores",
      passed:
        !("features" in clonePrediction)
        && !("distance" in clonePrediction)
        && !("score" in clonePrediction),
    },
    {
      checkId: "confirmation-grants-no-downstream-authority",
      passed: [
        confirmation("guard-authority", {
          kind: "accept-prediction",
          profileId: null,
        }),
      ].every(
        (value) =>
          value.grantsProfileAuthority === false
          && value.grantsCalibrationAuthority === false
          && value.grantsSaveAuthority === false,
      ),
    },
  ];
  return { forbiddenKeys, checks };
}

export async function generateBodyProfilePredictionEvidence() {
  const predictionScenarios = buildPredictionScenarios();
  const confirmationResults = buildConfirmationResults();
  const { forbiddenKeys, checks: guardChecks } = buildGuardChecks();
  const stateCounts = Object.fromEntries(
    ["predicted", "ambiguous", "no-match", "unavailable"].map((state) => [
      state,
      predictionScenarios.filter(
        ({ prediction }) => prediction.state === state,
      ).length,
    ]),
  );
  return {
    format: BODY_PROFILE_PREDICTION_EVIDENCE_FORMAT,
    evidenceDate: "2026-07-24",
    evidenceClass: "camera-free-synthetic-contract-exercise",
    qualification: "not-product-or-identity-qualification",
    policy: {
      matchingIsAuthentication: false,
      predictionGrantsAuthority: false,
      explicitConfirmationRequired: true,
      matchingOptOutAvailable: true,
      portraitInputAccepted: false,
      facialInputAccepted: false,
      exactScoresExposedToUi: false,
      productMatchingEnabled: false,
      persistentEncryptedStoreImplemented: false,
      realCameraOrParticipantUsed: false,
      networkUsed: false,
    },
    featureInventory: {
      schemaId: "core17-body-ratios-v1",
      extractorId: "camera-free-synthetic-core17-ratios-v1",
      allowedRatioFields: [...BODY_PROFILE_FEATURE_NAMES],
      forbiddenInputKeys: forbiddenKeys,
      portraitRecordDisposition: "separate-not-provided-to-matcher",
      facialOrAppearanceFeatureCount: 0,
    },
    predictionScenarios,
    confirmationResults,
    guardChecks,
    lifecycleDisposition: {
      optOutTemplateExcluded: true,
      invalidatedTemplateExcluded: true,
      calibrationContextMismatchUnavailable: true,
      emptyVaultProducesNoMatch: true,
      freshRecreationUsesNewProfileOnly: true,
      unsupportedSchemaMigrationRejected: true,
      encryptedPersistenceImplemented: false,
      factoryResetTransactionTested: false,
    },
    summary: {
      predictionScenarioCount: predictionScenarios.length,
      predictedCount: stateCounts.predicted,
      ambiguousCount: stateCounts.ambiguous,
      noMatchCount: stateCounts["no-match"],
      unavailableCount: stateCounts.unavailable,
      explicitConfirmationCount: confirmationResults.length,
      guardCheckCount: guardChecks.length,
      passedGuardCheckCount: guardChecks.filter(({ passed }) => passed).length,
      participantCount: 0,
      realImageCount: 0,
      measuredFalseAcceptRate: null,
      measuredFalseRejectRate: null,
    },
    provenance: await buildProvenance(),
    claimBoundary:
      "Deterministic camera-free contract evidence only. It proves strict input/output shape, conservative abstention, exact one-shot confirmation, correction/New Player/opt-out routes, inactive-template exclusion, and rejection of authored portrait/face/name canaries. It does not prove identity, recognition accuracy, privacy, encryption, persistence, usability, accessibility, safety, legal compliance, or target behavior.",
    limitations: [
      "No person, camera, tracker backend, portrait, face embedding, target console, game, room, or network was used.",
      "The fixed synthetic ratio vector is not an approved feature extractor, biometric design, model selection, or evidence that these ratios are appropriate.",
      "No encrypted vault, protected-state commit, deletion transaction, factory-reset implementation, backup exclusion, migration, memory clearing, or forensic test ran.",
      "No false-accept, false-reject, abstention, correction, demographic, child, seated, disability, clothing, room-change, or household-observation rate was measured.",
      "A confirmed result remains advisory and grants no profile, calibration, save, game, launch, mutation, or security authority.",
    ],
  };
}

async function main() {
  const artifact = await generateBodyProfilePredictionEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${artifact.summary.predictionScenarioCount} prediction scenarios / ${artifact.summary.guardCheckCount} guard checks to ${outputPath}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
