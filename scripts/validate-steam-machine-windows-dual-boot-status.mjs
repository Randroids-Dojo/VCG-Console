import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const trackedPath = resolve(
  root,
  "benchmarks/steam-machine-dual-boot/steam-machine-windows-dual-boot-status-v1.json",
);
const MAX_BYTES = 128 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

export const STEAM_MACHINE_DUAL_BOOT_FORMAT =
  "vcg-steam-machine-windows-dual-boot-status/v1";
export const STEAM_MACHINE_DRIVER_LINKS = Object.freeze([
  [
    "graphics",
    "https://steamdeck-packages.steamos.cloud/misc/windows/drivers/machine/GFX/GFX%20Driver%20241126a-410993C.zip",
    "run-Setup.exe",
    1044430080,
    "Mon, 06 Jul 2026 18:28:53 GMT",
    '"6a4bf3e5-3e40bd00"',
  ],
  [
    "wifi",
    "https://steamdeck-packages.steamos.cloud/misc/windows/drivers/machine/W-Fi/2.0.125.1229_QCA206x.zip",
    "right-click-qcwlan64.inf-and-install",
    4597665,
    "Mon, 06 Jul 2026 18:28:54 GMT",
    '"6a4bf3e6-4627a1"',
  ],
  [
    "bluetooth",
    "https://steamdeck-packages.steamos.cloud/misc/windows/drivers/machine/BT/FC66E-B_ACMD_WIN_BT_driver.zip",
    "right-click-BtFilter.inf-and-install",
    420921,
    "Mon, 06 Jul 2026 18:28:28 GMT",
    '"6a4bf3cc-66c39"',
  ],
  [
    "sd-card-reader",
    "https://steamdeck-packages.steamos.cloud/misc/windows/drivers/machine/SDReader/SDReader-20260702.zip",
    "run-Setup.exe",
    17883390,
    "Mon, 06 Jul 2026 18:28:54 GMT",
    '"6a4bf3e6-110e0fe"',
  ],
]);

const topKeys = [
  "format",
  "status",
  "recordId",
  "observedAt",
  "evidenceScope",
  "claimBoundary",
  "sourceDigestContract",
  "sourceBindings",
  "officialPageSnapshots",
  "officialFindings",
  "driverLinks",
  "recoveryBoundary",
  "decisionDisposition",
  "authorityBoundary",
  "dataPolicy",
  "result",
];
const sourceDefinitions = [
  ["official-source-index", "docs/SOURCES.md"],
  ["steam-machine-feasibility-boundary", "docs/STEAM_MACHINE_2026.md"],
  [
    "steamos-shell-boundary",
    "docs/STEAMOS_OUTER_SHELL_LIFECYCLE_CAMPAIGN_2026-07-26.md",
  ],
  [
    "steamos-shell-plan-boundary",
    "benchmarks/steamos-shell/steamos-outer-shell-lifecycle-plan-v1.json",
  ],
];
const snapshotKeys = [
  "sourceId",
  "url",
  "sourceClass",
  "accessedAt",
  "httpStatus",
  "captureMethod",
  "normalizedUtf8Bytes",
  "normalizedUtf8Sha256",
  "claimIds",
];
const driverKeys = [
  "driverId",
  "url",
  "installInstruction",
  "linkedByValve",
  "headObservedAt",
  "headHttpStatus",
  "headContentLengthBytes",
  "headLastModified",
  "headEtag",
  "downloaded",
  "archiveSha256",
  "signatureOrPublisherEvidenceSha256",
  "versionAndDeviceCoverageSha256",
  "installationResultSha256",
];
const authorityNullKeys = [
  "targetReceiptInventoryAndCustodySha256",
  "approvedWindowsVersionLicenseAndAccountProtocolSha256",
  "approvedPartitionBackupRecoveryAndDataDispositionProtocolSha256",
  "approvedDriverDownloadSignatureInstallationAndCoverageProtocolSha256",
  "supportedValveDualBootProcedureSha256",
];
const authorityFalseKeys = [
  "driverDownloadOrExecutionAuthorized",
  "windowsInstallPartitionOrBootMutationAuthorized",
  "recoveryReimageRepairOrDestructiveOperationAuthorized",
  "targetOperationQualificationPublicationOrTierMutationAuthorized",
];

