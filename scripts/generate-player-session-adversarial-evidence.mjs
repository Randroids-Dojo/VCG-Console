import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runPlayerSessionAdversarialRehearsal } from "../apps/console-lab/src/player-session-adversarial.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "benchmarks/player-session-interference/camera-free-authority-rehearsal-v1.json",
);

export const PLAYER_SESSION_ADVERSARIAL_EVIDENCE_FORMAT =
  "vcg-player-session-adversarial-evidence/v1";

const provenancePaths = {
  controllerPath: "apps/console-lab/src/player-session.ts",
  rehearsalPath: "apps/console-lab/src/player-session-adversarial.ts",
  generatorPath: "scripts/generate-player-session-adversarial-evidence.mjs",
  validatorPath: "scripts/validate-player-session-adversarial-evidence.mjs",
};

function sha256(value) {
  const normalized = value.toString("utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

async function buildProvenance() {
  const [controller, rehearsal, generator, validator] = await Promise.all([
    readFile(resolve(root, provenancePaths.controllerPath)),
    readFile(resolve(root, provenancePaths.rehearsalPath)),
    readFile(resolve(root, provenancePaths.generatorPath)),
    readFile(resolve(root, provenancePaths.validatorPath)),
  ]);
  return {
    ...provenancePaths,
    controllerSha256: sha256(controller),
    rehearsalSha256: sha256(rehearsal),
    generatorSha256: sha256(generator),
    validatorSha256: sha256(validator),
  };
}

export async function generatePlayerSessionAdversarialEvidence() {
  const report = runPlayerSessionAdversarialRehearsal();
  const checkCount = report.scenarios.reduce(
    (total, scenario) => total + scenario.checks.length,
    0,
  );
  return {
    format: PLAYER_SESSION_ADVERSARIAL_EVIDENCE_FORMAT,
    evidenceDate: "2026-07-24",
    evidenceClass: "camera-free-synthetic-state-machine",
    qualification: "not-physical-qualification",
    invariant:
      "Detection alone grants no join, gameplay, Pause, silent-reacquisition, or takeover authority; one-player takeover requires deliberate Resume from a currently visible candidate after recovery opens.",
    report,
    summary: {
      scenarioCount: report.scenarios.length,
      checkCount,
      interferenceClassCount: report.coveredInterferenceClasses.length,
      falseCandidateObservations: report.totals.falseCandidateObservations,
      authorityFailureCount:
        report.totals.falseJoins +
        report.totals.falseControls +
        report.totals.unintendedTakeovers +
        report.totals.falseActions,
      explicitTakeoverCount: report.totals.explicitTakeovers,
      allChecksPassed: report.passed,
    },
    provenance: await buildProvenance(),
    privacy: {
      rawFramesRetained: false,
      imagesRetained: false,
      landmarksRetained: false,
      bodyMeasurementsRetained: false,
      biometricIdentityUsed: false,
      durableIdentityUsed: false,
      syntheticTrackIdsOnly: true,
    },
    claimBoundary:
      "Deterministic camera-free state-machine evidence only. It proves the authored authority transitions for synthetic opaque tracks; it does not measure false detection, identity stability, action accuracy, latency, comfort, safety, or behavior of a camera, tracker, person, animal, mirror, television, passerby, room, game runtime, or target appliance.",
    limitations: [
      "Interference roles are assigned by the fixture oracle; the runtime does not semantically identify people, animals, reflections, or displays.",
      "Synthetic track continuity does not model detector false positives, identity swaps, overlap, occlusion, tracker restart, or camera error.",
      "The single deliberate takeover proves a state transition, not comprehension, consent, controller assignment, profile/save ownership, or competitive fairness.",
      "The separate 70-cell and 840-trial physical campaign remains unexecuted.",
    ],
  };
}

async function main() {
  const artifact = await generatePlayerSessionAdversarialEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${artifact.summary.scenarioCount} scenarios / ${artifact.summary.checkCount} checks to ${outputPath}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
