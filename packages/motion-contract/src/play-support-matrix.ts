import { z } from "zod";
import { CORE_LANDMARK_NAMES, type CoreLandmarkName } from "./landmarks";
import {
  PLAYER_CONTROL_GROUPS,
  assessPlayerControlAvailability,
  type PlayerControlGroup,
} from "./player-availability";
import { MotionPoseSimulator } from "./simulator";

export const PLAY_SUPPORT_MATRIX_SCHEMA_VERSION = 1 as const;
export const PLAY_SUPPORT_MATRIX_ARTIFACT_ID =
  "vcg-seated-partial-assisted-synthetic-matrix-v1" as const;

export const PLAY_SUPPORT_SCENARIO_IDS = [
  "standing-full-independent-controller",
  "seated-full-independent-controller",
  "seated-upper-body-controller",
  "partial-legs-missing-controller",
  "partial-left-side-no-controller",
  "assisted-overlap-controller",
  "assisted-overlap-no-controller",
] as const;

export const PLAY_SUPPORT_ALTERNATE_ROUTES = {
  menuSelect: "canonical-controller-confirm",
  menuBackPause: "reserved-controller-back-pause",
  menuSwipe: "canonical-controller-directional-navigation",
  gameDodge: "title-declared-controller-dodge",
  gameDuck: "title-declared-controller-duck",
  gameJump: "title-declared-controller-jump",
} as const satisfies Readonly<Record<PlayerControlGroup, string>>;

const SHA256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ControlGroupSchema = z.enum(PLAYER_CONTROL_GROUPS);
const ScenarioIdSchema = z.enum(PLAY_SUPPORT_SCENARIO_IDS);
const CoreLandmarkNameSchema = z.enum(CORE_LANDMARK_NAMES);

export const PlaySupportScenarioInputSchema = z.strictObject({
  scenarioId: ScenarioIdSchema,
  posture: z.enum(["standing", "seated"]),
  assistance: z.enum(["independent", "helper-visible-in-play-space"]),
  hiddenLandmarks: z.array(CoreLandmarkNameSchema).max(CORE_LANDMARK_NAMES.length),
  controllerAvailable: z.boolean(),
});

export const PlaySupportControlResultSchema = z.strictObject({
  controlGroup: ControlGroupSchema,
  observedPath: z.enum(["available", "unavailable"]),
  safetyGate: z.enum([
    "permitted",
    "blocked-seated-gameplay-unqualified",
    "blocked-assisted-identity-unqualified",
  ]),
  supportLabel: z.enum([
    "synthetic-motion-path",
    "controller-alternate-only",
    "unsupported",
  ]),
  alternateMapping: z
    .strictObject({
      mappingId: z.literal("canonical-controller-v1"),
      route: z.enum([
        "canonical-controller-confirm",
        "reserved-controller-back-pause",
        "canonical-controller-directional-navigation",
        "title-declared-controller-dodge",
        "title-declared-controller-duck",
        "title-declared-controller-jump",
      ]),
      authority: z.literal("existing-controller-path-only"),
    })
    .nullable(),
});

export const PlaySupportScenarioResultSchema = z.strictObject({
  scenarioId: ScenarioIdSchema,
  posture: PlaySupportScenarioInputSchema.shape.posture,
  assistance: PlaySupportScenarioInputSchema.shape.assistance,
  hiddenLandmarks: PlaySupportScenarioInputSchema.shape.hiddenLandmarks,
  controllerAvailable: z.boolean(),
  availabilityState: z.enum(["full", "partial", "unavailable"]),
  availableMotionControlCountBeforeSafetyGate: z.number().int().min(0).max(6),
  controls: z.array(PlaySupportControlResultSchema).length(PLAYER_CONTROL_GROUPS.length),
});