function exactKeys(value, expected, label) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} fields drifted`);
}

function normalizedText(bytes, label) {
  assert.ok(bytes.length > 0, `${label} must not be empty`);
  assert.ok(
    !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf),
    `${label} must not contain a UTF-8 BOM`,
  );
  let value;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8`, { cause: error });
  }
  assert.ok(!/(^|[^\r])\r([^\n]|$)/u.test(value), `${label} has a bare CR`);
  return value.replaceAll("\r\n", "\n");
}

function digest(bytes, label) {
  return createHash("sha256").update(normalizedText(bytes, label)).digest("hex");
}

async function validateSources(bindings, repositoryRoot) {
  assert.ok(Array.isArray(bindings), "sourceBindings must be an array");
  assert.equal(bindings.length, sourceDefinitions.length);
  for (const [index, binding] of bindings.entries()) {
    exactKeys(binding, ["role", "path", "sha256"], `sourceBindings[${index}]`);
    assert.deepEqual([binding.role, binding.path], sourceDefinitions[index]);
    assert.match(binding.sha256, SHA256);
    const absolute = resolve(repositoryRoot, binding.path);
    const relativePath = relative(repositoryRoot, absolute);
    assert.ok(
      relativePath.length > 0 &&
        !relativePath.startsWith("..") &&
        !isAbsolute(relativePath),
      `sourceBindings[${index}] escapes repository`,
    );
    assert.equal(
      digest(await readFile(absolute), binding.path),
      binding.sha256,
      `${binding.path} digest drifted`,
    );
  }
}

