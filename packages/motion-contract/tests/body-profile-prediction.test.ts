import { describe, expect, it } from "vitest";
import {
  BODY_PROFILE_PREDICTION_WINDOW_MS,
  BodyProfileConfirmedSelectionSchema,
  BodyProfilePredictionController,
  BodyProfileProbeSchema,
  BodyProfileTemplateSchema,
  bodyProfilePredictionJsonSchema,
  bodyProfileTemplateJsonSchema,
  type BodyProfileFeatureVector,
  type BodyProfileProbe,
  type BodyProfileTemplate,
} from "../src";

const context = "a".repeat(64);

function features(
  offset = 0,
  overrides: Partial<BodyProfileFeatureVector["ratios"]> = {},
): BodyProfileFeatureVector {
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
      ...overrides,
    },
  };
}

function template(
  profileId: string,
  featureVector = features(),
  overrides: Partial<BodyProfileTemplate> = {},
): BodyProfileTemplate {
  return {
    schemaVersion: 1,
    profileId,
    templateRevision: 1,
    calibrationRevision: 1,
    calibrationContextSha256: context,
    status: "active",
    invalidationReason: null,
    features: featureVector,
    ...overrides,
  };
}

function probe(overrides: Partial<BodyProfileProbe> = {}): BodyProfileProbe {
  return {
    schemaVersion: 1,
    attemptId: "attempt-1",
    epochId: "epoch-1",
    occurredAtMs: 1_000,
    trackerHealth: "ready",
    matchingEnabled: true,
    singlePlayerVisible: true,
    calibrationContextSha256: context,
    features: features(0.01),
    ...overrides,
  };
}

