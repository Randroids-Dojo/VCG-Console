import { z } from "zod";
import { TrackerHealthStatusSchema } from "./schema";

export const BODY_PROFILE_PREDICTION_SCHEMA_VERSION = 1 as const;
export const BODY_PROFILE_FEATURE_SCHEMA_ID = "core17-body-ratios-v1" as const;
export const BODY_PROFILE_EXTRACTOR_ID =
  "camera-free-synthetic-core17-ratios-v1" as const;
export const BODY_PROFILE_PREDICTION_WINDOW_MS = 20_000 as const;
export const BODY_PROFILE_MAX_TEMPLATES = 16 as const;
export const BODY_PROFILE_MAX_DISTANCE = 0.75 as const;
export const BODY_PROFILE_MIN_SEPARATION = 0.35 as const;

export const BODY_PROFILE_FEATURE_NAMES = [
  "shoulderWidthOverTorso",
  "hipWidthOverTorso",
  "upperArmOverTorso",
  "forearmOverTorso",
  "thighOverTorso",
  "shinOverTorso",
] as const;

const FEATURE_SCALES: Readonly<
  Record<(typeof BODY_PROFILE_FEATURE_NAMES)[number], number>
> = {
  shoulderWidthOverTorso: 0.08,
  hipWidthOverTorso: 0.08,
  upperArmOverTorso: 0.1,
  forearmOverTorso: 0.1,
  thighOverTorso: 0.12,
  shinOverTorso: 0.12,
};

const SafeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const FeatureValueSchema = z.number().finite().min(0.2).max(2.5);

/**
 * Fixed, body-only research vector. Its strict shape deliberately has no
 * image, face, appearance, name, portrait, or authorization field.
 */
export const BodyProfileFeatureVectorSchema = z.strictObject({
  featureSchemaId: z.literal(BODY_PROFILE_FEATURE_SCHEMA_ID),
  extractorId: z.literal(BODY_PROFILE_EXTRACTOR_ID),
  sampleCount: z.number().int().min(30).max(300),
  ratios: z.strictObject({
    shoulderWidthOverTorso: FeatureValueSchema,
    hipWidthOverTorso: FeatureValueSchema,
    upperArmOverTorso: FeatureValueSchema,
    forearmOverTorso: FeatureValueSchema,
    thighOverTorso: FeatureValueSchema,
    shinOverTorso: FeatureValueSchema,
  }),
});

export const BodyProfileTemplateSchema = z
  .strictObject({
    schemaVersion: z.literal(BODY_PROFILE_PREDICTION_SCHEMA_VERSION),
    profileId: SafeIdSchema,
    templateRevision: z.number().int().positive(),
    calibrationRevision: z.number().int().positive(),
    calibrationContextSha256: Sha256Schema,
    status: z.enum(["active", "opted-out", "invalidated"]),
    invalidationReason: z
      .enum([
        "matching-disabled",
        "recalibration",
        "room-or-camera-change",
        "feature-schema-change",
        "vault-key-loss",
        "factory-reset",
        "profile-deleted",
      ])
      .nullable(),
    features: BodyProfileFeatureVectorSchema,
  })
  .superRefine((template, context) => {
    if (template.status === "active" && template.invalidationReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["invalidationReason"],
        message: "active templates cannot carry an invalidation reason",
      });
    }
    if (template.status !== "active" && template.invalidationReason === null) {
      context.addIssue({
        code: "custom",
        path: ["invalidationReason"],
        message: "inactive templates require an explicit invalidation reason",
      });
    }
    if (
      template.status === "opted-out"
      && template.invalidationReason !== "matching-disabled"
    ) {
      context.addIssue({
        code: "custom",
        path: ["invalidationReason"],
        message: "opted-out templates require matching-disabled",
      });
    }
  });

export const BodyProfileProbeSchema = z.strictObject({
  schemaVersion: z.literal(BODY_PROFILE_PREDICTION_SCHEMA_VERSION),
  attemptId: SafeIdSchema,
  epochId: SafeIdSchema,
  occurredAtMs: z.number().finite().nonnegative(),
  trackerHealth: TrackerHealthStatusSchema,
  matchingEnabled: z.boolean(),
  singlePlayerVisible: z.boolean(),
  calibrationContextSha256: Sha256Schema,
  features: BodyProfileFeatureVectorSchema,
});

