import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export const REMOTE_GAME_OFFLINE_EVIDENCE_FORMAT =
  "vcg-remote-game-offline-observation/v2";
export const REMOTE_GAME_OFFLINE_EVIDENCE_DATE = "2026-07-24";
export const REMOTE_GAME_OFFLINE_LIMITATIONS = Object.freeze([
  "This is a Windows x64 headless Google Chrome desk observation of the 26 URLs in the 2026-07-19 VibeCoded.Games snapshot. Each main observation uses a new anonymous context, and each cold-restart observation uses a separate new persistent profile that is removed after the same-profile relaunch. It is not target-Linux, physical-TV, controller, game-play, account, backend, source, license, or redistribution qualification.",
  "Navigation, one online reload, browser-managed service-worker update checks, storage inventory, endpoint GET probes, one same-context offline reload, and one separately primed two-load cold offline browser restart were exercised without game interaction. Features reached only after play, login, consent, notification permission, or another route can remain undiscovered.",
  "A loaded offline document, manifest, service-worker registration, cache, or fetch handler does not prove complete offline play, correct save behavior, installable packaging, or safe updates. No title is promoted to an offline package by this artifact.",
  "Endpoint hashes identify the public bytes observed during this run only. Hosted deployments can change without a repository commit or console release, so the observations must be repeated for admission and release qualification.",
  "Only storage container names and keys from a new anonymous profile are recorded; values, cookies, request paths, query strings, response bodies, console messages, and identifiers are deliberately excluded.",
  "Offline behavior is induced with the browser-context network emulation boundary before navigation. It is not an operating-system network namespace, cable-disconnect, DNS-failure, captive-portal, intermittent-network, or target service-supervisor test.",
]);