describe("body-profile prediction research boundary", () => {
  it("returns a separated advisory candidate without granting authority", () => {
    const controller = new BodyProfilePredictionController();
    const prediction = controller.predict({
      predictionId: "prediction-1",
      probe: probe(),
      templates: [
        template("profile-a"),
        template("profile-b", features(0.25)),
      ],
    });
    expect(prediction).toMatchObject({
      state: "predicted",
      reason: "candidate-separated",
      predictedProfileId: "profile-a",
      confidenceBand: "candidate-high",
      requiresExplicitConfirmation: true,
      grantsProfileAuthority: false,
      portraitInputUsed: false,
      facialInputUsed: false,
    });
  });

  it("abstains when two candidates are not separated", () => {
    const prediction = new BodyProfilePredictionController().predict({
      predictionId: "prediction-ambiguous",
      probe: probe({ features: features(0.01) }),
      templates: [
        template("profile-a", features()),
        template("profile-b", features(0.02)),
      ],
    });
    expect(prediction).toMatchObject({
      state: "ambiguous",
      reason: "separation-threshold",
      predictedProfileId: null,
      confidenceBand: null,
    });
  });

  it("abstains when the nearest vector is too far away", () => {
    const prediction = new BodyProfilePredictionController().predict({
      predictionId: "prediction-distant",
      probe: probe({ features: features(0.2) }),
      templates: [template("profile-a")],
    });
    expect(prediction).toMatchObject({
      state: "no-match",
      reason: "distance-threshold",
    });
  });

  it.each([
    [
      "matching disabled",
      { matchingEnabled: false },
      "matching-disabled",
    ],
    [
      "tracker degraded",
      { trackerHealth: "degraded" as const },
      "tracker-not-ready",
    ],
    [
      "multiple people visible",
      { singlePlayerVisible: false },
      "not-single-player",
    ],
    [
      "calibration context changed",
      { calibrationContextSha256: "b".repeat(64) },
      "calibration-context-mismatch",
    ],
  ])("fails closed when %s", (_label, probeOverride, reason) => {
    const prediction = new BodyProfilePredictionController().predict({
      predictionId: `prediction-${reason}`,
      probe: probe(probeOverride),
      templates: [template("profile-a")],
    });
    expect(prediction).toMatchObject({
      state: "unavailable",
      reason,
      predictedProfileId: null,
    });
  });

  it("excludes opted-out and invalidated templates", () => {
    const prediction = new BodyProfilePredictionController().predict({
      predictionId: "prediction-inactive",
      probe: probe(),
      templates: [
        template("profile-a", features(), {
          status: "opted-out",
          invalidationReason: "matching-disabled",
        }),
        template("profile-b", features(), {
          status: "invalidated",
          invalidationReason: "recalibration",
        }),
      ],
    });
    expect(prediction).toMatchObject({
      state: "no-match",
      reason: "no-eligible-templates",
    });
  });

  it("requires the exact issued prediction for explicit acceptance", () => {
    const controller = new BodyProfilePredictionController();
    const prediction = controller.predict({
      predictionId: "prediction-confirm",
      probe: probe(),
      templates: [template("profile-a")],
    });
    const confirmation = controller.confirm(
      prediction,
      { kind: "accept-prediction", profileId: null },
      1_100,
    );
    expect(confirmation).toEqual({
      schemaVersion: 1,
      predictionId: "prediction-confirm",
      attemptId: "attempt-1",
      epochId: "epoch-1",
      confirmedAtMs: 1_100,
      disposition: "accepted-prediction",
      selectedProfileId: "profile-a",
      matchingPreference: "unchanged",
      advisorySelectionOnly: true,
      grantsProfileAuthority: false,
      grantsCalibrationAuthority: false,
      grantsSaveAuthority: false,
    });
    expect(() =>
      controller.confirm(
        prediction,
        { kind: "accept-prediction", profileId: null },
        1_200,
      ),
    ).toThrow(/already consumed/);
  });

  it("rejects cloned, cross-controller, early, and expired confirmations", () => {
    const controller = new BodyProfilePredictionController();
    const prediction = controller.predict({
      predictionId: "prediction-bound",
      probe: probe(),
      templates: [template("profile-a")],
    });
    const clone = structuredClone(prediction);
    expect(() =>
      controller.confirm(
        clone,
        { kind: "accept-prediction", profileId: null },
        1_100,
      ),
    ).toThrow(/not issued/);
    expect(() =>
      new BodyProfilePredictionController().confirm(
        prediction,
        { kind: "accept-prediction", profileId: null },
        1_100,
      ),
    ).toThrow(/not issued/);
    expect(() =>
      controller.confirm(
        prediction,
        { kind: "accept-prediction", profileId: null },
        999,
      ),
    ).toThrow(/precedes/);
    expect(() =>
      controller.confirm(
        prediction,
        { kind: "accept-prediction", profileId: null },
        1_000 + BODY_PROFILE_PREDICTION_WINDOW_MS + 1,
      ),
    ).toThrow(/expired/);
  });

  it("supports deliberate correction, New Player, and matching opt-out", () => {
    const templates = [
      template("profile-a"),
      template("profile-b", features(0.25)),
    ];
    const correctedController = new BodyProfilePredictionController();
    const correctedPrediction = correctedController.predict({
      predictionId: "prediction-correct",
      probe: probe(),
      templates,
    });
    expect(
      correctedController.confirm(
        correctedPrediction,
        { kind: "select-profile", profileId: "profile-b" },
        1_100,
      ),
    ).toMatchObject({
      disposition: "corrected-profile",
      selectedProfileId: "profile-b",
      grantsProfileAuthority: false,
    });

    const newController = new BodyProfilePredictionController();
    const newPrediction = newController.predict({
      predictionId: "prediction-new",
      probe: probe(),
      templates,
    });
    expect(
      newController.confirm(
        newPrediction,
        { kind: "new-player", profileId: null },
        1_100,
      ),
    ).toMatchObject({
      disposition: "new-player",
      selectedProfileId: null,
      matchingPreference: "unchanged",
    });

    const optOutController = new BodyProfilePredictionController();
    const optOutPrediction = optOutController.predict({
      predictionId: "prediction-opt-out",
      probe: probe(),
      templates,
    });
    expect(
      optOutController.confirm(
        optOutPrediction,
        { kind: "opt-out", profileId: null },
        1_100,
      ),
    ).toMatchObject({
      disposition: "matching-opt-out",
      selectedProfileId: null,
      matchingPreference: "disabled",
    });
  });

  it("does not allow a correction to an inactive, absent, or invented profile", () => {
    const controller = new BodyProfilePredictionController();
    const prediction = controller.predict({
      predictionId: "prediction-correction-scope",
      probe: probe(),
      templates: [
        template("profile-a"),
        template("profile-disabled", features(0.25), {
          status: "opted-out",
          invalidationReason: "matching-disabled",
        }),
      ],
    });
    expect(() =>
      controller.confirm(
        prediction,
        { kind: "select-profile", profileId: "profile-disabled" },
        1_100,
      ),
    ).toThrow(/not active/);
    expect(() =>
      controller.confirm(
        prediction,
        { kind: "select-profile", profileId: "profile-invented" },
        1_100,
      ),
    ).toThrow(/not active/);
  });

  it("rejects duplicate profiles and unsupported template versions", () => {
    const controller = new BodyProfilePredictionController();
    expect(() =>
      controller.predict({
        predictionId: "prediction-duplicate",
        probe: probe(),
        templates: [template("profile-a"), template("profile-a")],
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      BodyProfileTemplateSchema.parse({
        ...template("profile-a"),
        schemaVersion: 2,
      }),
    ).toThrow();
  });

  it("rejects portrait, face, appearance, identity, and name canaries", () => {
    const forbidden = [
      ["portraitPixels", [255, 216, 255]],
      ["portraitHandle", "portrait-fixture-1"],
      ["faceEmbedding", [0.1, 0.2]],
      ["noseCoordinate", { x: 0.5, y: 0.4 }],
      ["displayName", "Alex"],
      ["email", "alex@example.invalid"],
    ] as const;
    for (const [key, value] of forbidden) {
      expect(() =>
        BodyProfileProbeSchema.parse({ ...probe(), [key]: value }),
      ).toThrow();
      expect(() =>
        BodyProfileTemplateSchema.parse({
          ...template("profile-a"),
          features: { ...features(), [key]: value },
        }),
      ).toThrow();
    }
  });

  it("models vault loss/factory reset as no templates and fresh recreation only", () => {
    const afterLoss = new BodyProfilePredictionController().predict({
      predictionId: "prediction-after-loss",
      probe: probe(),
      templates: [],
    });
    expect(afterLoss).toMatchObject({
      state: "no-match",
      reason: "no-eligible-templates",
    });
    const fresh = new BodyProfilePredictionController().predict({
      predictionId: "prediction-after-recreation",
      probe: probe({ attemptId: "attempt-fresh" }),
      templates: [template("fresh-profile")],
    });
    expect(fresh).toMatchObject({
      state: "predicted",
      predictedProfileId: "fresh-profile",
    });
  });

  it("exports closed Draft 2020-12 schemas", () => {
    expect(bodyProfileTemplateJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
    });
    expect(bodyProfilePredictionJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      additionalProperties: false,
    });
    expect(
      BodyProfileConfirmedSelectionSchema.safeParse({
        schemaVersion: 1,
        predictionId: "prediction-1",
        attemptId: "attempt-1",
        epochId: "epoch-1",
        confirmedAtMs: 1_100,
        disposition: "accepted-prediction",
        selectedProfileId: "profile-a",
        matchingPreference: "unchanged",
        advisorySelectionOnly: true,
        grantsProfileAuthority: true,
        grantsCalibrationAuthority: false,
        grantsSaveAuthority: false,
      }).success,
    ).toBe(false);
  });
});
