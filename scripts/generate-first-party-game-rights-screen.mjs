import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const FIRST_PARTY_RIGHTS_SCREEN_FORMAT =
  "vcg-first-party-game-repository-rights-screen/v1";
export const FIRST_PARTY_RIGHTS_SCREEN_DATE = "2026-07-24";
export const FIRST_PARTY_RIGHTS_LIMITATIONS = Object.freeze([
  "This is an exact-revision public-repository metadata and file-inventory screen, not legal advice or a complete code, asset, trademark, patent, privacy, service, build, dependency, or deployment audit.",
  "A repository under the project organization, a public source tree, a package license field, or GitHub license detection does not prove that every contributor, asset, font, audio file, model, title, service, generated output, or deployed byte is covered by that grant.",
  "The screen records no private owner authorization. Every title remains blocked from offline redistribution until an accountable owner and qualified reviewer approve the exact code/content/title/notices/build/deployment scope.",
  "Community entries without first-party repository links are outside this 23-repository artifact and remain separately blocked by the curated-community admission process.",
  "Hosted deployments can differ from repository heads. Exact source-to-build-to-deployment binding and reproducible ARM64/x86-64 package evidence remain required.",
]);

export const FIRST_PARTY_GAMES = Object.freeze([
  {
    id: "vibebots",
    title: "VibeBots",
    liveUrl: "https://vibebots.randroid.dev",
    repository: "VibeBots",
  },
  {
    id: "vibe-pinball",
    title: "VibePinball",
    liveUrl: "https://vibe-pinball.vercel.app",
    repository: "VibePinball",
  },
  {
    id: "vibe-racer",
    title: "VibeRacer",
    liveUrl: "https://vibe-racer-three.vercel.app",
    repository: "VibeRacer",
  },
  {
    id: "vibe-pins",
    title: "VibePins",
    liveUrl: "https://vibe-pins.vercel.app",
    repository: "VibePins",
  },
  {
    id: "fracking-asteroids",
    title: "Fracking Asteroids",
    liveUrl: "https://fracking-asteroids.vercel.app",
    repository: "FrackingAsteroids",
  },
  {
    id: "hoops",
    title: "Hoops",
    liveUrl: "https://hoops-kappa.vercel.app",
    repository: "Hoops",
  },
  {
    id: "mi-casa-es-su-casa",
    title: "Mi Casa Es Su Casa",
    liveUrl: "https://mi-casa-es-su-casa.vercel.app",
    repository: "mi-casa-es-su-casa",
  },
  {
    id: "block-punch-kick",
    title: "Block Punch Kick",
    liveUrl: "https://block-punch-kick.vercel.app",
    repository: "BlockPunchKick",
  },
  {
    id: "epoch",
    title: "Epoch",
    liveUrl: "https://epoch-theta.vercel.app",
    repository: "epoch",
  },
  {
    id: "game-tape",
    title: "GameTape",
    liveUrl: "https://game-tape.vercel.app",
    repository: "GameTape",
  },
  {
    id: "go-pit",
    title: "GoPit",
    liveUrl: "https://go-pit.vercel.app",
    repository: "GoPit",
  },
  {
    id: "block-you",
    title: "Block-You",
    liveUrl: "https://block-you.vercel.app",
    repository: "Block-You",
  },
  {
    id: "determined",
    title: "Determined",
    liveUrl: "https://determined-khaki.vercel.app",
    repository: "Determined",
  },
  {
    id: "software-dev-sim",
    title: "SoftwareDevSim",
    liveUrl: "https://software-dev-sim.vercel.app",
    repository: "SoftwareDevSim",
  },
  {
    id: "baby-piano",
    title: "Baby Piano",
    liveUrl: "https://baby-piano-eight.vercel.app",
    repository: "BabyPiano",
  },
  {
    id: "clankers",
    title: "Clankers",
    liveUrl: "https://clankers-mocha.vercel.app",
    repository: "Clankers",
  },
  {
    id: "vibe-city",
    title: "VibeCity",
    liveUrl: "https://vibe-city-weld.vercel.app",
    repository: "VibeCity",
  },
  {
    id: "flatline",
    title: "Flatline",
    liveUrl: "https://flatline-gamma.vercel.app",
    repository: "Flatline",
  },
  {
    id: "vibe-gear-2",
    title: "VibeGear2",
    liveUrl: "https://vibe-gear2.vercel.app",
    repository: "VibeGear2",
  },
  {
    id: "text-racer",
    title: "Text Racer",
    liveUrl: "https://text-racer.vercel.app",
    repository: "text-racer",
  },
  {
    id: "drop-dead-keep",
    title: "Drop Dead Keep",
    liveUrl: "https://drop-dead-keep.vercel.app",
    repository: "drop-dead-keep",
  },
  {
    id: "streamer-billboard",
    title: "Streamer Billboard",
    liveUrl: "https://streamer-billboard.vercel.app",
    repository: "StreamerBillboard",
  },
  {
    id: "go-dig",
    title: "GoDig",
    liveUrl: "https://go-dig.vercel.app",
    repository: "GoDig",
  },
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "compliance/first-party-game-rights/repository-rights-screen-v1.json",
);
const execFileAsync = promisify(execFile);
const organization = "Randroids-Dojo";
const apiHeaders = Object.freeze({
  Accept: "application/vnd.github+json",
  "User-Agent": "VCG-Console-rights-screen",
  "X-GitHub-Api-Version": "2022-11-28",
});
const MAX_LICENSE_PATHS = 256;

const ASSET_EXTENSIONS = Object.freeze({
  image: new Set([
    ".avif",
    ".bmp",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".webp",
  ]),
  audio: new Set([".flac", ".m4a", ".mp3", ".ogg", ".opus", ".wav"]),
  font: new Set([".eot", ".otf", ".ttf", ".woff", ".woff2"]),
  model: new Set([".blend", ".dae", ".fbx", ".glb", ".gltf", ".obj", ".stl"]),
  video: new Set([".mov", ".mp4", ".webm"]),
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function firstPartyRightsObservationSha256(games) {
  return sha256(new TextEncoder().encode(JSON.stringify(games)));
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function extension(path) {
  const basename = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const dot = basename.lastIndexOf(".");
  return dot >= 0 ? basename.slice(dot) : "";
}

function rawUrl(repository, commit, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${organization}/${repository}/${commit}/${encodedPath}`;
}

async function fetchResponse(url, headers = {}) {
  const response = await fetch(url, { headers });
  assert.ok(response.ok, `${url} returned ${response.status}`);
  return response;
}

async function fetchJson(url) {
  return (await fetchResponse(url, apiHeaders)).json();
}

async function fetchBytes(url) {
  return new Uint8Array(await (await fetchResponse(url)).arrayBuffer());
}

async function exactHead(repository) {
  const repositoryUrl = `https://github.com/${organization}/${repository}.git`;
  const { stdout } = await execFileAsync(
    "git",
    ["ls-remote", repositoryUrl, "HEAD"],
    { timeout: 30_000, windowsHide: true },
  );
  const match = stdout.match(/^([a-f0-9]{40})\s+HEAD\s*$/u);
  assert.ok(match, `unable to resolve exact HEAD for ${repository}`);
  return match[1];
}

function githubLicense(repositoryMetadata) {
  const license = repositoryMetadata.license;
  return {
    key: license?.key ?? null,
    name: license?.name ?? null,
    spdxId: license?.spdx_id ?? null,
  };
}

function licenseNoticePaths(tree) {
  return sortedUnique(
    tree
      .filter(
        (entry) =>
          entry.type === "blob"
          && /(^|\/)(license|licence|copying|notice)(\.[^/]*)?$/iu.test(
            entry.path,
          ),
      )
      .map((entry) => entry.path),
  );
}

function rootLicensePaths(paths) {
  return paths.filter((path) => !path.includes("/"));
}

function packageManifestEntry(tree) {
  return tree.find(
    (entry) => entry.type === "blob" && entry.path === "package.json",
  );
}

function packageLicense(value) {
  if (typeof value?.license === "string") return value.license.slice(0, 256);
  if (
    value?.license
    && typeof value.license === "object"
    && typeof value.license.type === "string"
  ) {
    return value.license.type.slice(0, 256);
  }
  return null;
}

async function packageManifest(repository, commit, tree) {
  const entry = packageManifestEntry(tree);
  if (!entry) {
    return {
      present: false,
      bytes: null,
      sha256: null,
      parsed: null,
      name: null,
      private: null,
      license: null,
    };
  }
  const bytes = await fetchBytes(rawUrl(repository, commit, entry.path));
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return {
      present: true,
      bytes: bytes.length,
      sha256: sha256(bytes),
      parsed: false,
      name: null,
      private: null,
      license: null,
    };
  }
  return {
    present: true,
    bytes: bytes.length,
    sha256: sha256(bytes),
    parsed: true,
    name: typeof value.name === "string" ? value.name.slice(0, 256) : null,
    private: typeof value.private === "boolean" ? value.private : null,
    license: packageLicense(value),
  };
}

function rootGrantSignal(text) {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("mit license")
    && normalized.includes(
      "permission is hereby granted, free of charge, to any person obtaining a copy",
    )
    && normalized.includes(
      'the software is provided "as is", without warranty of any kind',
    )
  ) {
    return "mit-text-observed";
  }
  return "unclassified-text";
}

function scopeExclusionSignal(text) {
  return /(without an explicit license|does not retroactively license|does not license|not covered by)/iu.test(
    text,
  );
}

async function rootLicenses(repository, commit, paths) {
  return Promise.all(
    paths.map(async (path) => {
      const bytes = await fetchBytes(rawUrl(repository, commit, path));
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return {
        path,
        bytes: bytes.length,
        sha256: sha256(bytes),
        firstLine: (text.split(/\r?\n/u)[0] ?? "").slice(0, 256),
        grantSignal: rootGrantSignal(text),
        scopeExclusionSignal: scopeExclusionSignal(text),
      };
    }),
  );
}

function assetInventory(tree) {
  const counts = Object.fromEntries(
    Object.keys(ASSET_EXTENSIONS).map((category) => [category, 0]),
  );
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const candidateExtension = extension(entry.path);
    for (const [category, extensions] of Object.entries(ASSET_EXTENSIONS)) {
      if (extensions.has(candidateExtension)) counts[category] += 1;
    }
  }
  return {
    ...counts,
    total:
      counts.image
      + counts.audio
      + counts.font
      + counts.model
      + counts.video,
  };
}

function rightsFinding(rootLicenseRecords, packageRecord) {
  const grantObserved = rootLicenseRecords.some(
    (license) => license.grantSignal === "mit-text-observed",
  );
  const packageDeclarationObserved = packageRecord.license !== null;
  const scopeExclusion = rootLicenseRecords.some(
    (license) => license.scopeExclusionSignal,
  );
  const codeGrantStatus = scopeExclusion
    ? "repository-grant-with-explicit-scope-exclusion"
    : grantObserved
      ? "repository-grant-observed-review-required"
      : packageDeclarationObserved
        ? "package-license-declaration-only"
        : "no-explicit-code-grant-observed";
  const blockerCodes = [
    "attribution-notices",
    "build-dependency-license",
    "content-asset-rights",
    "exact-source-build-deployment",
    "owner-authorization",
    "trademark-title",
  ];
  if (!grantObserved) blockerCodes.push("code-license");
  if (packageDeclarationObserved && !grantObserved) {
    blockerCodes.push("license-text");
  }
  if (scopeExclusion) blockerCodes.push("license-scope-closure");
  return {
    codeGrantStatus,
    contentRightsStatus: "not-cleared-by-repository-screen",
    titleTrademarkStatus: "not-reviewed",
    ownerAuthorizationStatus: "not-recorded",
    sourceDeploymentBindingStatus: "not-proven",
    redistributionStatus: "blocked",
    blockerCodes: sortedUnique(blockerCodes),
  };
}

async function observeGame(game, repositoryMetadata) {
  assert.equal(repositoryMetadata.name, game.repository);
  assert.equal(repositoryMetadata.private, false);
  assert.equal(repositoryMetadata.archived, false);
  const commit = await exactHead(game.repository);
  const treeResponse = await fetchJson(
    `https://api.github.com/repos/${organization}/${game.repository}/git/trees/${commit}?recursive=1`,
  );
  assert.equal(treeResponse.truncated, false, `${game.repository} tree is truncated`);
  const tree = treeResponse.tree;
  assert.ok(Array.isArray(tree), `${game.repository} tree is unavailable`);
  const allLicensePaths = licenseNoticePaths(tree);
  assert.ok(
    allLicensePaths.length <= MAX_LICENSE_PATHS,
    `${game.repository} license/notice path inventory exceeds the bound`,
  );
  const rootPaths = rootLicensePaths(allLicensePaths);
  const [packageRecord, licenseRecords] = await Promise.all([
    packageManifest(game.repository, commit, tree),
    rootLicenses(game.repository, commit, rootPaths),
  ]);
  const submodulePaths = sortedUnique(
    tree
      .filter((entry) => entry.type === "commit")
      .map((entry) => entry.path),
  );
  return {
    ...game,
    repositoryUrl: repositoryMetadata.html_url,
    defaultBranch: repositoryMetadata.default_branch,
    observedHeadCommit: commit,
    repositoryPublic: !repositoryMetadata.private,
    repositoryArchived: repositoryMetadata.archived,
    githubDetectedLicense: githubLicense(repositoryMetadata),
    licenseNoticePaths: allLicensePaths,
    rootLicenses: licenseRecords,
    packageManifest: packageRecord,
    assetInventory: assetInventory(tree),
    submodulePaths,
    rights: rightsFinding(licenseRecords, packageRecord),
  };
}

export function buildFirstPartyRightsSummary(games) {
  const count = (predicate) =>
    games.reduce((total, game) => total + (predicate(game) ? 1 : 0), 0);
  return {
    gameCount: games.length,
    publicRepositoryCount: count((game) => game.repositoryPublic),
    rootLicenseFileGameCount: count((game) => game.rootLicenses.length > 0),
    githubRecognizedSpdxGameCount: count(
      (game) =>
        game.githubDetectedLicense.spdxId !== null
        && game.githubDetectedLicense.spdxId !== "NOASSERTION",
    ),
    repositoryGrantObservedGameCount: count(
      (game) =>
        game.rights.codeGrantStatus
        === "repository-grant-observed-review-required",
    ),
    explicitScopeExclusionGameCount: count(
      (game) =>
        game.rights.codeGrantStatus
        === "repository-grant-with-explicit-scope-exclusion",
    ),
    packageLicenseDeclarationOnlyGameCount: count(
      (game) =>
        game.rights.codeGrantStatus === "package-license-declaration-only",
    ),
    noExplicitCodeGrantGameCount: count(
      (game) =>
        game.rights.codeGrantStatus === "no-explicit-code-grant-observed",
    ),
    ownerAuthorizationRecordedCount: count(
      (game) => game.rights.ownerAuthorizationStatus === "recorded",
    ),
    redistributionApprovedCount: count(
      (game) => game.rights.redistributionStatus === "approved",
    ),
    productionCatalogMutationCount: 0,
  };
}

export async function generateFirstPartyGameRightsScreen() {
  const repositories = await fetchJson(
    `https://api.github.com/orgs/${organization}/repos?per_page=100&type=public`,
  );
  const byName = new Map(
    repositories.map((repository) => [repository.name, repository]),
  );
  const observedAtUtc = new Date().toISOString();
  const games = [];
  for (const [index, game] of FIRST_PARTY_GAMES.entries()) {
    console.log(`[${index + 1}/${FIRST_PARTY_GAMES.length}] ${game.title}`);
    const metadata = byName.get(game.repository);
    assert.ok(metadata, `public repository ${game.repository} was not found`);
    games.push(await observeGame(game, metadata));
  }
  return {
    format: FIRST_PARTY_RIGHTS_SCREEN_FORMAT,
    evidenceDate: FIRST_PARTY_RIGHTS_SCREEN_DATE,
    observedAtUtc,
    evidenceClass: "public-repository-exact-head-rights-screen",
    qualification: "zero-offline-redistribution-approvals",
    policy: {
      decision: "fail-closed-per-title-review",
      organizationMembershipGrantsNoDistributionAuthority: true,
      publicSourceGrantsNoImplicitLicense: true,
      productionCatalogMutation: false,
      artifactDownloadOrInstallation: false,
    },
    scope: {
      catalogSnapshotDate: "2026-07-19",
      organization,
      firstPartyGameCount: FIRST_PARTY_GAMES.length,
      excludedCommunityGames: [
        "Asymptotic Bitrot",
        "Bone Cleaver",
        "Vibeman (Hangman)",
      ],
      observedMaterial:
        "public repository metadata, exact HEAD/tree identity, license/notice paths, root license bytes, root package metadata, asset-extension counts, and submodule paths",
    },
    games,
    observationSha256: firstPartyRightsObservationSha256(games),
    summary: buildFirstPartyRightsSummary(games),
    limitations: [...FIRST_PARTY_RIGHTS_LIMITATIONS],
  };
}

async function main() {
  const artifact = await generateFirstPartyGameRightsScreen();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${outputPath}; games=${artifact.summary.gameCount}; grants=${artifact.summary.repositoryGrantObservedGameCount}; scope-exclusions=${artifact.summary.explicitScopeExclusionGameCount}; approved=${artifact.summary.redistributionApprovedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