export const REMOTE_GAMES = Object.freeze([
  {
    id: "vibebots",
    title: "VibeBots",
    entrypoint: "https://vibebots.randroid.dev",
  },
  {
    id: "vibe-pinball",
    title: "VibePinball",
    entrypoint: "https://vibe-pinball.vercel.app",
  },
  {
    id: "vibe-racer",
    title: "VibeRacer",
    entrypoint: "https://vibe-racer-three.vercel.app",
  },
  {
    id: "vibe-pins",
    title: "VibePins",
    entrypoint: "https://vibe-pins.vercel.app",
  },
  {
    id: "bone-cleaver",
    title: "Bone Cleaver",
    entrypoint: "https://bonecleaver.vercel.app/",
  },
  {
    id: "vibeman-hangman",
    title: "Vibeman (Hangman)",
    entrypoint: "https://hangman-exe.vercel.app/",
  },
  {
    id: "asymptotic-bitrot",
    title: "Asymptotic Bitrot",
    entrypoint: "https://asymptoticbitrot-um9i.vercel.app",
  },
  {
    id: "fracking-asteroids",
    title: "Fracking Asteroids",
    entrypoint: "https://fracking-asteroids.vercel.app",
  },
  {
    id: "hoops",
    title: "Hoops",
    entrypoint: "https://hoops-kappa.vercel.app",
  },
  {
    id: "mi-casa-es-su-casa",
    title: "Mi Casa Es Su Casa",
    entrypoint: "https://mi-casa-es-su-casa.vercel.app",
  },
  {
    id: "block-punch-kick",
    title: "Block Punch Kick",
    entrypoint: "https://block-punch-kick.vercel.app",
  },
  {
    id: "epoch",
    title: "Epoch",
    entrypoint: "https://epoch-theta.vercel.app",
  },
  {
    id: "game-tape",
    title: "GameTape",
    entrypoint: "https://game-tape.vercel.app",
  },
  {
    id: "go-pit",
    title: "GoPit",
    entrypoint: "https://go-pit.vercel.app",
  },
  {
    id: "block-you",
    title: "Block-You",
    entrypoint: "https://block-you.vercel.app",
  },
  {
    id: "determined",
    title: "Determined",
    entrypoint: "https://determined-khaki.vercel.app",
  },
  {
    id: "software-dev-sim",
    title: "SoftwareDevSim",
    entrypoint: "https://software-dev-sim.vercel.app",
  },
  {
    id: "baby-piano",
    title: "Baby Piano",
    entrypoint: "https://baby-piano-eight.vercel.app",
  },
  {
    id: "clankers",
    title: "Clankers",
    entrypoint: "https://clankers-mocha.vercel.app",
  },
  {
    id: "vibe-city",
    title: "VibeCity",
    entrypoint: "https://vibe-city-weld.vercel.app",
  },
  {
    id: "flatline",
    title: "Flatline",
    entrypoint: "https://flatline-gamma.vercel.app",
  },
  {
    id: "vibe-gear-2",
    title: "VibeGear2",
    entrypoint: "https://vibe-gear2.vercel.app",
  },
  {
    id: "text-racer",
    title: "Text Racer",
    entrypoint: "https://text-racer.vercel.app",
  },
  {
    id: "drop-dead-keep",
    title: "Drop Dead Keep",
    entrypoint: "https://drop-dead-keep.vercel.app",
  },
  {
    id: "streamer-billboard",
    title: "Streamer Billboard",
    entrypoint: "https://streamer-billboard.vercel.app",
  },
  {
    id: "go-dig",
    title: "GoDig",
    entrypoint: "https://go-dig.vercel.app",
  },
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/console-lab");
const outputPath = resolve(
  root,
  "compliance/hosted-game-offline/remote-game-offline-observation-v2.json",
);
const ONLINE_TIMEOUT_MS = 30_000;
const OFFLINE_TIMEOUT_MS = 15_000;
const SETTLE_MS = 1_500;
const MAX_PROBE_BYTES = 2 * 1024 * 1024;
const COLD_RESTART_PROFILE_PREFIX = "vcg-remote-offline-";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function remoteGameObservationSha256(games) {
  return sha256(new TextEncoder().encode(JSON.stringify(games)));
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sortedCounts(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function navigationFailure(error) {
  const message = String(error?.message ?? error);
  const networkCode = message.match(/net::(ERR_[A-Z0-9_]+)/u)?.[1];
  if (networkCode) return `net::${networkCode}`;
  if (/timeout/iu.test(message)) return "timeout";
  return "navigation-error";
}

function findChrome() {
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];
  return candidates.find((candidate) => {
    try {
      const require = createRequire(import.meta.url);
      require("node:fs").accessSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function classifyEndpoint(status, contentType, text, url) {
  if ([404, 410].includes(status)) return "not-found";
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes("text/html")) return "html-fallback";
  if (
    normalizedType.includes("manifest+json")
    || normalizedType.includes("application/json")
  ) {
    try {
      const value = JSON.parse(text);
      if (
        value
        && typeof value === "object"
        && ("start_url" in value || "name" in value || "icons" in value)
      ) {
        return "web-manifest";
      }
    } catch {
      return "other";
    }
  }
  if (
    normalizedType.includes("javascript")
    || normalizedType.includes("ecmascript")
    || new URL(url).pathname.endsWith(".js")
  ) {
    return "javascript";
  }
  return "other";
}

function boundedManifestFields(text, classification) {
  if (classification !== "web-manifest") return null;
  try {
    const value = JSON.parse(text);
    const stringOrNull = (field) =>
      typeof value[field] === "string" ? value[field].slice(0, 256) : null;
    return {
      name: stringOrNull("name"),
      shortName: stringOrNull("short_name"),
      startUrl: stringOrNull("start_url"),
      scope: stringOrNull("scope"),
      display: stringOrNull("display"),
      iconCount: Array.isArray(value.icons) ? value.icons.length : 0,
    };
  } catch {
    return null;
  }
}

function serviceWorkerFeatures(text, classification) {
  if (classification !== "javascript") return null;
  const hasListener = (name) =>
    new RegExp(`addEventListener\\s*\\(\\s*["']${name}["']`, "u").test(text);
  return {
    install: hasListener("install"),
    activate: hasListener("activate"),
    fetch: hasListener("fetch"),
    push: hasListener("push"),
    notificationClick: hasListener("notificationclick"),
  };
}

async function probeEndpoint(request, url) {
  try {
    const response = await request.get(url, {
      failOnStatusCode: false,
      timeout: 10_000,
    });
    const body = await response.body();
    const inspected = body.subarray(0, MAX_PROBE_BYTES);
    const text = new TextDecoder("utf-8").decode(inspected);
    const contentType = response.headers()["content-type"] ?? "";
    const finalUrl = canonicalUrl(response.url()) ?? canonicalUrl(url);
    const classification = classifyEndpoint(
      response.status(),
      contentType,
      text,
      finalUrl,
    );
    return {
      url: canonicalUrl(url),
      finalUrl,
      outcome: "response",
      status: response.status(),
      contentType: contentType.slice(0, 256),
      bodyBytes: body.length,
      bodyTruncated: body.length > MAX_PROBE_BYTES,
      sha256: sha256(body),
      classification,
      manifest: boundedManifestFields(text, classification),
      serviceWorkerFeatures: serviceWorkerFeatures(text, classification),
    };
  } catch (error) {
    return {
      url: canonicalUrl(url),
      finalUrl: null,
      outcome: "request-error",
      status: null,
      contentType: null,
      bodyBytes: null,
      bodyTruncated: null,
      sha256: null,
      classification: "unavailable",
      manifest: null,
      serviceWorkerFeatures: null,
      error: navigationFailure(error),
    };
  }
}

async function pageState(page) {
  try {
    return await page.evaluate(async () => {
      const registrations =
        "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistrations()
          : [];
      const databases =
        typeof indexedDB.databases === "function"
          ? await indexedDB.databases()
          : [];
      return {
        documentAccessible: true,
        readyState: document.readyState,
        title: document.title.slice(0, 256),
        manifestLinks: [...document.querySelectorAll('link[rel~="manifest"]')]
          .map((link) => link.href)
          .filter(Boolean),
        serviceWorkerSupported: "serviceWorker" in navigator,
        serviceWorkerController:
          navigator.serviceWorker?.controller?.scriptURL ?? null,
        registrations: registrations.map((registration) => ({
          scope: registration.scope,
          active: registration.active?.scriptURL ?? null,
          waiting: registration.waiting?.scriptURL ?? null,
          installing: registration.installing?.scriptURL ?? null,
        })),
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage),
        cacheNames: "caches" in globalThis ? await caches.keys() : [],
        indexedDbNames: databases
          .map((database) => database.name)
          .filter((name) => typeof name === "string"),
        bodyTextLength: document.body?.innerText.length ?? 0,
      };
    });
  } catch {
    return {
      documentAccessible: false,
      readyState: null,
      title: null,
      manifestLinks: [],
      serviceWorkerSupported: false,
      serviceWorkerController: null,
      registrations: [],
      localStorageKeys: [],
      sessionStorageKeys: [],
      cacheNames: [],
      indexedDbNames: [],
      bodyTextLength: null,
    };
  }
}

async function updateServiceWorkers(page) {
  try {
    return await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) {
        return { attempted: 0, succeeded: 0, failed: 0 };
      }
      const registrations = await navigator.serviceWorker.getRegistrations();
      const results = await Promise.allSettled(
        registrations.map((registration) => registration.update()),
      );
      return {
        attempted: results.length,
        succeeded: results.filter((result) => result.status === "fulfilled")
          .length,
        failed: results.filter((result) => result.status === "rejected").length,
      };
    });
  } catch {
    return { attempted: 0, succeeded: 0, failed: 0 };
  }
}

async function cdpManifestState(context, page) {
  let session;
  try {
    session = await context.newCDPSession(page);
    await session.send("Page.enable");
    const [manifest, installability] = await Promise.all([
      session.send("Page.getAppManifest"),
      session.send("Page.getInstallabilityErrors"),
    ]);
    return {
      available: true,
      manifestUrl: canonicalUrl(manifest.url),
      manifestErrorCount: Array.isArray(manifest.errors)
        ? manifest.errors.length
        : 0,
      installabilityErrorIds: sortedUnique(
        (installability.installabilityErrors ?? [])
          .map((error) => error.errorId)
          .filter((errorId) => typeof errorId === "string"),
      ),
    };
  } catch {
    return {
      available: false,
      manifestUrl: null,
      manifestErrorCount: null,
      installabilityErrorIds: [],
    };
  } finally {
    await session?.detach().catch(() => {});
  }
}

function normalizedState(state) {
  const boundedNames = (values) =>
    sortedUnique(values.map((value) => String(value).slice(0, 256)));
  return {
    documentAccessible: state.documentAccessible,
    readyState: state.readyState,
    title: state.title,
    manifestLinks: sortedUnique(
      state.manifestLinks.map(canonicalUrl).filter(Boolean),
    ),
    serviceWorkerSupported: state.serviceWorkerSupported,
    serviceWorkerController: canonicalUrl(state.serviceWorkerController),
    registrations: state.registrations
      .map((registration) => ({
        scope: canonicalUrl(registration.scope),
        active: canonicalUrl(registration.active),
        waiting: canonicalUrl(registration.waiting),
        installing: canonicalUrl(registration.installing),
      }))
      .sort((left, right) =>
        String(left.scope).localeCompare(String(right.scope))),
    localStorageKeys: boundedNames(state.localStorageKeys),
    sessionStorageKeys: boundedNames(state.sessionStorageKeys),
    cacheNames: boundedNames(state.cacheNames),
    indexedDbNames: boundedNames(state.indexedDbNames),
    bodyTextLength: state.bodyTextLength,
  };
}

async function observeGame(browser, game) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    serviceWorkers: "allow",
  });
  const page = await context.newPage();
  const requestMethods = new Map();
  const responseStatuses = new Map();
  const requestOrigins = [];
  let requestCount = 0;
  let responseCount = 0;
  let requestFailureCount = 0;
  let consoleErrorCount = 0;
  let pageErrorCount = 0;

  page.on("request", (request) => {
    requestCount += 1;
    requestMethods.set(
      request.method(),
      (requestMethods.get(request.method()) ?? 0) + 1,
    );
    try {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol)) {
        requestOrigins.push(url.origin);
      }
    } catch {
      // Non-URL browser requests remain represented in the total count.
    }
  });
  page.on("response", (response) => {
    responseCount += 1;
    const status = String(response.status());
    responseStatuses.set(status, (responseStatuses.get(status) ?? 0) + 1);
  });
  page.on("requestfailed", () => {
    requestFailureCount += 1;
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrorCount += 1;
  });
  page.on("pageerror", () => {
    pageErrorCount += 1;
  });

  let firstLoad = { outcome: "loaded", error: null };
  let secondLoad = { outcome: "loaded", error: null };
  try {
    await page.goto(game.entrypoint, {
      waitUntil: "domcontentloaded",
      timeout: ONLINE_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);
  } catch (error) {
    firstLoad = { outcome: "failed", error: navigationFailure(error) };
  }

  const firstState = normalizedState(await pageState(page));
  try {
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: ONLINE_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);
  } catch (error) {
    secondLoad = { outcome: "failed", error: navigationFailure(error) };
  }

  const beforeUpdateState = normalizedState(await pageState(page));
  const serviceWorkerUpdate = await updateServiceWorkers(page);
  await page.waitForTimeout(500);
  const afterUpdateState = normalizedState(await pageState(page));
  const cdpManifest = await cdpManifestState(context, page);
  const cookies = sortedUnique(
    (await context.cookies()).map((cookie) => cookie.name.slice(0, 256)),
  );

  const finalOnlineUrl = canonicalUrl(page.url()) ?? canonicalUrl(game.entrypoint);
  const onlineOrigin = new URL(finalOnlineUrl).origin;
  const manifestProbeUrls = sortedUnique(
    [
      new URL("/manifest.webmanifest", onlineOrigin).href,
      new URL("/manifest.json", onlineOrigin).href,
      ...afterUpdateState.manifestLinks,
      cdpManifest.manifestUrl,
    ].filter(Boolean),
  ).slice(0, 8);
  const serviceWorkerProbeUrls = sortedUnique(
    [
      new URL("/sw.js", onlineOrigin).href,
      new URL("/service-worker.js", onlineOrigin).href,
      ...afterUpdateState.registrations.flatMap((registration) => [
        registration.active,
        registration.waiting,
        registration.installing,
      ]),
    ].filter(Boolean),
  ).slice(0, 8);
  const manifestProbes = await Promise.all(
    manifestProbeUrls.map((url) => probeEndpoint(context.request, url)),
  );
  const serviceWorkerProbes = await Promise.all(
    serviceWorkerProbeUrls.map((url) => probeEndpoint(context.request, url)),
  );

  await context.setOffline(true);
  let offlineReload = { outcome: "loaded", error: null };
  try {
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: OFFLINE_TIMEOUT_MS,
    });
    await page.waitForTimeout(500);
  } catch (error) {
    offlineReload = { outcome: "failed", error: navigationFailure(error) };
  }
  const offlineState = normalizedState(await pageState(page));

  const entrypointOrigin = new URL(game.entrypoint).origin;
  const origins = sortedUnique(requestOrigins);
  const result = {
    ...game,
    finalOnlineUrl,
    online: {
      firstLoad,
      secondLoad,
      requestCount,
      responseCount,
      requestFailureCount,
      consoleErrorCount,
      pageErrorCount,
      requestMethods: sortedCounts(requestMethods),
      responseStatuses: sortedCounts(responseStatuses),
      origins,
      thirdPartyOrigins: origins.filter(
        (origin) => origin !== entrypointOrigin && origin !== onlineOrigin,
      ),
      mutatingRequestCount: [...requestMethods.entries()]
        .filter(([method]) => !["GET", "HEAD", "OPTIONS"].includes(method))
        .reduce((total, [, count]) => total + count, 0),
    },
    browserState: {
      firstLoad: firstState,
      beforeServiceWorkerUpdate: beforeUpdateState,
      afterServiceWorkerUpdate: afterUpdateState,
      cookieNames: cookies,
    },
    manifest: {
      cdp: cdpManifest,
      probes: manifestProbes,
    },
    serviceWorker: {
      update: serviceWorkerUpdate,
      probes: serviceWorkerProbes,
    },
    offlineReload: {
      ...offlineReload,
      state: offlineState,
    },
  };
  await context.close();
  return result;
}