export async function validateSteamMachineWindowsDualBootStatus(
  record,
  repositoryRoot = root,
) {
  exactKeys(record, topKeys, "record");
  assert.equal(record.format, STEAM_MACHINE_DUAL_BOOT_FORMAT);
  assert.equal(record.status, "evidence");
  assert.equal(
    record.recordId,
    "steam-machine-windows-dual-boot-status-2026-07-26",
  );
  assert.equal(record.observedAt, "2026-07-26");
  assert.deepEqual(record.evidenceScope, ["I-174"]);
  for (const phrase of [
    "dated official-source status record, not a hardware or Windows qualification",
    "publishes four Windows driver links",
    "installing Windows currently wipes Steam hardware",
    "supported SteamOS dual-boot wizard is not ready",
    "Linked or HEAD-reachable driver archives do not prove binary integrity",
    "No download, installation, boot change, recovery operation, target use, qualification, publication, or product-tier mutation is authorized",
  ]) {
    assert.match(record.claimBoundary, new RegExp(phrase, "u"));
  }
  assert.equal(
    record.sourceDigestContract,
    "SHA-256 over strict UTF-8 after CRLF-to-LF normalization; bare carriage returns are rejected",
  );
  await validateSources(record.sourceBindings, repositoryRoot);

  assert.ok(Array.isArray(record.officialPageSnapshots));
  assert.equal(record.officialPageSnapshots.length, 2);
  for (const [index, snapshot] of record.officialPageSnapshots.entries()) {
    exactKeys(snapshot, snapshotKeys, `officialPageSnapshots[${index}]`);
    assert.equal(snapshot.sourceClass, "valve-official-support");
    assert.equal(snapshot.accessedAt, "2026-07-26");
    assert.equal(snapshot.httpStatus, 200);
    assert.equal(
      snapshot.captureMethod,
      "PowerShell Invoke-WebRequest decoded response, CRLF-to-LF normalization, UTF-8 encoding",
    );
    assert.ok(Number.isSafeInteger(snapshot.normalizedUtf8Bytes));
    assert.ok(snapshot.normalizedUtf8Bytes > 0);
    assert.match(snapshot.normalizedUtf8Sha256, SHA256);
    assert.ok(Array.isArray(snapshot.claimIds));
    assert.ok(snapshot.claimIds.length >= 3);
  }
  assert.deepEqual(record.officialPageSnapshots, [
    {
      sourceId: "valve-steam-hardware-windows-resources",
      url: "https://help.steampowered.com/en/faqs/view/6121-ECCD-D643-BAA8",
      sourceClass: "valve-official-support",
      accessedAt: "2026-07-26",
      httpStatus: 200,
      captureMethod:
        "PowerShell Invoke-WebRequest decoded response, CRLF-to-LF normalization, UTF-8 encoding",
      normalizedUtf8Bytes: 34958,
      normalizedUtf8Sha256:
        "a9451badafbe3363078dca9c6794e39e097c5fdbc1566591d1ef799be8795905",
      claimIds: [
        "other-operating-systems-installable",
        "windows-resources-as-is-without-valve-support",
        "four-steam-machine-driver-links",
        "windows-install-requires-wipe",
        "dual-boot-hardware-capable",
        "supported-steamos-dual-boot-wizard-not-ready",
      ],
    },
    {
      sourceId: "valve-steamos-installation-and-repair",
      url: "https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227",
      sourceClass: "valve-official-support",
      accessedAt: "2026-07-26",
      httpStatus: 200,
      captureMethod:
        "PowerShell Invoke-WebRequest decoded response, CRLF-to-LF normalization, UTF-8 encoding",
      normalizedUtf8Bytes: 34816,
      normalizedUtf8Sha256:
        "f36756d63e9c21d51c11128f95dc249ba44f341b9276420ebbca97261215d1af",
      claimIds: [
        "steamos-reimage-is-destructive",
        "steamos-repair-is-distinct-from-reimage",
        "return-to-steamos-recovery-path-exists",
      ],
    },
  ]);

  assert.deepEqual(record.officialFindings, {
    targetId: "exact-steam-machine",
    steamMachineDescribedAsPc: true,
    otherApplicationsAndOperatingSystemsInstallable: true,
    windowsInstallationDocumented: true,
    resourcesProvidedAsIs: true,
    windowsSupportProvidedByValve: false,
    driverCategoryIds: ["graphics", "wifi", "bluetooth", "sd-card-reader"],
    windowsInstallRequiresSteamHardwareWipe: true,
    steamOsDualBootCurrentlyAvailable: false,
    steamMachineHardwareDualBootCapable: true,
    supportedSteamOsDualBootWizardReady: false,
    futureWizardStatedToShipWithSteamOsWhenComplete: true,
    bootMenuEntryMethod: "power-off-then-tap-Escape-during-boot",
    wiredInternetRequiredDuringWindowsSetup: true,
    exactWindowsVersionQualified: false,
    completeDeviceDriverCoverageQualified: false,
    dualBootUpdateRecoveryQualified: false,
  });

  assert.ok(Array.isArray(record.driverLinks));
  assert.equal(record.driverLinks.length, STEAM_MACHINE_DRIVER_LINKS.length);
  for (const [index, driver] of record.driverLinks.entries()) {
    exactKeys(driver, driverKeys, `driverLinks[${index}]`);
    assert.deepEqual(
      [
        driver.driverId,
        driver.url,
        driver.installInstruction,
        driver.headContentLengthBytes,
        driver.headLastModified,
        driver.headEtag,
      ],
      STEAM_MACHINE_DRIVER_LINKS[index],
    );
    assert.equal(new URL(driver.url).protocol, "https:");
    assert.equal(
      new URL(driver.url).hostname,
      "steamdeck-packages.steamos.cloud",
    );
    assert.equal(driver.linkedByValve, true);
    assert.equal(driver.headObservedAt, "2026-07-26");
    assert.equal(driver.headHttpStatus, 200);
    assert.equal(driver.downloaded, false);
    for (const key of driverKeys.slice(10)) {
      assert.equal(driver[key], null, `linked driver cannot bind ${key}`);
    }
  }

  assert.deepEqual(record.recoveryBoundary, {
    officialRecoverySourceId: "valve-steamos-installation-and-repair",
    reimageMayPreserveWindowsOrOtherOperatingSystems: false,
    repairMayProveDualBootSafe: false,
    recoveryAvailabilityMayAuthorizeWindowsInstall: false,
    recoveryMediaCreatedOrValidated: false,
    preInstallBackupSha256: null,
    partitionAndBootInventorySha256: null,
    recoveryRehearsalResultSha256: null,
  });

  assert.deepEqual(record.decisionDisposition, {
    D040SteamOsPrimaryWindowsFallback: true,
    D119SteamMachineRemainsOptional: true,
    Q095Status: "open-waiting-for-supported-steamos-dual-boot-wizard",
    I174Disposition: "official-current-status-recorded",
    I175Disposition: "blocked-supported-dual-boot-flow-not-published",
    I176Disposition:
      "blocked-same-hardware-two-os-comparison-not-authorized-or-run",
    destructiveInstallDisposition:
      "do-not-install-windows-on-preordered-unit-before-supported-flow-or-separate-authority",
    monitorUrl:
      "https://help.steampowered.com/en/faqs/view/6121-ECCD-D643-BAA8",
    nextStateTrigger:
      "Valve publishes a supported SteamOS dual-boot installer or an equally explicit Steam Machine procedure",
  });

  exactKeys(
    record.authorityBoundary,
    [...authorityNullKeys, ...authorityFalseKeys],
    "authorityBoundary",
  );
  for (const key of authorityNullKeys) {
    assert.equal(record.authorityBoundary[key], null, `record cannot bind ${key}`);
  }
  for (const key of authorityFalseKeys) {
    assert.equal(record.authorityBoundary[key], false, `${key} must remain false`);
  }

  assert.deepEqual(record.dataPolicy, {
    officialPublicUrlsClosedClaimsHttpMetadataAndDigestsAllowed: true,
    driverArchiveBodiesAllowedInRepositoryEvidence: false,
    deviceSerialAccountProductKeyCredentialOrStableIdentifierAllowed: false,
    partitionPathVolumeIdBootEntryRecoveryKeyOrFilesystemListingAllowed: false,
    arbitraryInstallerDriverSupportConsoleOrRecoveryMessagesAllowed: false,
    freeTextPhysicalResultEvidenceAllowed: false,
  });

  assert.deepEqual(record.result, {
    officialCurrentStatus:
      "hardware-capable-but-supported-dual-boot-unavailable",
    publishedDriverCategoryCount: 4,
    supportedDualBootReady: false,
    driverArchivesDownloadedOrValidated: false,
    windowsInstalled: false,
    physicalDualBootResultSha256: null,
    windowsQualificationResultSha256: null,
    productSelectionOrTierChange: null,
  });
  return record;
}

export async function readSteamMachineWindowsDualBootStatus(path = trackedPath) {
  const bytes = await readFile(path);
  assert.ok(bytes.length <= MAX_BYTES, `record exceeds ${MAX_BYTES} bytes`);
  return JSON.parse(normalizedText(bytes, path));
}

async function main() {
  const record = await readSteamMachineWindowsDualBootStatus();
  await validateSteamMachineWindowsDualBootStatus(record);
  console.log(
    `Steam Machine Windows status valid: ${record.officialPageSnapshots.length} official pages, ${record.driverLinks.length} driver links, supported dual boot ready=${record.result.supportedDualBootReady}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