export const BodyProfilePredictionSchema = z
  .strictObject({
    schemaVersion: z.literal(BODY_PROFILE_PREDICTION_SCHEMA_VERSION),
    predictionId: SafeIdSchema,
    attemptId: SafeIdSchema,
    epochId: SafeIdSchema,
    occurredAtMs: z.number().finite().nonnegative(),
    expiresAtMs: z.number().finite().nonnegative(),
    state: z.enum(["predicted", "ambiguous", "no-match", "unavailable"]),
    reason: z.enum([
      "candidate-separated",
      "distance-threshold",
      "separation-threshold",
      "no-eligible-templates",
      "matching-disabled",
      "tracker-not-ready",
      "not-single-player",
      "calibration-context-mismatch",
    ]),
    predictedProfileId: SafeIdSchema.nullable(),
    confidenceBand: z.enum(["candidate-high"]).nullable(),
    requiresExplicitConfirmation: z.literal(true),
    grantsProfileAuthority: z.literal(false),
    portraitInputUsed: z.literal(false),
    facialInputUsed: z.literal(false),
  })
  .superRefine((prediction, context) => {
    const hasCandidate = prediction.state === "predicted";
    if (hasCandidate !== (prediction.predictedProfileId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["predictedProfileId"],
        message: "only predicted results carry a profile candidate",
      });
    }
    if (hasCandidate !== (prediction.confidenceBand === "candidate-high")) {
      context.addIssue({
        code: "custom",
        path: ["confidenceBand"],
        message: "only predicted results carry a confidence band",
      });
    }
    if (hasCandidate !== (prediction.reason === "candidate-separated")) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "predicted results require candidate-separated",
      });
    }
    if (prediction.expiresAtMs <= prediction.occurredAtMs) {
      context.addIssue({
        code: "custom",
        path: ["expiresAtMs"],
        message: "prediction expiry must follow occurrence",
      });
    }
  });

export const BodyProfileConfirmationDecisionSchema = z
  .strictObject({
    kind: z.enum([
      "accept-prediction",
      "select-profile",
      "new-player",
      "opt-out",
    ]),
    profileId: SafeIdSchema.nullable(),
  })
  .superRefine((decision, context) => {
    const requiresProfile = decision.kind === "select-profile";
    if (requiresProfile !== (decision.profileId !== null)) {
      context.addIssue({
        code: "custom",
        path: ["profileId"],
        message: "only select-profile carries an explicit profile ID",
      });
    }
  });

export const BodyProfileConfirmedSelectionSchema = z.strictObject({
  schemaVersion: z.literal(BODY_PROFILE_PREDICTION_SCHEMA_VERSION),
  predictionId: SafeIdSchema,
  attemptId: SafeIdSchema,
  epochId: SafeIdSchema,
  confirmedAtMs: z.number().finite().nonnegative(),
  disposition: z.enum([
    "accepted-prediction",
    "corrected-profile",
    "new-player",
    "matching-opt-out",
  ]),
  selectedProfileId: SafeIdSchema.nullable(),
  matchingPreference: z.enum(["enabled", "disabled", "unchanged"]),
  advisorySelectionOnly: z.literal(true),
  grantsProfileAuthority: z.literal(false),
  grantsCalibrationAuthority: z.literal(false),
  grantsSaveAuthority: z.literal(false),
});

export type BodyProfileFeatureVector = z.infer<
  typeof BodyProfileFeatureVectorSchema
>;
export type BodyProfileTemplate = z.infer<typeof BodyProfileTemplateSchema>;
export type BodyProfileProbe = z.infer<typeof BodyProfileProbeSchema>;
export type BodyProfilePrediction = z.infer<typeof BodyProfilePredictionSchema>;
export type BodyProfileConfirmationDecision = z.infer<
  typeof BodyProfileConfirmationDecisionSchema
