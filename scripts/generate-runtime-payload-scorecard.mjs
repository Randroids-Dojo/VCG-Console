import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateTrackedFirstPartyGameRightsScreen } from "./validate-first-party-game-rights-screen.mjs";
import { validateTrackedFullCatalogCandidateLedger } from "./validate-full-catalog-candidate-ledger.mjs";
import { validateTrackedGameServiceDependencyScreen } from "./validate-game-service-dependency-screen.mjs";
import { validateTrackedGodotExportEvidence } from "./validate-godot-export-evidence.mjs";
import { validateTrackedRemoteGameInputSurfaceEvidence } from "./validate-remote-game-input-surface-evidence.mjs";
import { validateTrackedRemoteGameOfflineEvidence } from "./validate-remote-game-offline-evidence.mjs";

export const RUNTIME_PAYLOAD_SCORECARD_FORMAT =
  "vcg-runtime-payload-scorecard-desk-baseline/v2";
export const RUNTIME_PAYLOAD_SCORECARD_DATE = "2026-07-24";
export const RUNTIME_PAYLOAD_SCORECARD_SUBJECT_IDS = Object.freeze([
  "vibebots",
  "mi-casa-es-su-casa",
  "determined",
  "obstacle-sample",
  "godot-motion-sample",
]);
export const RUNTIME_PAYLOAD_SCORECARD_ARCHITECTURES = Object.freeze([
  "linux-x86_64",
  "linux-arm64",
]);
export const RUNTIME_PAYLOAD_SCORECARD_PAYLOADS = Object.freeze([
  "bundled-web",
  "native",
]);
export const RUNTIME_PAYLOAD_SCORECARD_RUBRIC = Object.freeze([
  {
    id: "architecture-portability",
    requiredEvidence: [
      "exact release artifact identity",
      "launch on ordinary Linux x86-64",
      "launch on Raspberry Pi Linux ARM64",
      "runtime and ABI dependency inventory",
    ],
  },
  {
    id: "performance-latency",
    requiredEvidence: [
      "frame pacing and resource measurements",
      "controller-to-action latency",
      "Motion exposure-to-action latency when applicable",
      "concurrent tracker and launcher workload",
    ],
  },
  {
    id: "controller-motion",
    requiredEvidence: [
      "physical controller-only complete flow",
      "reserved Home Back and pause enforcement",
      "Motion API behavior when applicable",
      "disconnect focus and recovery behavior",
    ],
  },
  {
    id: "offline-services",
    requiredEvidence: [
      "declared network and service contract",
      "cold offline launch and complete play",
      "save reset update and rollback behavior",
      "reviewed degraded-service behavior",
    ],
  },
  {
    id: "package-size",
    requiredEvidence: [
      "signed payload bytes",
      "installed and peak update bytes",
      "cache and save quotas",
      "reserved rollback headroom",
    ],
  },
  {
    id: "security-boundary",
    requiredEvidence: [
      "runtime sandbox and permission policy",
      "origin or native IPC authority",
      "watchdog and forced-exit behavior",
      "hostile-content and failure tests",
    ],
  },
  {
    id: "build-reproducibility",
    requiredEvidence: [
      "exact source and toolchain",
      "locked dependencies",
      "repeated artifact equality or explained variance",
      "notices and corresponding-source bundle",
    ],
  },
  {
    id: "maintenance",
    requiredEvidence: [
      "named maintainer",
      "supported runtime and toolchain horizon",
      "update and security-response estimate",
      "cross-architecture regression cost estimate",
    ],
  },
]);
export const RUNTIME_PAYLOAD_SCORECARD_LIMITATIONS = Object.freeze([
  "This artifact is a prequalification scorecard baseline. It does not select a payload, approve a package, grant host authority, admit a title, or mutate the production catalog.",
  "Public source archive size, file counts, dependency names, browser request counts, and API-surface signals are not local-package build, installed-size, performance, latency, controller, security, offline, or maintenance measurements.",
  "The obstacle sample is a component of the console lab rather than an independently built signed game package, so its source bundle cannot be treated as a bundled-web artifact.",
  "The Godot sample has exact Web, Linux x86-64, and Linux ARM64 exports, one Windows Chrome load, and one WSL2 x86-64 headless boot. It has no target ARM64 execution, ordinary-Linux qualification, physical controller, signed-package launch, or latency result.",
  "Every target cell remains unqualified until the exact payload is exercised on both selected architectures under the common launcher, tracker, controller, storage, recovery, and service workload.",
  "Rights, admission, content, privacy, and owner authorization remain separate fail-closed gates even after a runtime payload eventually wins the technical scorecard.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "compliance/runtime-scorecard/runtime-payload-scorecard-desk-baseline-v2.json",
);
const godotArtifactPath = resolve(
  root,
  "benchmarks/godot/windows-x64-godot-4.7.1-export-v1.json",
);
const publicSubjectIds = RUNTIME_PAYLOAD_SCORECARD_SUBJECT_IDS.slice(0, 3);
const obstacleSourcePaths = Object.freeze([
  "apps/console-lab/src/action-engine.ts",
  "apps/console-lab/src/action-feedback.ts",
  "apps/console-lab/src/controller-player-assignment.ts",
  "apps/console-lab/src/main.ts",
  "apps/console-lab/src/obstacle-game.ts",
  "apps/console-lab/src/renderer.ts",
]);
const godotSourcePaths = Object.freeze([
  "examples/godot-motion-game/export_presets.cfg",
  "examples/godot-motion-game/main.tscn",
  "examples/godot-motion-game/project.godot",
  "examples/godot-motion-game/scripts/main.gd",
  "examples/godot-motion-game/scripts/motion_game.gd",
  "examples/godot-motion-game/scripts/motion_replay.gd",
  "examples/godot-motion-game/scripts/motion_web_bridge.gd",
  "examples/godot-motion-game/tests/run_tests.gd",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function runtimePayloadScorecardObservationSha256(subjects) {
  return sha256(new TextEncoder().encode(JSON.stringify(subjects)));
}

async function measureTrackedSourceBundle(paths) {
  const files = [];
  for (const path of paths) {
    const bytes = await readFile(resolve(root, path));
    files.push({
      path,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return {
    kind: "tracked-source-bundle",
    repository: "VCG-Console",
    revision: null,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    sha256: sha256(new TextEncoder().encode(JSON.stringify(files))),
    runtimeDependencyCount: null,
    apiRouteCount: 0,
    assetLikeFileCount: 0,
    files,
  };
}

function signalCounts(signals) {
  return Object.fromEntries(
    Object.entries(signals).map(([category, values]) => [
      category,
      values.length,
    ]),
  );
}

function publicRubricAssessments(input) {
  return [
    {
      id: "architecture-portability",
      status: "source-only",
      evidenceCodes: ["exact-public-source-archive", "zero-target-launches"],
    },
    {
      id: "performance-latency",
      status: "unmeasured",
      evidenceCodes: ["fresh-windows-browser-load-is-not-performance"],
    },
    {
      id: "controller-motion",
      status: input.findings.gamepadSignal ? "signal-only" : "unmeasured",
      evidenceCodes: input.findings.gamepadSignal
        ? ["neutral-gamepad-api-signal", "zero-physical-actions"]
        : ["zero-initial-gamepad-api-signals", "zero-physical-actions"],
    },
    {
      id: "offline-services",
      status: "blocked",
      evidenceCodes: [
        "zero-offline-package-qualification",
        "service-degradation-unverified",
      ],
    },
    {
      id: "package-size",
      status: "source-only",
      evidenceCodes: ["source-archive-bytes-not-package-bytes"],
    },
    {
      id: "security-boundary",
      status: "unmeasured",
      evidenceCodes: ["zero-local-package-host-authority"],
    },
    {
      id: "build-reproducibility",
      status: "source-only",
      evidenceCodes: ["exact-source-archive", "zero-repeated-release-builds"],
    },
    {
      id: "maintenance",
      status: "unestimated",
      evidenceCodes: ["no-named-estimate"],
    },
  ];
}

function obstacleRubricAssessments() {
  return [
    {
      id: "architecture-portability",
      status: "unmeasured",
      evidenceCodes: ["console-lab-component-not-independent-payload"],
    },
    {
      id: "performance-latency",
      status: "unmeasured",
      evidenceCodes: ["zero-target-payload-runs"],
    },
    {
      id: "controller-motion",
      status: "repository-code-only",
      evidenceCodes: ["motion-action-consumer-source", "zero-physical-actions"],
    },
    {
      id: "offline-services",
      status: "unmeasured",
      evidenceCodes: ["zero-signed-package-runs"],
    },
    {
      id: "package-size",
      status: "unmeasured",
      evidenceCodes: ["zero-independent-build-artifacts"],
    },
    {
      id: "security-boundary",
      status: "unmeasured",
      evidenceCodes: ["zero-independent-package-sandbox-runs"],
    },
    {
      id: "build-reproducibility",
      status: "source-only",
      evidenceCodes: ["tracked-source-bundle", "zero-independent-builds"],
    },
    {
      id: "maintenance",
      status: "unestimated",
      evidenceCodes: ["no-named-estimate"],
    },
  ];
}

function godotRubricAssessments() {
  return [
    {
      id: "architecture-portability",
      status: "partial-desk-evidence",
      evidenceCodes: [
        "web-x86-release-export",
        "native-x86-release-export",
        "native-arm64-release-export",
        "wsl2-x86-boot-only",
        "zero-target-arm64-execution",
      ],
    },
    {
      id: "performance-latency",
      status: "browser-ready-only",
      evidenceCodes: ["windows-chrome-ready-time", "zero-gameplay-latency-runs"],
    },
    {
      id: "controller-motion",
      status: "synthetic-only",
      evidenceCodes: [
        "keyboard-fallback-actions",
        "synthetic-motion-bridge-evidence",
        "zero-physical-controller-actions",
      ],
    },
    {
      id: "offline-services",
      status: "unmeasured",
      evidenceCodes: ["zero-signed-package-offline-runs"],
    },
    {
      id: "package-size",
      status: "export-measured",
      evidenceCodes: ["exact-web-x86-arm64-export-bytes"],
    },
    {
      id: "security-boundary",
      status: "unmeasured",
      evidenceCodes: ["desk-web-bridge-only", "zero-native-ipc-authority"],
    },
    {
      id: "build-reproducibility",
      status: "single-export-evidence",
      evidenceCodes: ["exact-toolchain-and-output-digests", "zero-repeat-builds"],
    },
    {
      id: "maintenance",
      status: "unestimated",
      evidenceCodes: ["no-named-estimate"],
    },
  ];
}

function emptyMeasurements() {
  return {
    onlineLoadCount: null,
    onlineRequestCount: null,
    observedThirdPartyOriginCount: null,
    offlineReloadOutcome: null,
    gamepadApiPollCount: null,
    keyboardSignal: null,
    pointerSignal: null,
    touchSignal: null,
    textEntrySurfaceSignal: null,
    webExportBytes: null,
    linuxX86_64ExportBytes: null,
    linuxArm64ExportBytes: null,
    windowsChromeReadyMs: null,
    linuxX86_64WslBootObserved: false,
    linuxArm64ExecutionObserved: false,
  };
}

function targetCells(kind) {
  return RUNTIME_PAYLOAD_SCORECARD_PAYLOADS.map((payload) => ({
    payload,
    architectures: RUNTIME_PAYLOAD_SCORECARD_ARCHITECTURES.map(
      (architecture) => {
        if (kind === "public-web-source") {
          return {
            architecture,
            buildStatus: payload === "bundled-web"
              ? "source-only-no-local-build"
              : "not-implemented",
            executionStatus: "not-run",
            performanceStatus: "not-run",
            inputStatus: "not-run",
            offlineStatus: "not-run",
            qualified: false,
          };
        }
        if (kind === "obstacle-component") {
          return {
            architecture,
            buildStatus: payload === "bundled-web"
              ? "component-source-only-no-independent-package"
              : "not-implemented",
            executionStatus: "not-run-as-independent-payload",
            performanceStatus: "not-run",
            inputStatus: "not-run-with-physical-input",
            offlineStatus: "not-run-as-signed-package",
            qualified: false,
          };
        }
        if (payload === "bundled-web") {
          return {
            architecture,
            buildStatus: "release-export-produced",
            executionStatus: "windows-chrome-only-not-target",
            performanceStatus: "ready-time-only-not-game-performance",
            inputStatus: "keyboard-and-synthetic-motion-only",
            offlineStatus: "not-run-as-signed-package",
            qualified: false,
          };
        }
        return {
          architecture,
          buildStatus: "release-export-produced",
          executionStatus: architecture === "linux-x86_64"
            ? "wsl2-headless-boot-only"
            : "not-run",
          performanceStatus: "not-run",
          inputStatus: "not-run-with-physical-input",
          offlineStatus: "not-run-as-signed-package",
          qualified: false,
        };
      },
    ),
  }));
}

function blockedSelection(blockerCodes) {
  return {
    status: "blocked",
    selectedPayload: null,
    exception: null,
    maintenanceEstimate: null,
    blockerCodes,
  };
}

export function buildPublicRuntimeScorecardSubject(
  ledger,
  rights,
  offline,
  services,
  input,
) {
  assert.equal(ledger.id, rights.id);
  assert.equal(ledger.id, offline.id);
  assert.equal(ledger.id, services.id);
  assert.equal(ledger.id, input.id);
  assert.equal(services.source.status, "exact-public-source-screened");
  return {
    id: ledger.id,
    title: ledger.title,
    subjectClass: "controlled-public-source-title",
    currentDelivery: "remote-web",
    source: {
      kind: "exact-public-source-archive",
      repository: services.source.repository,
      revision: services.source.commit,
      fileCount: services.source.sourceFileCount,
      totalBytes: services.source.archiveBytes,
      sha256: services.source.archiveSha256,
      runtimeDependencyCount: services.source.runtimeDependencies.length,
      apiRouteCount: services.source.apiRoutePaths.length,
      assetLikeFileCount: rights.assetInventory.total,
      files: [],
    },
    measurements: {
      ...emptyMeasurements(),
      onlineLoadCount:
        Number(offline.online.firstLoad.outcome === "loaded")
        + Number(offline.online.secondLoad.outcome === "loaded"),
      onlineRequestCount: offline.online.requestCount,
      observedThirdPartyOriginCount:
        offline.online.thirdPartyOrigins.length,
      offlineReloadOutcome: offline.offlineReload.outcome,
      gamepadApiPollCount: input.observation.runtime.gamepad.pollCount,
      keyboardSignal: input.findings.keyboardSignal,
      pointerSignal: input.findings.pointerSignal,
      touchSignal: input.findings.touchSignal,
      textEntrySurfaceSignal: input.findings.textEntrySurfaceSignal,
    },
    serviceAndAuthority: {
      serviceSignalCounts: signalCounts(services.serviceSignals),
      degradationStatus: services.degradationStatus,
      offlineQualification: "none",
      redistributionStatus: rights.rights.redistributionStatus,
      ownerAuthorizationStatus: rights.rights.ownerAuthorizationStatus,
      admissionAuthorityGranted: ledger.trust.admissionAuthorityGranted,
      hostAuthorityGranted: ledger.permissions.hostAuthorityGranted,
    },
    rubricAssessments: publicRubricAssessments(input),
    payloadCandidates: targetCells("public-web-source"),
    selection: blockedSelection([
      "architecture-target-execution",
      "build-reproducibility",
      "controller-motion-target",
      "maintenance-estimate",
      "offline-service-contract",
      "package-artifact",
      "performance-latency",
      "rights-and-admission",
      "security-boundary",
    ]),
  };
}

export function buildObstacleRuntimeScorecardSubject(source) {
  return {
    id: "obstacle-sample",
    title: "VCG Obstacle Sample",
    subjectClass: "repository-component-sample",
    currentDelivery: "console-lab-component",
    source,
    measurements: emptyMeasurements(),
    serviceAndAuthority: {
      serviceSignalCounts: {
        auth: 0,
        database: 0,
        ai: 0,
        analytics: 0,
        notifications: 0,
        payments: 0,
        externalNetwork: 0,
      },
      degradationStatus: "not-evaluated-as-independent-payload",
      offlineQualification: "none",
      redistributionStatus: "project-license-unselected",
      ownerAuthorizationStatus: "repository-internal-sample",
      admissionAuthorityGranted: false,
      hostAuthorityGranted: false,
    },
    rubricAssessments: obstacleRubricAssessments(),
    payloadCandidates: targetCells("obstacle-component"),
    selection: blockedSelection([
      "architecture-target-execution",
      "independent-package-boundary",
      "maintenance-estimate",
      "offline-package-campaign",
      "performance-latency",
      "physical-controller-motion",
      "project-license",
      "security-boundary",
    ]),
  };
}

export function buildGodotRuntimeScorecardSubject(source, godot) {
  return {
    id: "godot-motion-sample",
    title: "VCG Tiny Motion Game",
    subjectClass: "repository-godot-sample",
    currentDelivery: "repository-sample-multi-export",
    source,
    measurements: {
      ...emptyMeasurements(),
      webExportBytes: godot.outputs.web.totalBytes,
      linuxX86_64ExportBytes: godot.outputs.linuxX86_64.totalBytes,
      linuxArm64ExportBytes: godot.outputs.linuxArm64.totalBytes,
      windowsChromeReadyMs: godot.browser.readyMs,
      linuxX86_64WslBootObserved:
        godot.disposition.linuxX86_64WslBootObserved,
      linuxArm64ExecutionObserved:
        godot.disposition.linuxArm64ExecutionVerified,
    },
    serviceAndAuthority: {
      serviceSignalCounts: {
        auth: 0,
        database: 0,
        ai: 0,
        analytics: 0,
        notifications: 0,
        payments: 0,
        externalNetwork: 0,
      },
      degradationStatus: "not-evaluated-as-signed-package",
      offlineQualification: "none",
      redistributionStatus: "project-license-unselected",
      ownerAuthorizationStatus: "repository-internal-sample",
      admissionAuthorityGranted: false,
      hostAuthorityGranted: false,
    },
    rubricAssessments: godotRubricAssessments(),
    payloadCandidates: targetCells("godot-sample"),
    selection: blockedSelection([
      "architecture-target-execution",
      "build-repeatability",
      "maintenance-estimate",
      "native-motion-ipc",
      "offline-package-campaign",
      "performance-latency",
      "physical-controller",
      "project-license",
      "signed-package-security",
    ]),
  };
}

export function buildRuntimePayloadScorecardSummary(subjects) {
  const targetCells = subjects.flatMap((subject) =>
    subject.payloadCandidates.flatMap((candidate) =>
      candidate.architectures));
  return {
    subjectCount: subjects.length,
    publicSourceSubjectCount: subjects.filter(
      (subject) => subject.subjectClass === "controlled-public-source-title",
    ).length,
    repositorySampleCount: subjects.filter(
      (subject) => subject.subjectClass !== "controlled-public-source-title",
    ).length,
    payloadCandidateCount: subjects.reduce(
      (total, subject) => total + subject.payloadCandidates.length,
      0,
    ),
    targetCellCount: targetCells.length,
    targetQualifiedCellCount: targetCells.filter((cell) => cell.qualified).length,
    finalSelectionCount: subjects.filter(
      (subject) => subject.selection.selectedPayload !== null,
    ).length,
    maintenanceEstimateCount: subjects.filter(
      (subject) => subject.selection.maintenanceEstimate !== null,
    ).length,
    admissionAuthorityCount: subjects.filter(
      (subject) => subject.serviceAndAuthority.admissionAuthorityGranted,
    ).length,
    hostAuthorityCount: subjects.filter(
      (subject) => subject.serviceAndAuthority.hostAuthorityGranted,
    ).length,
    productionCatalogMutationCount: 0,
  };
}

export async function generateRuntimePayloadScorecard() {
  const [
    ledger,
    rights,
    offline,
    services,
    input,
    godot,
    godotArtifactBytes,
    obstacleSource,
    godotSource,
  ] = await Promise.all([
    validateTrackedFullCatalogCandidateLedger(),
    validateTrackedFirstPartyGameRightsScreen(),
    validateTrackedRemoteGameOfflineEvidence(),
    validateTrackedGameServiceDependencyScreen(),
    validateTrackedRemoteGameInputSurfaceEvidence(),
    validateTrackedGodotExportEvidence(),
    readFile(godotArtifactPath),
    measureTrackedSourceBundle(obstacleSourcePaths),
    measureTrackedSourceBundle(godotSourcePaths),
  ]);
  const maps = {
    ledger: new Map(ledger.entries.map((entry) => [entry.id, entry])),
    rights: new Map(rights.games.map((game) => [game.id, game])),
    offline: new Map(offline.games.map((game) => [game.id, game])),
    services: new Map(services.games.map((game) => [game.id, game])),
    input: new Map(input.games.map((game) => [game.id, game])),
  };
  const subjects = publicSubjectIds.map((id) => {
    const records = Object.fromEntries(
      Object.entries(maps).map(([name, map]) => [name, map.get(id)]),
    );
    for (const [name, record] of Object.entries(records)) {
      assert.ok(record, `${name} evidence missing for ${id}`);
    }
    return buildPublicRuntimeScorecardSubject(
      records.ledger,
      records.rights,
      records.offline,
      records.services,
      records.input,
    );
  });
  subjects.push(
    buildObstacleRuntimeScorecardSubject(obstacleSource),
    buildGodotRuntimeScorecardSubject(godotSource, godot),
  );
  return {
    format: RUNTIME_PAYLOAD_SCORECARD_FORMAT,
    evidenceDate: RUNTIME_PAYLOAD_SCORECARD_DATE,
    evidenceClass: "source-browser-and-export-derived-prequalification-scorecard",
    qualification: "zero-final-payload-selections",
    policy: {
      selectedPayloadRequiresEveryRubricPass: true,
      targetCellsAreArchitectureAndPayloadSpecific: true,
      sourceAndDeskEvidenceCannotQualifyTargetCells: true,
      rightsAndAdmissionRemainSeparateBlockingGates: true,
      productionCatalogMutation: false,
    },
    provenance: {
      fullCatalogCandidateFormat: ledger.format,
      fullCatalogCandidateObservationSha256: ledger.observationSha256,
      firstPartyRightsFormat: rights.format,
      firstPartyRightsObservationSha256: rights.observationSha256,
      remoteOfflineFormat: offline.format,
      remoteOfflineObservationSha256: offline.observationSha256,
      gameServiceFormat: services.format,
      gameServiceObservationSha256: services.observationSha256,
      remoteInputFormat: input.format,
      remoteInputObservationSha256: input.observationSha256,
      godotExportFormat: godot.format,
      godotExportArtifactSha256: sha256(godotArtifactBytes),
    },
    scope: {
      investigation: "I-182",
      decision: "D-057",
      subjectIds: [...RUNTIME_PAYLOAD_SCORECARD_SUBJECT_IDS],
      targetArchitectures: [...RUNTIME_PAYLOAD_SCORECARD_ARCHITECTURES],
      candidatePayloads: [...RUNTIME_PAYLOAD_SCORECARD_PAYLOADS],
      targetHardwareRuns: 0,
      physicalControllerRuns: 0,
      participantRuns: 0,
    },
    rubric: structuredClone(RUNTIME_PAYLOAD_SCORECARD_RUBRIC),
    subjects,
    observationSha256: runtimePayloadScorecardObservationSha256(subjects),
    summary: buildRuntimePayloadScorecardSummary(subjects),
    limitations: [...RUNTIME_PAYLOAD_SCORECARD_LIMITATIONS],
  };
}

async function main() {
  const artifact = await generateRuntimePayloadScorecard();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${outputPath}; subjects=${artifact.summary.subjectCount}; cells=${artifact.summary.targetCellCount}; qualified=${artifact.summary.targetQualifiedCellCount}; selections=${artifact.summary.finalSelectionCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