async function onlyPersistentPage(context) {
  const pages = context.pages();
  assert.ok(
    pages.length <= 1,
    "persistent cold-restart context opened unexpected extra pages",
  );
  return pages[0] ?? context.newPage();
}

async function removeColdRestartProfile(profilePath) {
  const resolvedTemp = resolve(tmpdir());
  const resolvedProfile = resolve(profilePath);
  assert.equal(
    dirname(resolvedProfile),
    resolvedTemp,
    "cold-restart profile is not a direct child of the temporary directory",
  );
  assert.match(
    basename(resolvedProfile),
    /^vcg-remote-offline-[A-Za-z0-9_-]{6,}$/u,
    "cold-restart profile name is not branded",
  );
  const metadata = await lstat(resolvedProfile);
  assert.ok(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    "cold-restart profile is not a real directory",
  );
  await rm(resolvedProfile, {
    recursive: true,
    force: false,
    maxRetries: 3,
    retryDelay: 100,
  });
  await assert.rejects(
    lstat(resolvedProfile),
    (error) => error?.code === "ENOENT",
    "cold-restart profile was not removed",
  );
}

async function launchPersistentObservationContext(
  chromium,
  chromePath,
  profilePath,
) {
  return chromium.launchPersistentContext(profilePath, {
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu"],
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    serviceWorkers: "allow",
  });
}

