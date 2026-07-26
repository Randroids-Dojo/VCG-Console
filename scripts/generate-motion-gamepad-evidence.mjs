import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MOTION_GAMEPAD_MAPPING_DEFINITIONS,
  MotionGamepadEmulator,
} from "@vcg/motion-contract";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "benchmarks/motion-gamepad/camera-free-three-genre-v1.json",
);

export const MOTION_GAMEPAD_EVIDENCE_FORMAT =
  "vcg-motion-gamepad-three-genre-evidence/v1";

const provenancePaths = {
  implementationPath: "packages/motion-contract/src/gamepad-emulation.ts",
  contractTestPath: "packages/motion-contract/tests/gamepad-emulation.test.ts",
  generatorPath: "scripts/generate-motion-gamepad-evidence.mjs",
  validatorPath: "scripts/validate-motion-gamepad-evidence.mjs",
};

function sha256(value) {
  const normalized = value.toString("utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

async function buildProvenance() {
  const [implementation, contractTest, generator, validator] = await Promise.all([
    readFile(resolve(root, provenancePaths.implementationPath)),
    readFile(resolve(root, provenancePaths.contractTestPath)),
    readFile(resolve(root, provenancePaths.generatorPath)),
    readFile(resolve(root, provenancePaths.validatorPath)),
  ]);
  return {
    ...provenancePaths,
    implementationSha256: sha256(implementation),
    contractTestSha256: sha256(contractTest),
    generatorSha256: sha256(generator),
    validatorSha256: sha256(validator),
  };
}

function action(name, occurredAtMs) {
  if (["jump", "duck", "dodge_left", "dodge_right"].includes(name)) {
    return { name, phase: "triggered", confidence: 0.9, occurredAtMs };
  }
  return {
    name,
    phase: "triggered",
    confidence: 0.9,
    occurredAtMs,
    durationMs: 500,
  };
}

function sample(sequence, occurredAtMs, overrides = {}) {
  return {
    epochId: "three-genre-evidence",
    sequence,
    occurredAtMs,
    trackerHealth: "ready",
    playerAuthorized: true,
    leanX: 0,
    actions: [],
    ...overrides,
  };
}

function adapter(mappingId, gameId) {
  return new MotionGamepadEmulator({
    epochId: "three-genre-evidence",
    gameId,
    mappingId,
  });
}

function check(id, passed, detail) {
  return { id, passed, detail };
}

function buildFunctionalEvidence() {
  const platformer = adapter("platformer-lean-actions-v1", "fixture-platformer");
  const platformerActive = platformer.update(
    sample(0, 100, {
      leanX: 0.575,
      actions: [action("jump", 100), action("duck", 100)],
    }),
  );
  const platformerReleased = platformer.update(sample(1, 180));
  const platformerShellBlocked = platformer.update(
    sample(2, 200, {
      actions: [
        action("pause", 200),
        action("menu_back", 200),
        action("menu_select", 200),
      ],
    }),
  );
  platformer.update(sample(3, 210, { actions: [action("jump", 210)] }));
  const platformerHealthReleased = platformer.update(
    sample(4, 220, { trackerHealth: "degraded", leanX: 1 }),
  );

  const arcade = adapter("arcade-lean-actions-v1", "fixture-arcade");
  const arcadeActive = arcade.update(
    sample(0, 100, {
      leanX: -0.575,
      actions: [
        action("jump", 100),
        action("duck", 100),
        action("dodge_left", 100),
        action("dodge_right", 100),
      ],
    }),
  );
  const arcadeAuthorityReleased = arcade.update(
    sample(1, 110, { playerAuthorized: false, leanX: -1 }),
  );

  const racing = adapter("racing-steer-only-v1", "fixture-racing");
  const racingUnsupported = racing.update(
    sample(0, 100, {
      leanX: 1,
      actions: [action("jump", 100), action("duck", 100)],
    }),
  );

  const mappingResults = [
    {
      mappingId: "platformer-lean-actions-v1",
      genre: "platformer",
      coverage: "candidate-complete",
      requiredFunctions: [
        "move-horizontal",
        "jump",
        "crouch",
        "dodge-left",
        "dodge-right",
      ],
      missingFunctions: [],
      disposition: "camera-free-software-path-only",
      playTestCompleted: false,
      measuredEndToEndLatencyMs: null,
      comfortFinding: null,
      checks: [
        check(
          "lean-rescales-to-left-stick",
          platformerActive.axes.leftStickX === 0.5,
          "A bounded +0.575 lean feature becomes +0.5 left-stick X after the deadzone.",
        ),
        check(
          "jump-and-crouch-bind-explicitly",
          platformerActive.buttons.south && platformerActive.buttons.dpadDown,
          "Jump maps to South and Duck maps to D-pad Down only in the title-bound platformer mapping.",
        ),
        check(
          "button-pulses-release",
          !platformerReleased.buttons.south && !platformerReleased.buttons.dpadDown,
          "Discrete buttons release at the fixed 80 ms boundary.",
        ),
        check(
          "shell-actions-never-bind",
          platformerShellBlocked.blockedActions.join(",") ===
            "pause,menu_back,menu_select" &&
            Object.values(platformerShellBlocked.buttons).every((value) => !value),
          "Pause, Back, and Select shell actions are reported blocked and emit no gamepad button.",
        ),
        check(
          "tracker-loss-releases",
          platformerHealthReleased.state === "released" &&
            platformerHealthReleased.releaseReason === "tracker-not-ready" &&
            platformerHealthReleased.axes.leftStickX === 0 &&
            Object.values(platformerHealthReleased.buttons).every((value) => !value),
          "Non-ready tracker health clears axes and held pulses immediately.",
        ),
      ],
    },
    {
      mappingId: "racing-steer-only-v1",
      genre: "racing",
      coverage: "incomplete",
      requiredFunctions: ["steer", "throttle", "brake"],
      missingFunctions: ["continuous-throttle", "continuous-brake"],
      disposition: "unsupported",
      playTestCompleted: false,
      measuredEndToEndLatencyMs: null,
      comfortFinding: null,
      checks: [
        check(
          "steering-alone-is-insufficient",
          MOTION_GAMEPAD_MAPPING_DEFINITIONS["racing-steer-only-v1"].coverage ===
            "incomplete",
          "Lean can propose steering but cannot supply required continuous throttle and brake.",
        ),
        check(
          "incomplete-mapping-emits-nothing",
          racingUnsupported.state === "unsupported" &&
            racingUnsupported.axes.leftStickX === 0 &&
            Object.values(racingUnsupported.buttons).every((value) => !value),
          "An incomplete genre mapping fails closed instead of launching with partial controls.",
        ),
        check(
          "racing-play-claim-withheld",
          racingUnsupported.releaseReason === "mapping-incomplete",
          "The adapter exposes the incomplete mapping reason and no playability conclusion.",
        ),
      ],
    },
    {
      mappingId: "arcade-lean-actions-v1",
      genre: "arcade",
      coverage: "candidate-complete",
      requiredFunctions: [
        "move-horizontal",
        "primary-action",
        "secondary-action",
        "left-action",
        "right-action",
      ],
      missingFunctions: [],
      disposition: "camera-free-software-path-only",
      playTestCompleted: false,
      measuredEndToEndLatencyMs: null,
      comfortFinding: null,
      checks: [
        check(
          "arcade-lean-rescales",
          arcadeActive.axes.leftStickX === -0.5,
          "A bounded -0.575 lean feature becomes -0.5 left-stick X.",
        ),
        check(
          "arcade-actions-bind-explicitly",
          arcadeActive.buttons.south &&
            arcadeActive.buttons.west &&
            arcadeActive.buttons.leftShoulder &&
            arcadeActive.buttons.rightShoulder &&
            !arcadeActive.buttons.dpadDown,
          "Four obstacle actions map to the arcade title's explicit ordinary buttons.",
        ),
        check(
          "mapping-remains-title-specific",
          arcadeActive.buttons.west && !platformerActive.buttons.west,
          "Duck differs across the arcade and platformer mappings rather than using a hidden global remap.",
        ),
        check(
          "authority-loss-releases",
          arcadeAuthorityReleased.state === "released" &&
            arcadeAuthorityReleased.releaseReason === "authority-lost" &&
            arcadeAuthorityReleased.axes.leftStickX === 0 &&
            Object.values(arcadeAuthorityReleased.buttons).every((value) => !value),
          "Loss of exact player authority clears axes and held pulses immediately.",
        ),
      ],
    },
  ];

  return {
    mappingResults,
    representativeOutputs: {
      platformerActive,
      platformerReleased,
      platformerShellBlocked,
      platformerHealthReleased,
      racingUnsupported,
      arcadeActive,
      arcadeAuthorityReleased,
    },
  };
}

export async function generateMotionGamepadEvidence() {
  const functional = buildFunctionalEvidence();
  const checks = functional.mappingResults.flatMap((result) => result.checks);
  return {
    format: MOTION_GAMEPAD_EVIDENCE_FORMAT,
    evidenceDate: "2026-07-24",
    evidenceClass: "camera-free-synthetic-adapter",
    qualification: "not-a-play-test",
    policy: {
      exactTitleMappingRequired: true,
      exactAuthorizedPlayerRequired: true,
      trackerReadyRequired: true,
      shellActionsDeliverableToGame: false,
      reservedHomeBackPauseDeliverableToGame: false,
      incompleteMappingLaunchable: false,
      nativeVirtualDeviceImplemented: false,
    },
    ...functional,
    summary: {
      genreCount: functional.mappingResults.length,
      checkCount: checks.length,
      passedCheckCount: checks.filter(({ passed }) => passed).length,
      candidateSoftwarePathCount: functional.mappingResults.filter(
        ({ disposition }) => disposition === "camera-free-software-path-only",
      ).length,
      unsupportedCount: functional.mappingResults.filter(
        ({ disposition }) => disposition === "unsupported",
      ).length,
      completedPlayTestCount: functional.mappingResults.filter(
        ({ playTestCompleted }) => playTestCompleted,
      ).length,
      measuredLatencyCount: functional.mappingResults.filter(
        ({ measuredEndToEndLatencyMs }) => measuredEndToEndLatencyMs !== null,
      ).length,
      comfortFindingCount: functional.mappingResults.filter(
        ({ comfortFinding }) => comfortFinding !== null,
      ).length,
    },
    provenance: await buildProvenance(),
    claimBoundary:
      "Camera-free deterministic adapter evidence only. It proves authored mapping, pulse, replay, health, authority, and reserved-action behavior; it does not prove that any unmodified game receives a native virtual controller, is playable, meets latency gates, or is comfortable for a person.",
    limitations: [
      "The lean feature is injected directly and is not measured from a camera, tracker, calibrated body, or player.",
      "No native Linux virtual gamepad, SDL3 device, compositor, game process, or target appliance is connected.",
      "The fixed 80 ms software pulse is not a measured game-compatible hold duration and adds no end-to-end latency evidence.",
      "No participant attempted a platformer, racing game, or arcade game; comfort, fatigue, comprehension, false actions, and gameplay outcomes are unknown.",
      "The two candidate-complete mappings describe authored function coverage only and are not approved catalog mappings.",
    ],
  };
}

async function main() {
  const artifact = await generateMotionGamepadEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${artifact.summary.genreCount} genres / ${artifact.summary.checkCount} checks to ${outputPath}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