export const PlaySupportMatrixSchema = z.strictObject({
  schemaVersion: z.literal(PLAY_SUPPORT_MATRIX_SCHEMA_VERSION),
  artifactId: z.literal(PLAY_SUPPORT_MATRIX_ARTIFACT_ID),
  evidenceClass: z.literal("camera-free-synthetic-contract-exercise"),
  evidenceDate: z.literal("2026-07-24"),
  qualification: z.literal("not-product-qualification"),
  policy: z.strictObject({
    seatedGameplayMotionAuthorized: z.literal(false),
    assistedBodyMotionAuthorized: z.literal(false),
    silentLandmarkExtrapolationAuthorized: z.literal(false),
    silentScoreNormalizationAuthorized: z.literal(false),
    newBodyAlternateMappingsAuthorized: z.literal(false),
    standardControllerFallbackRetained: z.literal(true),
    reservedHomeBackPauseRemappable: z.literal(false),
  }),
  scenarios: z.array(PlaySupportScenarioResultSchema).length(PLAY_SUPPORT_SCENARIO_IDS.length),
  summary: z.strictObject({
    scenarioCount: z.literal(PLAY_SUPPORT_SCENARIO_IDS.length),
    controlAssessmentCount: z.literal(
      PLAY_SUPPORT_SCENARIO_IDS.length * PLAYER_CONTROL_GROUPS.length,
    ),
    syntheticMotionPathCount: z.number().int().min(0),
    controllerAlternateOnlyCount: z.number().int().min(0),
    unsupportedCount: z.number().int().min(0),
    safetyBlockedCount: z.number().int().min(0),
  }),
  provenance: z.strictObject({
    implementationPath: z.literal(
      "packages/motion-contract/src/play-support-matrix.ts",
    ),
    implementationSha256: SHA256Schema,
    generatorPath: z.literal("scripts/generate-play-support-matrix.mjs"),
    generatorSha256: SHA256Schema,
    validatorPath: z.literal("scripts/validate-play-support-matrix.mjs"),
    validatorSha256: SHA256Schema,
  }),
  claimBoundary: z.literal(
    "Camera-free deterministic contract evidence only. It proves bounded software disposition for authored landmark-loss, posture, controller, and visible-helper inputs; it does not prove tracking accuracy, comfort, safety, accessibility, controller assignment, action accuracy, gameplay outcomes, or support for any person.",
  ),
  limitations: z.tuple([
    z.literal("No camera, tracker backend, target device, game, room, or participant was used."),
    z.literal(
      "Seated and assisted gameplay motion remains blocked pending consented evidence and owner-approved mappings.",
    ),
    z.literal(
      "A standard controller route is an explicit fallback, not proof that the controller is present, assigned, reachable, or usable by a participant.",
    ),
    z.literal(
      "The visible-helper gate is a conservative policy exercise and is not yet integrated with multi-person identity tracking.",
    ),
    z.literal(
      "No body-action substitution, threshold change, landmark extrapolation, or score normalization is authorized.",
    ),
  ]),
});

export type PlaySupportScenarioInput = z.infer<typeof PlaySupportScenarioInputSchema>;
export type PlaySupportControlResult = z.infer<typeof PlaySupportControlResultSchema>;
export type PlaySupportScenarioResult = z.infer<typeof PlaySupportScenarioResultSchema>;
export type PlaySupportMatrix = z.infer<typeof PlaySupportMatrixSchema>;

export const PLAY_SUPPORT_SCENARIOS: readonly PlaySupportScenarioInput[] = [
  {
    scenarioId: "standing-full-independent-controller",
    posture: "standing",
    assistance: "independent",
    hiddenLandmarks: [],
    controllerAvailable: true,
  },
  {
    scenarioId: "seated-full-independent-controller",
    posture: "seated",
    assistance: "independent",
    hiddenLandmarks: [],
    controllerAvailable: true,
  },
  {
    scenarioId: "seated-upper-body-controller",
    posture: "seated",
    assistance: "independent",
    hiddenLandmarks: [
      "left_hip",
      "right_hip",
      "left_knee",
      "right_knee",
      "left_ankle",
      "right_ankle",
    ],
    controllerAvailable: true,
  },
  {
    scenarioId: "partial-legs-missing-controller",
    posture: "standing",
    assistance: "independent",
    hiddenLandmarks: ["left_knee", "right_knee", "left_ankle", "right_ankle"],
    controllerAvailable: true,
  },
  {
    scenarioId: "partial-left-side-no-controller",
    posture: "standing",
    assistance: "independent",
    hiddenLandmarks: [
      "left_eye",
      "left_ear",
      "left_shoulder",
      "left_elbow",
      "left_wrist",
      "left_hip",
      "left_knee",
      "left_ankle",
    ],
    controllerAvailable: false,
  },
  {
    scenarioId: "assisted-overlap-controller",
    posture: "seated",
    assistance: "helper-visible-in-play-space",
    hiddenLandmarks: [],
    controllerAvailable: true,
  },
  {
    scenarioId: "assisted-overlap-no-controller",
    posture: "seated",
    assistance: "helper-visible-in-play-space",
    hiddenLandmarks: [],
    controllerAvailable: false,
  },
] as const;

function safetyGate(
  scenario: PlaySupportScenarioInput,
  controlGroup: PlayerControlGroup,
): PlaySupportControlResult["safetyGate"] {
  if (scenario.assistance === "helper-visible-in-play-space") {
    return "blocked-assisted-identity-unqualified";
  }
  if (scenario.posture === "seated" && controlGroup.startsWith("game")) {
    return "blocked-seated-gameplay-unqualified";
  }
  return "permitted";
}