>;
export type BodyProfileConfirmedSelection = z.infer<
  typeof BodyProfileConfirmedSelectionSchema
>;

interface IssuedPrediction {
  readonly activeProfileIds: ReadonlySet<string>;
  consumed: boolean;
}

function normalizedDistance(
  left: BodyProfileFeatureVector,
  right: BodyProfileFeatureVector,
): number {
  let squared = 0;
  for (const name of BODY_PROFILE_FEATURE_NAMES) {
    const delta = (left.ratios[name] - right.ratios[name]) / FEATURE_SCALES[name];
    squared += delta * delta;
  }
  return Math.sqrt(squared / BODY_PROFILE_FEATURE_NAMES.length);
}

function result(
  predictionId: string,
  probe: BodyProfileProbe,
  state: BodyProfilePrediction["state"],
  reason: BodyProfilePrediction["reason"],
  predictedProfileId: string | null = null,
): BodyProfilePrediction {
  return BodyProfilePredictionSchema.parse({
    schemaVersion: BODY_PROFILE_PREDICTION_SCHEMA_VERSION,
    predictionId,
    attemptId: probe.attemptId,
    epochId: probe.epochId,
    occurredAtMs: probe.occurredAtMs,
    expiresAtMs: probe.occurredAtMs + BODY_PROFILE_PREDICTION_WINDOW_MS,
    state,
    reason,
    predictedProfileId,
    confidenceBand: predictedProfileId === null ? null : "candidate-high",
    requiresExplicitConfirmation: true,
    grantsProfileAuthority: false,
    portraitInputUsed: false,
    facialInputUsed: false,
  });
}

/**
 * Camera-free, research-only predictor and exact confirmation boundary.
 *
 * Prediction is advisory. Even an accepted candidate returns no profile,
 * calibration, save, launch, or mutation authority. A privileged profile
 * service must separately authorize the user's explicit selection.
 */
export class BodyProfilePredictionController {
  readonly #issued = new WeakMap<BodyProfilePrediction, IssuedPrediction>();

