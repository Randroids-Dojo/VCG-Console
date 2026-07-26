import assert from "node:assert/strict";
import test from "node:test";

import {
  STEAM_MACHINE_DRIVER_LINKS,
  readSteamMachineWindowsDualBootStatus,
  validateSteamMachineWindowsDualBootStatus,
} from "./validate-steam-machine-windows-dual-boot-status.mjs";

const tracked = await readSteamMachineWindowsDualBootStatus();

function clone() {
  return structuredClone(tracked);
}

async function rejects(mutator, pattern) {
  const record = clone();
  mutator(record);
  await assert.rejects(
    validateSteamMachineWindowsDualBootStatus(record),
    pattern,
  );
}

test("accepts the dated official I-174 status record", async () => {
  const record = await validateSteamMachineWindowsDualBootStatus(clone());
  assert.equal(record.officialPageSnapshots.length, 2);
  assert.equal(record.driverLinks.length, STEAM_MACHINE_DRIVER_LINKS.length);
  assert.equal(record.result.supportedDualBootReady, false);
  assert.equal(record.result.windowsInstalled, false);
});

test("closed evidence schema rejects unknown claims", async () => {
  await rejects((record) => {
    record.windowsWorksGreat = true;
  }, /fields drifted/u);
});

test("claim boundary cannot promote linked drivers into qualification", async () => {
  await rejects((record) => {
    record.claimBoundary = "Windows is qualified.";
  }, /dated official-source status record/u);
});

test("source provenance rejects stale repository bytes", async () => {
  await rejects((record) => {
    record.sourceBindings[0].sha256 = "0".repeat(64);
  }, /digest drifted/u);
});

test("official support URLs and captured response identity cannot drift", async () => {
  await rejects((record) => {
    record.officialPageSnapshots[0].url = "https://example.invalid/windows";
  }, /strictly deep-equal/u);
  await rejects((record) => {
    record.officialPageSnapshots[0].normalizedUtf8Sha256 = "f".repeat(64);
  }, /strictly deep-equal/u);
});

test("other-OS installability and current wipe requirement remain explicit", async () => {
  await rejects((record) => {
    record.officialFindings.otherApplicationsAndOperatingSystemsInstallable =
      false;
  }, /strictly deep-equal/u);
  await rejects((record) => {
    record.officialFindings.windowsInstallRequiresSteamHardwareWipe = false;
  }, /strictly deep-equal/u);
});

test("hardware capability cannot be confused with a ready supported wizard", async () => {
  await rejects((record) => {
    record.officialFindings.supportedSteamOsDualBootWizardReady = true;
  }, /strictly deep-equal/u);
  await rejects((record) => {
    record.officialFindings.steamOsDualBootCurrentlyAvailable = true;
  }, /strictly deep-equal/u);
});

test("Valve as-is resources cannot become Windows support", async () => {
  await rejects((record) => {
    record.officialFindings.windowsSupportProvidedByValve = true;
  }, /strictly deep-equal/u);
});

test("all four driver categories remain ordered and exact", async () => {
  await rejects((record) => {
    record.driverLinks.splice(3, 1);
  }, /Expected values to be strictly equal/u);
  await rejects((record) => {
    record.driverLinks[0].driverId = "apu";
  }, /strictly deep-equal/u);
});

test("driver links cannot be substituted away from Valve's package host", async () => {
  await rejects((record) => {
    record.driverLinks[1].url = "https://downloads.example.invalid/wifi.zip";
  }, /strictly deep-equal/u);
});

test("HEAD reachability cannot fabricate an archive download or digest", async () => {
  await rejects((record) => {
    record.driverLinks[2].downloaded = true;
  }, /Expected values to be strictly equal/u);
  await rejects((record) => {
    record.driverLinks[2].archiveSha256 = "a".repeat(64);
  }, /linked driver cannot bind archiveSha256/u);
});

test("recovery availability cannot authorize installation or imply dual-boot safety", async () => {
  await rejects((record) => {
    record.recoveryBoundary.recoveryAvailabilityMayAuthorizeWindowsInstall = true;
  }, /strictly deep-equal/u);
  await rejects((record) => {
    record.recoveryBoundary.repairMayProveDualBootSafe = true;
  }, /strictly deep-equal/u);
});

test("D-040, D-119, and Q-095 dispositions cannot be silently promoted", async () => {
  await rejects((record) => {
    record.decisionDisposition.D040SteamOsPrimaryWindowsFallback = false;
  }, /strictly deep-equal/u);
  await rejects((record) => {
    record.decisionDisposition.Q095Status = "closed";
  }, /strictly deep-equal/u);
});

test("no driver, boot, recovery, target, or publication authority is granted", async () => {
  await rejects((record) => {
    record.authorityBoundary.windowsInstallPartitionOrBootMutationAuthorized =
      true;
  }, /must remain false/u);
  await rejects((record) => {
    record.authorityBoundary.supportedValveDualBootProcedureSha256 =
      "b".repeat(64);
  }, /record cannot bind supportedValveDualBootProcedureSha256/u);
});

test("physical results and tier changes remain absent", async () => {
  await rejects((record) => {
    record.result.physicalDualBootResultSha256 = "c".repeat(64);
  }, /strictly deep-equal/u);
  await rejects((record) => {
    record.result.productSelectionOrTierChange = "premium-reference";
  }, /strictly deep-equal/u);
});

test("data policy cannot admit archives, secrets, boot identifiers, or free text", async () => {
  await rejects((record) => {
    record.dataPolicy.driverArchiveBodiesAllowedInRepositoryEvidence = true;
  }, /strictly deep-equal/u);
  await rejects((record) => {
    record.dataPolicy.partitionPathVolumeIdBootEntryRecoveryKeyOrFilesystemListingAllowed =
      true;
  }, /strictly deep-equal/u);
});
