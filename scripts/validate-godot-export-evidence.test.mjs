import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedGodotExportProvenance,
  validateGodotExportEvidence,
  validateTrackedGodotExportEvidence,
} from "./validate-godot-export-evidence.mjs";

async function fixture() {
  return structuredClone(await validateTrackedGodotExportEvidence());
}

async function rejects(mutator, pattern) {
  const artifact = await fixture();
  mutator(artifact);
  const provenance = await expectedGodotExportProvenance();
  const operation = () => validateGodotExportEvidence(artifact, provenance);
  if (pattern === undefined) assert.throws(operation);
  else assert.throws(operation, pattern);
}

test("accepts the exact Godot export and browser evidence", async () => {
  const artifact = await fixture();
  assert.equal(artifact.summary.exportCount, 3);
  assert.equal(artifact.browser.document.readyState, "complete");
  assert.equal(artifact.outputs.linuxX86_64.boot.exitCode, 0);
  assert.equal(artifact.outputs.linuxArm64.executionAttempted, false);
});

test("rejects template archive or selected-template drift", async () => {
  await rejects((artifact) => {
    artifact.toolchain.templateArchive.sha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.toolchain.installedTemplates[2].bytes += 1;
  });
});

test("rejects release-file hash, size, or target substitution", async () => {
  await rejects((artifact) => {
    artifact.outputs.web.files.at(-1).sha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.outputs.linuxX86_64.files[0].bytes += 1;
    artifact.outputs.linuxX86_64.totalBytes += 1;
  });
  await rejects((artifact) => {
    artifact.outputs.linuxArm64.elf.machine = "x86-64";
  });
});

test("rejects incomplete or substituted browser state", async () => {
  await rejects((artifact) => {
    artifact.browser.document.readyState = "interactive";
  });
  await rejects((artifact) => {
    artifact.browser.initial.status = "READY";
  });
  await rejects((artifact) => {
    artifact.browser.afterJump.inputSource = "motion";
  });
});

test("rejects hiding the observed aborted WASM request or browser errors", async () => {
  await rejects((artifact) => {
    artifact.browser.abortedWasmFetchCount = 0;
    artifact.browser.requestFailureCount = 0;
  });
  await rejects((artifact) => {
    artifact.browser.consoleErrorCount = 1;
  });
  await rejects((artifact) => {
    artifact.browser.requiredAssetHttpSuccessCount = 3;
  });
});

test("rejects promoting keyboard fallback into controller or Motion proof", async () => {
  await rejects((artifact) => {
    artifact.disposition.physicalGamepadVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.liveMotionBridgeNegotiationVerified = true;
  });
  await rejects((artifact) => {
    artifact.summary.physicalControllerCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.motionFrameCount = 1;
  });
});

test("rejects target Linux, ARM execution, package, or latency promotion", async () => {
  await rejects((artifact) => {
    artifact.disposition.linuxTargetQualified = true;
  });
  await rejects((artifact) => {
    artifact.outputs.linuxArm64.executionAttempted = true;
  });
  await rejects((artifact) => {
    artifact.disposition.signedPackageLaunchVerified = true;
  });
  await rejects((artifact) => {
    artifact.disposition.latencyQualified = true;
  });
});

test("rejects WSL boot and environment substitution", async () => {
  await rejects((artifact) => {
    artifact.outputs.linuxX86_64.boot.exitCode = 1;
  });
  await rejects((artifact) => {
    artifact.outputs.linuxX86_64.boot.environment = "target-Linux";
  });
  await rejects((artifact) => {
    artifact.environment.browserProduct = "Chrome/151.0.0.0";
  });
});

test("rejects fabricated participants or target hardware", async () => {
  await rejects((artifact) => {
    artifact.summary.participantCount = 1;
  });
  await rejects((artifact) => {
    artifact.summary.targetHardwareCount = 1;
  });
});

test("rejects stale provenance, weakened limitations, and unknown claims", async () => {
  await rejects((artifact) => {
    artifact.provenance.mainScriptPathSha256 = "0".repeat(64);
  });
  await rejects((artifact) => {
    artifact.claimBoundary = "The Godot SDK is product-qualified.";
  });
  await rejects((artifact) => {
    artifact.limitations[3] = "The ARM64 build ran successfully.";
  });
  await rejects(
    (artifact) => {
      artifact.gamepadQualified = true;
    },
    /artifact keys must be exactly/u,
  );
});
