import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateTrackedFirstPartyGameRightsScreen } from "./validate-first-party-game-rights-screen.mjs";
import { validateTrackedGameServiceDependencyScreen } from "./validate-game-service-dependency-screen.mjs";
import { validateTrackedRemoteGameOfflineEvidence } from "./validate-remote-game-offline-evidence.mjs";

export const FULL_CATALOG_CANDIDATE_FORMAT =
  "vcg-full-catalog-candidate-ledger/v2";
export const FULL_CATALOG_CANDIDATE_DATE = "2026-07-24";
export const FULL_CATALOG_CANDIDATE_LIMITATIONS = Object.freeze([
  "This ledger reconciles evidence into non-authoritative candidate records. It is not a public game manifest, signed installed catalog, launcher policy, admission record, package descriptor, permission grant, browser allowlist, or owner authorization.",
  "Remote-web and network-required are conservative candidate classifications for the current hosted URLs. They do not prove playability, service availability, containment, global controls, input support, or target compatibility.",
  "Empty input, architecture, and permission arrays mean no reviewed value is qualified. They must never be interpreted as unrestricted, unnecessary, or implicitly allowed.",
  "The three existing checked-in museum manifests and launcher entries are recorded as current repository facts, not retroactive trust, rights, service, controller, offline, or family-mode approval.",
  "No entry may move from this ledger into production authority without exact per-title review, a separately validated manifest/admission record, and the host-owned signed catalog/package process where applicable.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "compliance/catalog-candidates/full-catalog-candidate-ledger-v2.json",
);
const checkedInMuseumIds = new Set([
  "determined",
  "mi-casa-es-su-casa",
  "vibebots",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function fullCatalogCandidateObservationSha256(entries) {
  return sha256(new TextEncoder().encode(JSON.stringify(entries)));
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function serviceSignalCounts(serviceSignals) {
  return Object.fromEntries(
    Object.entries(serviceSignals).map(([category, signals]) => [
      category,
      signals.length,
    ]),
  );
}

function blockers(service, rights) {
  const values = [
    "architecture-qualification",
    "browser-containment-and-global-controls",
    "content-and-age-review",
    "controller-and-input-qualification",
    "health-readiness-and-recovery",
    "owner-authorization",
    "permission-review",
    "service-degradation-contract",
    "source-build-deployment-binding",
    "title-and-trademark-review",
  ];
  if (rights.status === "unavailable") {
    values.push("code-and-content-rights", "community-source-evidence");
  } else {
    values.push("content-asset-rights");
    if (
      rights.codeGrantStatus === "no-explicit-code-grant-observed"
      || rights.codeGrantStatus === "package-license-declaration-only"
    ) {
      values.push("code-license");
    }
    if (
      rights.codeGrantStatus
      === "repository-grant-with-explicit-scope-exclusion"
    ) {
      values.push("license-scope-closure");
    }
  }
  if (service.source.status === "no-first-party-repository-link") {
    values.push("service-source-inventory");
  }
  return sortedUnique(values);
}

function rightsRecord(rights) {
  if (!rights) {
    return {
      status: "unavailable",
      codeGrantStatus: null,
      contentRightsStatus: "unknown",
      ownerAuthorizationStatus: "not-recorded",
      redistributionStatus: "blocked",
    };
  }
  return {
    status: "exact-repository-screened",
    codeGrantStatus: rights.rights.codeGrantStatus,
    contentRightsStatus: rights.rights.contentRightsStatus,
    ownerAuthorizationStatus: rights.rights.ownerAuthorizationStatus,
    redistributionStatus: rights.rights.redistributionStatus,
  };
}

export function buildFullCatalogCandidateEntry(service, offline, rights) {
  const checkedIn = checkedInMuseumIds.has(service.id);
  const candidateRights = rightsRecord(rights);
  const serviceCategories = Object.entries(service.serviceSignals)
    .filter(([, signals]) => signals.length > 0)
    .map(([category]) => category)
    .sort((left, right) => left.localeCompare(right));
  return {
    id: service.id,
    title: service.title,
    catalogClass: service.catalogClass,
    liveEntrypoint: service.liveUrl,
    observedFinalEntrypoint: offline.finalOnlineUrl,
    currentRepositoryState: {
      publicManifest: checkedIn ? "checked-in-v1" : "absent",
      launcherCatalog: checkedIn ? "checked-in-museum" : "absent",
    },
    source: {
      status: service.source.status,
      repository: service.source.repository,
      commit: service.source.commit,
    },
    runtime: {
      candidate: "remote-web",
      qualification: "unverified",
    },
    network: {
      candidate: "required",
      offlineQualification: "none",
      candidateOrigin: new URL(service.liveUrl).origin,
      observedThirdPartyOrigins: [...service.browser.observedThirdPartyOrigins],
    },
    input: {
      qualification: "unverified",
      reviewedRequiredDevices: [],
      reservedHomeBackQualification: "unverified",
    },
    architecture: {
      qualification: "unverified",
      reviewedArchitectures: [],
    },
    permissions: {
      qualification: "not-reviewed",
      reviewedPermissions: [],
      hostAuthorityGranted: false,
    },
    services: {
      sourceInventoryStatus: service.source.status,
      degradationStatus: service.degradationStatus,
      signaledCategories: serviceCategories,
      signalCounts: serviceSignalCounts(service.serviceSignals),
    },
    rights: candidateRights,
    trust: {
      candidateTier:
        service.catalogClass === "first-party"
          ? "owner-production-candidate"
          : "curated-community-candidate",
      admissionStatus: "blocked",
      admissionAuthorityGranted: false,
    },
    blockerCodes: blockers(service, candidateRights),
  };
}

export function buildFullCatalogCandidateSummary(entries) {
  const count = (predicate) =>
    entries.reduce((total, entry) => total + (predicate(entry) ? 1 : 0), 0);
  return {
    entryCount: entries.length,
    firstPartyCount: count((entry) => entry.catalogClass === "first-party"),
    promotedCommunityCount: count(
      (entry) => entry.catalogClass === "promoted-community",
    ),
    checkedInPublicManifestCount: count(
      (entry) => entry.currentRepositoryState.publicManifest === "checked-in-v1",
    ),
    checkedInLauncherCatalogCount: count(
      (entry) =>
        entry.currentRepositoryState.launcherCatalog === "checked-in-museum",
    ),
    remoteWebCandidateCount: count(
      (entry) => entry.runtime.candidate === "remote-web",
    ),
    networkRequiredCandidateCount: count(
      (entry) => entry.network.candidate === "required",
    ),
    inputUnverifiedCount: count(
      (entry) => entry.input.qualification === "unverified",
    ),
    architectureUnverifiedCount: count(
      (entry) => entry.architecture.qualification === "unverified",
    ),
    permissionsNotReviewedCount: count(
      (entry) => entry.permissions.qualification === "not-reviewed",
    ),
    sourceUnavailableCount: count(
      (entry) => entry.source.status === "no-first-party-repository-link",
    ),
    rightsScreenUnavailableCount: count(
      (entry) => entry.rights.status === "unavailable",
    ),
    admissionApprovedCount: count(
      (entry) => entry.trust.admissionStatus === "approved",
    ),
    hostAuthorityGrantedCount: count(
      (entry) => entry.permissions.hostAuthorityGranted,
    ),
    productionCatalogMutationCount: 0,
  };
}

export async function generateFullCatalogCandidateLedger() {
  const [rights, offline, services] = await Promise.all([
    validateTrackedFirstPartyGameRightsScreen(),
    validateTrackedRemoteGameOfflineEvidence(),
    validateTrackedGameServiceDependencyScreen(),
  ]);
  const rightsById = new Map(rights.games.map((game) => [game.id, game]));
  const offlineById = new Map(offline.games.map((game) => [game.id, game]));
  const entries = services.games.map((service) => {
    const browser = offlineById.get(service.id);
    if (!browser) throw new Error(`offline evidence missing for ${service.id}`);
    return buildFullCatalogCandidateEntry(
      service,
      browser,
      rightsById.get(service.id),
    );
  });
  return {
    format: FULL_CATALOG_CANDIDATE_FORMAT,
    evidenceDate: FULL_CATALOG_CANDIDATE_DATE,
    evidenceClass: "non-authoritative-full-catalog-candidate-reconciliation",
    qualification: "zero-new-admissions",
    policy: {
      sourceCatalogIsInputOnly: true,
      candidateRecordsGrantNoManifestAuthority: true,
      candidateRecordsGrantNoHostAuthority: true,
      productionCatalogMutation: false,
      requiredReviewGates: [
        "exact-source-build-deployment",
        "owner-code-content-title-rights",
        "trust-and-content-admission",
        "controller-input-and-reserved-actions",
        "network-services-and-degradation",
        "permissions-data-and-storage",
        "browser-containment-and-global-controls",
        "architecture-performance-and-recovery",
      ],
    },
    provenance: {
      firstPartyRightsFormat: rights.format,
      firstPartyRightsObservationSha256: rights.observationSha256,
      remoteOfflineFormat: offline.format,
      remoteOfflineObservationSha256: offline.observationSha256,
      gameServiceFormat: services.format,
      gameServiceObservationSha256: services.observationSha256,
    },
    scope: {
      catalogSnapshotDate: "2026-07-19",
      expectedEntryCount: entries.length,
      currentCheckedInMuseumIds: [...checkedInMuseumIds].sort((left, right) =>
        left.localeCompare(right)),
    },
    entries,
    observationSha256: fullCatalogCandidateObservationSha256(entries),
    summary: buildFullCatalogCandidateSummary(entries),
    limitations: [...FULL_CATALOG_CANDIDATE_LIMITATIONS],
  };
}

async function main() {
  const artifact = await generateFullCatalogCandidateLedger();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${outputPath}; entries=${artifact.summary.entryCount}; manifests=${artifact.summary.checkedInPublicManifestCount}; approved=${artifact.summary.admissionApprovedCount}; mutations=${artifact.summary.productionCatalogMutationCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