async function observeColdOfflineRestart(chromium, chromePath, game) {
  const profilePath = await mkdtemp(
    resolve(tmpdir(), COLD_RESTART_PROFILE_PREFIX),
  );
  let onlineContext;
  let offlineContext;
  let profileRemoved = false;
  try {
    onlineContext = await launchPersistentObservationContext(
      chromium,
      chromePath,
      profilePath,
    );
    const onlinePage = await onlyPersistentPage(onlineContext);
    let firstLoad = { outcome: "loaded", error: null };
    let secondLoad = { outcome: "loaded", error: null };
    try {
      await onlinePage.goto(game.entrypoint, {
        waitUntil: "domcontentloaded",
        timeout: ONLINE_TIMEOUT_MS,
      });
      await onlinePage.waitForTimeout(SETTLE_MS);
    } catch (error) {
      firstLoad = { outcome: "failed", error: navigationFailure(error) };
    }
    try {
      await onlinePage.reload({
        waitUntil: "domcontentloaded",
        timeout: ONLINE_TIMEOUT_MS,
      });
      await onlinePage.waitForTimeout(SETTLE_MS);
    } catch (error) {
      secondLoad = { outcome: "failed", error: navigationFailure(error) };
    }
    const onlinePrimeState = normalizedState(await pageState(onlinePage));
    await onlineContext.close();
    onlineContext = undefined;

    offlineContext = await launchPersistentObservationContext(
      chromium,
      chromePath,
      profilePath,
    );
    await offlineContext.setOffline(true);
    const offlinePage = await onlyPersistentPage(offlineContext);
    let requestCount = 0;
    let responseCount = 0;
    let requestFailureCount = 0;
    offlinePage.on("request", () => {
      requestCount += 1;
    });
    offlinePage.on("response", () => {
      responseCount += 1;
    });
    offlinePage.on("requestfailed", () => {
      requestFailureCount += 1;
    });
    let offlineRestart = { outcome: "loaded", error: null };
    try {
      await offlinePage.goto(game.entrypoint, {
        waitUntil: "domcontentloaded",
        timeout: OFFLINE_TIMEOUT_MS,
      });
      await offlinePage.waitForTimeout(500);
    } catch (error) {
      offlineRestart = {
        outcome: "failed",
        error: navigationFailure(error),
      };
    }
    const offlineRestartState = normalizedState(await pageState(offlinePage));
    await offlineContext.close();
    offlineContext = undefined;
    await removeColdRestartProfile(profilePath);
    profileRemoved = true;

    return {
      onlinePrime: {
        firstLoad,
        secondLoad,
        state: onlinePrimeState,
      },
      cleanOnlineClose: true,
      browserRestarted: true,
      offlineConfiguredBeforeNavigation: true,
      offlineRestart: {
        ...offlineRestart,
        requestCount,
        responseCount,
        requestFailureCount,
        state: offlineRestartState,
      },
      cleanOfflineClose: true,
      profileRemoved: true,
    };
  } finally {
    await onlineContext?.close().catch(() => {});
    await offlineContext?.close().catch(() => {});
    if (!profileRemoved) {
      await removeColdRestartProfile(profilePath);
    }
  }
}

