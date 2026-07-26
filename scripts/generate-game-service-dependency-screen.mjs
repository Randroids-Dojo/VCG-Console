import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { validateTrackedFirstPartyGameRightsScreen } from "./validate-first-party-game-rights-screen.mjs";
import { validateTrackedRemoteGameOfflineEvidence } from "./validate-remote-game-offline-evidence.mjs";

export const GAME_SERVICE_SCREEN_FORMAT =
  "vcg-game-service-dependency-screen/v2";
export const GAME_SERVICE_SCREEN_DATE = "2026-07-24";
export const GAME_SERVICE_SCREEN_LIMITATIONS = Object.freeze([
  "This is a bounded static source-signal and fresh-profile browser-origin screen. It is not a complete runtime call graph, backend inventory, data-flow assessment, secret review, authenticated-session test, gameplay test, or service-owner attestation.",
  "Source matching can miss generated, obfuscated, dynamically constructed, remotely configured, post-login, post-consent, native, binary, submodule, and deployment-only dependencies. A signal can also be development-only or unused.",
  "Environment-variable names, package names, route paths, and origin names are evidence locators, not proof that a service is required, safe, available, correctly configured, or covered by a privacy/retention agreement.",
  "The three promoted community games lack first-party repository links in the catalog snapshot. Their browser observations are retained, but their implementation and service closure remain unavailable.",
  "No game receives an offline, local-package, degradation, privacy, or admission qualification from this artifact. Exact owner declarations and interactive network-loss/update evidence remain required.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  root,
  "compliance/game-services/game-service-dependency-screen-v2.json",
);
const execFileAsync = promisify(execFile);
const MAX_ARCHIVE_BYTES = 192 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_SOURCE_FILES = 20_000;
const MAX_SIGNAL_ITEMS = 512;
const organization = "Randroids-Dojo";

export const COMMUNITY_GAMES = Object.freeze([
  {
    id: "bone-cleaver",
    title: "Bone Cleaver",
    liveUrl: "https://bonecleaver.vercel.app/",
  },
  {
    id: "vibeman-hangman",
    title: "Vibeman (Hangman)",
    liveUrl: "https://hangman-exe.vercel.app/",
  },
  {
    id: "asymptotic-bitrot",
    title: "Asymptotic Bitrot",
    liveUrl: "https://asymptoticbitrot-um9i.vercel.app",
  },
]);

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".gd",
  ".godot",
  ".htm",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".py",
  ".scss",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".github",
  ".idea",
  ".next",
  ".vscode",
  "__tests__",
  "build",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "target",
  "test",
  "tests",
  "vendor",
]);