  predict(input: {
    predictionId: string;
    probe: BodyProfileProbe;
    templates: readonly BodyProfileTemplate[];
  }): BodyProfilePrediction {
    const predictionId = SafeIdSchema.parse(input.predictionId);
    const probe = BodyProfileProbeSchema.parse(input.probe);
    const templates = z
      .array(BodyProfileTemplateSchema)
      .max(BODY_PROFILE_MAX_TEMPLATES)
      .parse(input.templates);

    const profileIds = new Set<string>();
    for (const template of templates) {
      if (profileIds.has(template.profileId)) {
        throw new Error(`duplicate body-profile template: ${template.profileId}`);
      }
      profileIds.add(template.profileId);
    }

    const active = templates.filter(({ status }) => status === "active");
    let prediction: BodyProfilePrediction;
    if (!probe.matchingEnabled) {
      prediction = result(
        predictionId,
        probe,
        "unavailable",
        "matching-disabled",
      );
    } else if (probe.trackerHealth !== "ready") {
      prediction = result(
        predictionId,
        probe,
        "unavailable",
        "tracker-not-ready",
      );
    } else if (!probe.singlePlayerVisible) {
      prediction = result(
        predictionId,
        probe,
        "unavailable",
        "not-single-player",
      );
    } else if (active.length === 0) {
      prediction = result(
        predictionId,
        probe,
        "no-match",
        "no-eligible-templates",
      );
    } else {
      const eligible = active.filter(
        ({ calibrationContextSha256 }) =>
          calibrationContextSha256 === probe.calibrationContextSha256,
      );
      if (eligible.length === 0) {
        prediction = result(
          predictionId,
          probe,
          "unavailable",
          "calibration-context-mismatch",
        );
      } else {
        const ranked = eligible
          .map((template) => ({
            profileId: template.profileId,
            distance: normalizedDistance(probe.features, template.features),
          }))
          .sort(
            (left, right) =>
              left.distance - right.distance
              || left.profileId.localeCompare(right.profileId),
          );
        const best = ranked[0]!;
        const second = ranked[1];
        if (best.distance > BODY_PROFILE_MAX_DISTANCE) {
          prediction = result(
            predictionId,
            probe,
            "no-match",
            "distance-threshold",
          );
        } else if (
          second !== undefined
          && second.distance - best.distance < BODY_PROFILE_MIN_SEPARATION
        ) {
          prediction = result(
            predictionId,
            probe,
            "ambiguous",
            "separation-threshold",
          );
        } else {
          prediction = result(
            predictionId,
            probe,
            "predicted",
            "candidate-separated",
            best.profileId,
          );
        }
      }
    }

    this.#issued.set(prediction, {
      activeProfileIds: new Set(active.map(({ profileId }) => profileId)),
      consumed: false,
    });
    return prediction;
  }

  confirm(
    prediction: BodyProfilePrediction,
    decisionValue: BodyProfileConfirmationDecision,
    confirmedAtMs: number,
  ): BodyProfileConfirmedSelection {
    const issuance = this.#issued.get(prediction);
    if (issuance === undefined) {
      throw new Error("prediction was not issued by this controller");
    }
    if (issuance.consumed) {
      throw new Error("prediction was already consumed");
    }
    const checkedPrediction = BodyProfilePredictionSchema.parse(prediction);
    const decision = BodyProfileConfirmationDecisionSchema.parse(decisionValue);
    const timestamp = z.number().finite().nonnegative().parse(confirmedAtMs);
    if (timestamp < checkedPrediction.occurredAtMs) {
      throw new Error("confirmation precedes prediction");
    }
    if (timestamp > checkedPrediction.expiresAtMs) {
      throw new Error("prediction confirmation expired");
    }

    let disposition: BodyProfileConfirmedSelection["disposition"];
    let selectedProfileId: string | null;
    let matchingPreference: BodyProfileConfirmedSelection["matchingPreference"];
    switch (decision.kind) {
      case "accept-prediction":
        if (
          checkedPrediction.state !== "predicted"
          || checkedPrediction.predictedProfileId === null
        ) {
          throw new Error("there is no prediction to accept");
        }
        disposition = "accepted-prediction";
        selectedProfileId = checkedPrediction.predictedProfileId;
        matchingPreference = "unchanged";
        break;
      case "select-profile":
        if (
          decision.profileId === null
          || !issuance.activeProfileIds.has(decision.profileId)
        ) {
          throw new Error("corrected profile is not active in this attempt");
        }
        disposition = "corrected-profile";
        selectedProfileId = decision.profileId;
        matchingPreference = "unchanged";
        break;
      case "new-player":
        disposition = "new-player";
        selectedProfileId = null;
        matchingPreference = "unchanged";
        break;
      case "opt-out":
        disposition = "matching-opt-out";
        selectedProfileId = null;
        matchingPreference = "disabled";
        break;
    }

    issuance.consumed = true;
    return BodyProfileConfirmedSelectionSchema.parse({
      schemaVersion: BODY_PROFILE_PREDICTION_SCHEMA_VERSION,
      predictionId: checkedPrediction.predictionId,
      attemptId: checkedPrediction.attemptId,
      epochId: checkedPrediction.epochId,
      confirmedAtMs: timestamp,
      disposition,
      selectedProfileId,
      matchingPreference,
      advisorySelectionOnly: true,
      grantsProfileAuthority: false,
      grantsCalibrationAuthority: false,
      grantsSaveAuthority: false,
    });
  }
}

export const bodyProfileTemplateJsonSchema = z.toJSONSchema(
  BodyProfileTemplateSchema,
  {
    target: "draft-2020-12",
    reused: "ref",
  },
);

export const bodyProfileProbeJsonSchema = z.toJSONSchema(BodyProfileProbeSchema, {
  target: "draft-2020-12",
  reused: "ref",
});

export const bodyProfilePredictionJsonSchema = z.toJSONSchema(
  BodyProfilePredictionSchema,
  {
    target: "draft-2020-12",
    reused: "ref",
  },
);

export const bodyProfileConfirmedSelectionJsonSchema = z.toJSONSchema(
  BodyProfileConfirmedSelectionSchema,
  {
    target: "draft-2020-12",
    reused: "ref",
  },
);
