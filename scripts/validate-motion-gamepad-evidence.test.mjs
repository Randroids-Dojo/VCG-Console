import assert from "node:assert/strict";
import test from "node:test";

import {
  validateMotionGamepadEvidence,
  validateTrackedMotionGamepadEvidence,
} from "./validate-motion-gamepad-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedMotionGamepadEvidence());
}

async function rejects(mutator, pattern = /Expected values|exactly match|must/) {
  const artifact = await fixture();
  const expected = structuredClone(artifact);
  mutator(artifact);
  assert.throws(() => validateMotionGamepadEvidence(artifact, expected), pattern);
}

test("accepts the exact three-genre camera-free evidence", async () => {
  const artifact = await fixture();
  assert.deepEqual(artifact.summary, {
    genreCount: 3,
    checkCount: 12,
    passedCheckCount: 12,
    candidateSoftwarePathCount: 2,
    unsupportedCount: 1,
    completedPlayTestCount: 0,
    measuredLatencyCount: 0,
    comfortFindingCount: 0,
  });
});

test("rejects a fabricated play-test, latency, or comfort claim", async () => {
  await rejects((artifact) => {
    artifact.mappingResults[0].playTestCompleted = true;
    artifact.summary.completedPlayTestCount = 1;
  });
  await rejects((artifact) => {
    artifact.mappingResults[0].measuredEndToEndLatencyMs = 12;
    artifact.summary.measuredLatencyCount = 1;
  });
  await rejects((artifact) => {
    artifact.mappingResults[0].comfortFinding = "comfortable";
    artifact.summary.comfortFindingCount = 1;
  });
});

test("rejects making the incomplete racing mapping launchable", async () => {
  await rejects((artifact) => {
    artifact.policy.incompleteMappingLaunchable = true;
  });
  await rejects((artifact) => {
    artifact.mappingResults[1].disposition = "camera-free-software-path-only";
    artifact.summary.candidateSoftwarePathCount = 3;
    artifact.summary.unsupportedCount = 0;
  });
});

test("rejects hidden throttle or brake coverage", async () => {
  await rejects((artifact) => {
    artifact.mappingResults[1].missingFunctions = [];
    artifact.mappingResults[1].coverage = "candidate-complete";
  });
});

test("rejects shell or reserved input delivery", async () => {
  await rejects((artifact) => {
    artifact.policy.shellActionsDeliverableToGame = true;
  });
  await rejects((artifact) => {
    artifact.policy.reservedHomeBackPauseDeliverableToGame = true;
  });
});

test("rejects removal of title, player, or tracker binding", async () => {
  await rejects((artifact) => {
    artifact.policy.exactTitleMappingRequired = false;
  });
  await rejects((artifact) => {
    artifact.policy.exactAuthorizedPlayerRequired = false;
  });
  await rejects((artifact) => {
    artifact.policy.trackerReadyRequired = false;
  });
});

test("rejects a stuck button after tracker loss", async () => {
  await rejects((artifact) => {
    artifact.representativeOutputs.platformerHealthReleased.buttons.south = true;
  });
});

test("rejects reserved virtual-gamepad button fields", async () => {
  await rejects(
    (artifact) => {
      artifact.representativeOutputs.platformerActive.buttons.home = true;
    },
    /keys must be exactly|must not expose/,
  );
});

test("rejects mapping reordering or substitution", async () => {
  await rejects(
    (artifact) => {
      artifact.mappingResults.reverse();
    },
    /exact ordered three-genre contract/,
  );
});

test("rejects stale source provenance or undeclared qualification", async () => {
  await rejects((artifact) => {
    artifact.provenance.implementationSha256 = "0".repeat(64);
  });
  await rejects(
    (artifact) => {
      artifact.playable = true;
    },
    /artifact keys must be exactly/,
  );
});