export function assessPlaySupportScenario(
  scenarioValue: PlaySupportScenarioInput,
): PlaySupportScenarioResult {
  const scenario = PlaySupportScenarioInputSchema.parse(scenarioValue);
  const player = structuredClone(new MotionPoseSimulator().frame(0, 0).players[0]!);
  const hidden = new Set<CoreLandmarkName>(scenario.hiddenLandmarks);
  for (const landmark of player.coreLandmarks) {
    if (hidden.has(landmark.name)) {
      landmark.observed = false;
      landmark.visibility = 0;
      landmark.presence = 0;
    }
  }
  const availability = assessPlayerControlAvailability(player, "ready");
  const controls = PLAYER_CONTROL_GROUPS.map((controlGroup) => {
    const gate = safetyGate(scenario, controlGroup);
    const motionAvailable = availability.controls[controlGroup] && gate === "permitted";
    const supportLabel = motionAvailable
      ? "synthetic-motion-path"
      : scenario.controllerAvailable
        ? "controller-alternate-only"
        : "unsupported";
    return {
      controlGroup,
      observedPath: availability.controls[controlGroup] ? "available" : "unavailable",
      safetyGate: gate,
      supportLabel,
      alternateMapping:
        supportLabel === "controller-alternate-only"
          ? {
              mappingId: "canonical-controller-v1" as const,
              route: PLAY_SUPPORT_ALTERNATE_ROUTES[controlGroup],
              authority: "existing-controller-path-only" as const,
            }
          : null,
    };
  });
  return PlaySupportScenarioResultSchema.parse({
    ...scenario,
    availabilityState: availability.state,
    availableMotionControlCountBeforeSafetyGate: PLAYER_CONTROL_GROUPS.filter(
      (controlGroup) => availability.controls[controlGroup],
    ).length,
    controls,
  });
}

export function buildPlaySupportMatrix(
  provenance: PlaySupportMatrix["provenance"],
): PlaySupportMatrix {
  const scenarios = PLAY_SUPPORT_SCENARIOS.map(assessPlaySupportScenario);
  const controls = scenarios.flatMap((scenario) => scenario.controls);
  return PlaySupportMatrixSchema.parse({
    schemaVersion: PLAY_SUPPORT_MATRIX_SCHEMA_VERSION,
    artifactId: PLAY_SUPPORT_MATRIX_ARTIFACT_ID,
    evidenceClass: "camera-free-synthetic-contract-exercise",
    evidenceDate: "2026-07-24",
    qualification: "not-product-qualification",
    policy: {
      seatedGameplayMotionAuthorized: false,
      assistedBodyMotionAuthorized: false,
      silentLandmarkExtrapolationAuthorized: false,
      silentScoreNormalizationAuthorized: false,
      newBodyAlternateMappingsAuthorized: false,
      standardControllerFallbackRetained: true,
      reservedHomeBackPauseRemappable: false,
    },
    scenarios,
    summary: {
      scenarioCount: PLAY_SUPPORT_SCENARIO_IDS.length,
      controlAssessmentCount:
        PLAY_SUPPORT_SCENARIO_IDS.length * PLAYER_CONTROL_GROUPS.length,
      syntheticMotionPathCount: controls.filter(
        ({ supportLabel }) => supportLabel === "synthetic-motion-path",
      ).length,
      controllerAlternateOnlyCount: controls.filter(
        ({ supportLabel }) => supportLabel === "controller-alternate-only",
      ).length,
      unsupportedCount: controls.filter(
        ({ supportLabel }) => supportLabel === "unsupported",
      ).length,
      safetyBlockedCount: controls.filter(
        ({ safetyGate }) => safetyGate !== "permitted",
      ).length,
    },
    provenance,
    claimBoundary:
      "Camera-free deterministic contract evidence only. It proves bounded software disposition for authored landmark-loss, posture, controller, and visible-helper inputs; it does not prove tracking accuracy, comfort, safety, accessibility, controller assignment, action accuracy, gameplay outcomes, or support for any person.",
    limitations: [
      "No camera, tracker backend, target device, game, room, or participant was used.",
      "Seated and assisted gameplay motion remains blocked pending consented evidence and owner-approved mappings.",
      "A standard controller route is an explicit fallback, not proof that the controller is present, assigned, reachable, or usable by a participant.",
      "The visible-helper gate is a conservative policy exercise and is not yet integrated with multi-person identity tracking.",
      "No body-action substitution, threshold change, landmark extrapolation, or score normalization is authorized.",
    ],
  });
}

const forwardCompatibleJsonSchemaOptions = {
  target: "draft-2020-12" as const,
  override: ({ jsonSchema }: { jsonSchema: Record<string, unknown> }) => {
    if (jsonSchema.additionalProperties === false) delete jsonSchema.additionalProperties;
  },
};

export const playSupportMatrixJsonSchema = z.toJSONSchema(
  PlaySupportMatrixSchema,
  forwardCompatibleJsonSchemaOptions,
) as Record<string, unknown>;
playSupportMatrixJsonSchema.$id = "urn:vcg:schema:play-support-matrix:1";
playSupportMatrixJsonSchema.title = "VCG seated, partial-body, and assisted play matrix v1";
playSupportMatrixJsonSchema.$comment =
  "Camera-free contract evidence only. This schema grants no product qualification, remapping authority, action authority, or score-normalization authority.";