export function buildRemoteGameOfflineSummary(games) {
  const has = (game, predicate) => (predicate(game) ? 1 : 0);
  return {
    gameCount: games.length,
    onlineFirstLoadSuccessCount: games.reduce(
      (count, game) =>
        count + has(game, (value) => value.online.firstLoad.outcome === "loaded"),
      0,
    ),
    onlineSecondLoadSuccessCount: games.reduce(
      (count, game) =>
        count
        + has(game, (value) => value.online.secondLoad.outcome === "loaded"),
      0,
    ),
    manifestLinkGameCount: games.reduce(
      (count, game) =>
        count
        + has(
          game,
          (value) =>
            value.browserState.afterServiceWorkerUpdate.manifestLinks.length > 0,
        ),
      0,
    ),
    webManifestResponseGameCount: games.reduce(
      (count, game) =>
        count
        + has(game, (value) =>
          value.manifest.probes.some(
            (probe) => probe.classification === "web-manifest",
          )),
      0,
    ),
    serviceWorkerRegistrationGameCount: games.reduce(
      (count, game) =>
        count
        + has(
          game,
          (value) =>
            value.browserState.afterServiceWorkerUpdate.registrations.length > 0,
        ),
      0,
    ),
    serviceWorkerFetchHandlerEndpointGameCount: games.reduce(
      (count, game) =>
        count
        + has(game, (value) =>
          value.serviceWorker.probes.some(
            (probe) => probe.serviceWorkerFeatures?.fetch === true,
          )),
      0,
    ),
    serviceWorkerUpdateAttemptGameCount: games.reduce(
      (count, game) =>
        count + has(game, (value) => value.serviceWorker.update.attempted > 0),
      0,
    ),
    offlineReloadLoadedCount: games.reduce(
      (count, game) =>
        count + has(game, (value) => value.offlineReload.outcome === "loaded"),
      0,
    ),
    coldOfflineRestartLoadedCount: games.reduce(
      (count, game) =>
        count
        + has(
          game,
          (value) =>
            value.coldOfflineRestart.onlinePrime.secondLoad.outcome === "loaded"
            && value.coldOfflineRestart.offlineRestart.outcome === "loaded",
        ),
      0,
    ),
    localStorageGameCount: games.reduce(
      (count, game) =>
        count
        + has(
          game,
          (value) =>
            value.browserState.afterServiceWorkerUpdate.localStorageKeys.length
            > 0,
        ),
      0,
    ),
    cacheStorageGameCount: games.reduce(
      (count, game) =>
        count
        + has(
          game,
          (value) =>
            value.browserState.afterServiceWorkerUpdate.cacheNames.length > 0,
        ),
      0,
    ),
    indexedDbGameCount: games.reduce(
      (count, game) =>
        count
        + has(
          game,
          (value) =>
            value.browserState.afterServiceWorkerUpdate.indexedDbNames.length
            > 0,
        ),
      0,
    ),
    mutatingRequestGameCount: games.reduce(
      (count, game) =>
        count + has(game, (value) => value.online.mutatingRequestCount > 0),
      0,
    ),
    offlinePackageQualifiedCount: 0,
  };
}