const CATEGORY_PATTERNS = Object.freeze({
  auth: {
    dependency:
      /(^|[/@-])(auth|clerk|oauth|openid|passport|lucia|session|jwt)([/@-]|$)/iu,
    environment:
      /(^|_)(AUTH|CLERK|OAUTH|OIDC|JWT|SESSION|LOGIN|IDENTITY)(_|$)/u,
  },
  database: {
    dependency:
      /(^|[/@-])(database|db|drizzle|firebase|kv|mongo|mysql|neon|pg|postgres|prisma|redis|sqlite|supabase|upstash)([/@-]|$)/iu,
    environment:
      /(^|_)(DATABASE|DB|DRIZZLE|FIREBASE|KV|MONGO|MYSQL|NEON|POSTGRES|PRISMA|REDIS|SQLITE|SUPABASE|UPSTASH)(_|$)/u,
  },
  ai: {
    dependency:
      /(^|[/@-])(ai|anthropic|gemini|genai|groq|langchain|openai)([/@-]|$)/iu,
    environment:
      /(^|_)(AI|ANTHROPIC|GEMINI|GENAI|GROQ|LLM|MODEL|OPENAI)(_|$)/u,
  },
  analytics: {
    dependency:
      /(^|[/@-])(analytics|datadog|logrocket|posthog|sentry|telemetry)([/@-]|$)/iu,
    environment:
      /(^|_)(ANALYTICS|DATADOG|GA|LOGROCKET|POSTHOG|SENTRY|TELEMETRY)(_|$)/u,
  },
  notifications: {
    dependency:
      /(^|[/@-])(email|mail|nodemailer|push|resend|sendgrid|twilio|web-push)([/@-]|$)/iu,
    environment:
      /(^|_)(EMAIL|MAIL|PUSH|RESEND|SENDGRID|SMTP|TWILIO|VAPID)(_|$)/u,
  },
  payments: {
    dependency: /(^|[/@-])(billing|checkout|payment|paypal|stripe)([/@-]|$)/iu,
    environment: /(^|_)(BILLING|CHECKOUT|PAYMENT|PAYPAL|STRIPE)(_|$)/u,
  },
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function gameServiceObservationSha256(games) {
  return sha256(new TextEncoder().encode(JSON.stringify(games)));
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function boundedSorted(values, label) {
  const result = sortedUnique(values);
  assert.ok(result.length <= MAX_SIGNAL_ITEMS, `${label} exceeds the bound`);
  return result;
}

function canonicalOrigin(value) {
  try {
    if (/[${}]/u.test(value)) return null;
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function downloadArchive(url, path) {
  const response = await fetch(url, {
    headers: { "User-Agent": "VCG-Console-service-screen" },
  });
  assert.ok(response.ok && response.body, `${url} returned ${response.status}`);
  const handle = await open(path, "wx");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      bytes += chunk.length;
      assert.ok(bytes <= MAX_ARCHIVE_BYTES, `${url} exceeds archive bound`);
      hash.update(chunk);
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function walk(directory, base, files) {
  assert.ok(files.length <= MAX_SOURCE_FILES, "source file count exceeds bound");
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        await walk(absolute, base, files);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    const path = relative(base, absolute).replaceAll("\\", "/");
    files.push({ absolute, path });
    assert.ok(files.length <= MAX_SOURCE_FILES, "source file count exceeds bound");
  }
}

function shouldRead(path) {
  const name = basename(path).toLowerCase();
  return (
    TEXT_EXTENSIONS.has(extname(name))
    || name === "package.json"
    || name.startsWith(".env")
  );
}

function shouldScanOrigins(path) {
  const name = basename(path).toLowerCase();
  return !(
    name === "package.json"
    || name === "package-lock.json"
    || name === "npm-shrinkwrap.json"
    || name === "pnpm-lock.yaml"
    || name === "yarn.lock"
    || name.startsWith(".env")
  );
}

function environmentNames(text, path) {
  const names = [];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/gu,
    /import\.meta\.env\.([A-Z][A-Z0-9_]*)/gu,
    /(?:Deno\.env\.get|os\.getenv|getenv)\(\s*["']([A-Z][A-Z0-9_]*)["']/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) names.push(match[1]);
  }
  if (basename(path).toLowerCase().startsWith(".env")) {
    for (const match of text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gmu)) {
      names.push(match[1]);
    }
  }
  return names;
}

function literalOrigins(text) {
  const origins = [];
  for (const match of text.matchAll(/https?:\/\/[^\s"'`<>\\)\]}]+/gu)) {
    const origin = canonicalOrigin(match[0].replace(/[.,;:]+$/u, ""));
    if (origin) origins.push(origin);
  }
  return origins;
}

function isApiRoute(path) {
  return (
    /(^|\/)(app\/api|pages\/api|api)\/.+\.(cjs|js|jsx|mjs|ts|tsx)$/iu.test(
      path,
    )
    || /(^|\/)functions\/.+\.(cjs|js|jsx|mjs|py|ts|tsx)$/iu.test(path)
  );
}

function packageDependencies(value, target) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = value?.[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const [name, specification] of Object.entries(dependencies)) {
      if (typeof specification !== "string") continue;
      if (!target.has(name)) target.set(name, new Set());
      target.get(name).add(specification.slice(0, 256));
    }
  }
}

function dependencyRecords(dependencies) {
  return [...dependencies.entries()]
    .map(([name, specifications]) => ({
      name,
      specifications: sortedUnique(specifications),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildServiceSignals(dependencies, environment, origins) {
  const result = {};
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    result[category] = boundedSorted(
      [
        ...dependencies
          .filter(({ name }) => patterns.dependency.test(name))
          .map(({ name }) => `dependency:${name}`),
        ...environment
          .filter((name) => patterns.environment.test(name))
          .map((name) => `environment:${name}`),
      ],
      `${category} signals`,
    );
  }
  result.externalNetwork = boundedSorted(
    origins.map((origin) => `origin:${origin}`),
    "external network signals",
  );
  return result;
}

async function scanSourceArchive(game, temporaryRoot) {
  const archivePath = join(temporaryRoot, `${game.repository}.zip`);
  const extractionRoot = join(temporaryRoot, `${game.repository}-source`);
  await mkdir(extractionRoot);
  const archiveUrl =
    `https://codeload.github.com/${organization}/${game.repository}/zip/`
    + game.observedHeadCommit;
  const archive = await downloadArchive(archiveUrl, archivePath);
  await execFileAsync(
    "tar",
    ["--exclude", "*/AGENTS.md", "-xf", archivePath, "-C", extractionRoot],
    {
      timeout: 120_000,
      windowsHide: true,
    },
  );
  const extracted = await readdir(extractionRoot, { withFileTypes: true });
  const roots = extracted.filter((entry) => entry.isDirectory());
  assert.equal(roots.length, 1, `${game.repository} archive root is ambiguous`);
  const sourceRoot = join(extractionRoot, roots[0].name);
  const files = [];
  await walk(sourceRoot, sourceRoot, files);

  const dependencies = new Map();
  const packageManifestPaths = [];
  const envNames = [];
  const origins = [];
  const apiRoutePaths = [];
  let screenedTextFileCount = 0;
  let skippedOversizeTextFileCount = 0;
  let unreadableTextFileCount = 0;
  for (const file of files) {
    if (isApiRoute(file.path)) apiRoutePaths.push(file.path);
    if (!shouldRead(file.path)) continue;
    const metadata = await stat(file.absolute);
    if (metadata.size > MAX_TEXT_BYTES) {
      skippedOversizeTextFileCount += 1;
      continue;
    }
    let bytes;
    let text;
    try {
      bytes = await readFile(file.absolute);
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      unreadableTextFileCount += 1;
      continue;
    }
    screenedTextFileCount += 1;
    envNames.push(...environmentNames(text, file.path));
    if (shouldScanOrigins(file.path)) origins.push(...literalOrigins(text));
    if (basename(file.path).toLowerCase() === "package.json") {
      try {
        packageDependencies(JSON.parse(text), dependencies);
        packageManifestPaths.push(file.path);
      } catch {
        // Invalid public package metadata is represented by the unreadable path gap.
        unreadableTextFileCount += 1;
      }
    }
  }
  const runtimeDependencies = dependencyRecords(dependencies);
  const environmentVariableNames = boundedSorted(
    envNames,
    `${game.repository} environment names`,
  );
  const sourceLiteralOrigins = boundedSorted(
    origins,
    `${game.repository} literal origins`,
  );
  return {
    status: "exact-public-source-screened",
    repository: game.repository,
    repositoryUrl: game.repositoryUrl,
    commit: game.observedHeadCommit,
    archiveUrl,
    archiveBytes: archive.bytes,
    archiveSha256: archive.sha256,
    sourceFileCount: files.length,
    screenedTextFileCount,
    skippedOversizeTextFileCount,
    unreadableTextFileCount,
    packageManifestPaths: boundedSorted(
      packageManifestPaths,
      `${game.repository} package paths`,
    ),
    runtimeDependencies,
    environmentVariableNames,
    apiRoutePaths: boundedSorted(
      apiRoutePaths,
      `${game.repository} API routes`,
    ),
    sourceLiteralOrigins,
    submodulePaths: [...game.submodulePaths],
  };
}

function unavailableSource() {
  return {
    status: "no-first-party-repository-link",
    repository: null,
    repositoryUrl: null,
    commit: null,
    archiveUrl: null,
    archiveBytes: null,
    archiveSha256: null,
    sourceFileCount: null,
    screenedTextFileCount: null,
    skippedOversizeTextFileCount: null,
    unreadableTextFileCount: null,
    packageManifestPaths: [],
    runtimeDependencies: [],
    environmentVariableNames: [],
    apiRoutePaths: [],
    sourceLiteralOrigins: [],
    submodulePaths: [],
  };
}

function browserRecord(game) {
  return {
    finalOnlineUrl: game.finalOnlineUrl,
    observedOrigins: [...game.online.origins],
    observedThirdPartyOrigins: [...game.online.thirdPartyOrigins],
    mutatingRequestCount: game.online.mutatingRequestCount,
    localStorageKeyCount:
      game.browserState.afterServiceWorkerUpdate.localStorageKeys.length,
    cacheStorageNameCount:
      game.browserState.afterServiceWorkerUpdate.cacheNames.length,
    indexedDbNameCount:
      game.browserState.afterServiceWorkerUpdate.indexedDbNames.length,
  };
}

function buildGameRecord(identity, source, browser) {
  const firstPartyOrigin = canonicalOrigin(identity.liveUrl);
  const allExternalOrigins = boundedSorted(
    [...source.sourceLiteralOrigins, ...browser.observedThirdPartyOrigins].filter(
      (origin) => origin !== firstPartyOrigin,
    ),
    `${identity.id} external origins`,
  );
  return {
    id: identity.id,
    title: identity.title,
    catalogClass:
      source.status === "exact-public-source-screened"
        ? "first-party"
        : "promoted-community",
    liveUrl: identity.liveUrl,
    source,
    browser,
    serviceSignals: buildServiceSignals(
      source.runtimeDependencies,
      source.environmentVariableNames,
      allExternalOrigins,
    ),
    consoleNetworkRecommendation: "required-pending-per-title-review",
    degradationStatus: "unverified-source-signal-only",
    offlineQualification: "none",
  };
}

export function buildGameServiceSummary(games) {
  const count = (predicate) =>
    games.reduce((total, game) => total + (predicate(game) ? 1 : 0), 0);
  const signaled = (category) =>
    count((game) => game.serviceSignals[category].length > 0);
  return {
    gameCount: games.length,
    exactSourceScreenedCount: count(
      (game) => game.source.status === "exact-public-source-screened",
    ),
    sourceUnavailableCount: count(
      (game) => game.source.status === "no-first-party-repository-link",
    ),
    authSignalGameCount: signaled("auth"),
    databaseSignalGameCount: signaled("database"),
    aiSignalGameCount: signaled("ai"),
    analyticsSignalGameCount: signaled("analytics"),
    notificationSignalGameCount: signaled("notifications"),
    paymentSignalGameCount: signaled("payments"),
    externalNetworkSignalGameCount: signaled("externalNetwork"),
    apiRouteGameCount: count((game) => game.source.apiRoutePaths.length > 0),
    environmentVariableGameCount: count(
      (game) => game.source.environmentVariableNames.length > 0,
    ),
    verifiedDegradationGameCount: 0,
    offlineQualifiedGameCount: 0,
    productionCatalogMutationCount: 0,
  };
}

export async function generateGameServiceDependencyScreen() {
  const [rights, offline] = await Promise.all([
    validateTrackedFirstPartyGameRightsScreen(),
    validateTrackedRemoteGameOfflineEvidence(),
  ]);
  const offlineById = new Map(offline.games.map((game) => [game.id, game]));
  const temporaryRoot = await mkdtemp(join(tmpdir(), "vcg-service-screen-"));
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  const resolvedTemporaryBase = resolve(tmpdir());
  assert.ok(
    resolvedTemporaryRoot.startsWith(`${resolvedTemporaryBase}${sep}`)
      && basename(resolvedTemporaryRoot).startsWith("vcg-service-screen-"),
    "temporary source root escaped the OS temp directory",
  );
  const games = [];
  try {
    for (const [index, game] of rights.games.entries()) {
      console.log(`[${index + 1}/23] ${game.title}`);
      const browser = offlineById.get(game.id);
      assert.ok(browser, `browser observation missing for ${game.id}`);
      games.push(
        buildGameRecord(
          {
            id: game.id,
            title: game.title,
            liveUrl: game.liveUrl,
          },
          await scanSourceArchive(game, temporaryRoot),
          browserRecord(browser),
        ),
      );
    }
    for (const community of COMMUNITY_GAMES) {
      const browser = offlineById.get(community.id);
      assert.ok(browser, `browser observation missing for ${community.id}`);
      games.push(
        buildGameRecord(
          community,
          unavailableSource(),
          browserRecord(browser),
        ),
      );
    }
  } finally {
    await rm(resolvedTemporaryRoot, { recursive: true, force: true });
  }
  return {
    format: GAME_SERVICE_SCREEN_FORMAT,
    evidenceDate: GAME_SERVICE_SCREEN_DATE,
    observedAtUtc: new Date().toISOString(),
    evidenceClass: "exact-source-and-fresh-browser-service-signal-screen",
    qualification: "zero-verified-degradation-or-offline-claims",
    policy: {
      signalsGrantNoRuntimeAuthority: true,
      signalsGrantNoDataCollectionAuthority: true,
      signalsGrantNoOfflineClaim: true,
      productionCatalogMutation: false,
    },
    provenance: {
      firstPartyRightsFormat: rights.format,
      firstPartyRightsObservationSha256: rights.observationSha256,
      remoteOfflineFormat: offline.format,
      remoteOfflineObservationSha256: offline.observationSha256,
    },
    scope: {
      catalogSnapshotDate: "2026-07-19",
      gameCount: games.length,
      sourceArchiveMaximumBytes: MAX_ARCHIVE_BYTES,
      textFileMaximumBytes: MAX_TEXT_BYTES,
      sourceFileMaximumCount: MAX_SOURCE_FILES,
      signalMaximumItems: MAX_SIGNAL_ITEMS,
      storedData:
        "public package names/specifications, environment-variable names, API route paths, origin names, source archive identity/counts, and prior privacy-bounded browser counts only",
      excludedFromTextScan:
        "AGENTS.md; hidden/tooling, documentation, test, build, dependency, and vendor directories; symlinks; unsupported extensions; and text files larger than the declared bound",
    },
    games,
    observationSha256: gameServiceObservationSha256(games),
    summary: buildGameServiceSummary(games),
    limitations: [...GAME_SERVICE_SCREEN_LIMITATIONS],
  };
}

async function main() {
  const artifact = await generateGameServiceDependencyScreen();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${outputPath}; games=${artifact.summary.gameCount}; source-screened=${artifact.summary.exactSourceScreenedCount}; degradation-verified=${artifact.summary.verifiedDegradationGameCount}; offline-qualified=${artifact.summary.offlineQualifiedGameCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