export async function generateRemoteGameOfflineEvidence() {
  const chromePath = findChrome();
  assert.ok(chromePath, "installed Google Chrome or Chromium was not found");
  const requireFromConsoleLab = createRequire(resolve(appRoot, "package.json"));
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu"],
  });
  const observedAtUtc = new Date().toISOString();
  const games = [];
  try {
    for (const [index, game] of REMOTE_GAMES.entries()) {
      console.log(`[${index + 1}/${REMOTE_GAMES.length}] ${game.title}`);
      const observation = await observeGame(browser, game);
      const coldOfflineRestart = await observeColdOfflineRestart(
        chromium,
        chromePath,
        game,
      );
      games.push({
        ...observation,
        coldOfflineRestart,
      });
    }
    return {
      format: REMOTE_GAME_OFFLINE_EVIDENCE_FORMAT,
      evidenceDate: REMOTE_GAME_OFFLINE_EVIDENCE_DATE,
      observedAtUtc,
      evidenceClass:
        "fresh-profile-live-browser-observation-with-cold-restart",
      qualification: "observation-only-no-offline-package-qualified",
      environment: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        browserProduct: "Google Chrome",
        browserVersion: browser.version(),
        headless: true,
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
        onlineNavigationTimeoutMs: ONLINE_TIMEOUT_MS,
        offlineNavigationTimeoutMs: OFFLINE_TIMEOUT_MS,
        settleMs: SETTLE_MS,
      },
      scope: {
        catalogSnapshotDate: "2026-07-19",
        expectedGameCount: REMOTE_GAMES.length,
        lifecycle:
          "fresh anonymous context, online navigation, online reload, service-worker update request, endpoint GET probes, same-context offline reload; separate persistent profile, online navigation, online reload, clean close, same-profile browser restart offline before navigation, clean close, profile removal",
        interactionPolicy:
          "navigation-and-browser-lifecycle-only; no play, login, consent, permission, purchase, or form interaction",
        storedDataPolicy:
          "metadata, counts, origins, storage names, status, MIME, size, and SHA-256 only; no values, request paths, query strings, bodies, messages, or identifiers",
      },
      games,
      observationSha256: remoteGameObservationSha256(games),
      summary: buildRemoteGameOfflineSummary(games),
      limitations: [...REMOTE_GAME_OFFLINE_LIMITATIONS],
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const artifact = await generateRemoteGameOfflineEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${outputPath}; games=${artifact.summary.gameCount}; offline-reload=${artifact.summary.offlineReloadLoadedCount}; cold-offline-restart=${artifact.summary.coldOfflineRestartLoadedCount}; qualified=${artifact.summary.offlinePackageQualifiedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
