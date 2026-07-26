import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateTrackedRemoteGameOfflineEvidence } from "./validate-remote-game-offline-evidence.mjs";

export const REMOTE_GAME_INPUT_EVIDENCE_FORMAT =
  "vcg-remote-game-input-surface-observation/v2";
export const REMOTE_GAME_INPUT_EVIDENCE_DATE = "2026-07-24";
export const REMOTE_GAME_INPUT_LIMITATIONS = Object.freeze([
  "This is a fresh-context headless Windows Chrome observation of initial-route listener registration, DOM controls, and neutral synthetic Gamepad API polling. It is not physical-controller, remote, keyboard, pointer, touch, gameplay, focus, mapping, latency, reserved-action, accessibility, or target-Linux qualification.",
  "The injected standard-mapped gamepad reports only neutral axes and unpressed buttons. A poll or listener proves only that page code touched an API during the observation window; it does not prove that any control works or is required.",
  "No key, button, pointer, touch, form, permission, login, or game action was performed. Listeners and controls created only after start, play, consent, authentication, another route, or delayed asset loading can remain undiscovered.",
  "Framework delegation can register keyboard, click, pointer, input, or change listeners even when the title does not expose that input to players. Conversely, direct property handlers, WebAssembly, native browser behavior, and dynamically constructed paths can evade the bounded instrumentation.",
  "Every title remains input-unverified. A physical controller-only living-room session with console-owned Home/Back/Exit and recovery is still required.",
  "The artifact binds the current remote-offline v2 observation for exact catalog identity and offline-claim context. The neutral input observation does not reuse its persistent profiles or convert its one cold document load into input or offline-play evidence.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/console-lab");
const outputPath = resolve(
  root,
  "compliance/game-input/remote-game-input-surface-observation-v2.json",
);
const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_MS = 4_000;
export const INTERESTING_EVENTS = Object.freeze([
  "change",
  "click",
  "gamepadconnected",
  "gamepaddisconnected",
  "input",
  "keydown",
  "keypress",
  "keyup",
  "mousedown",
  "mousemove",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerup",
  "touchend",
  "touchmove",
  "touchstart",
  "wheel",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function remoteGameInputObservationSha256(games) {
  return sha256(new TextEncoder().encode(JSON.stringify(games)));
}

function findChrome() {
  const require = createRequire(import.meta.url);
  const { accessSync } = require("node:fs");
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
      accessSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
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

function navigationFailure(error) {
  const message = String(error?.message ?? error);
  const networkCode = message.match(/net::(ERR_[A-Z0-9_]+)/u)?.[1];
  if (networkCode) return `net::${networkCode}`;
  if (/timeout/iu.test(message)) return "timeout";
  return "navigation-error";
}

function neutralInputFixture() {
  const state = {
    listenerAdds: Object.create(null),
    gamepadPollCount: 0,
    pointerLockRequestCount: 0,
    fullscreenRequestCount: 0,
    originalGamepadApiAvailable:
      typeof navigator.getGamepads === "function",
    gamepadInstrumented: false,
    neutralGamepad: null,
  };
  Object.defineProperty(globalThis, "__vcgInputObservation", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: state,
  });

  const originalAddEventListener = EventTarget.prototype.addEventListener;
  Object.defineProperty(EventTarget.prototype, "addEventListener", {
    configurable: true,
    writable: true,
    value(type, listener, options) {
      if (typeof type === "string") {
        state.listenerAdds[type] = (state.listenerAdds[type] ?? 0) + 1;
      }
      return originalAddEventListener.call(this, type, listener, options);
    },
  });

  const buttons = Object.freeze(
    Array.from({ length: 17 }, () =>
      Object.freeze({ pressed: false, touched: false, value: 0 })),
  );
  const gamepad = Object.freeze({
    axes: Object.freeze([0, 0, 0, 0]),
    buttons,
    connected: true,
    id: "VCG neutral standard gamepad observation fixture",
    index: 0,
    mapping: "standard",
    timestamp: 0,
    vibrationActuator: null,
  });
  state.neutralGamepad = gamepad;
  try {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value() {
        state.gamepadPollCount += 1;
        return Object.freeze([gamepad, null, null, null]);
      },
    });
    state.gamepadInstrumented = true;
  } catch {
    // The result records whether instrumentation succeeded.
  }

  const originalPointerLock = Element.prototype.requestPointerLock;
  if (typeof originalPointerLock === "function") {
    try {
      Object.defineProperty(Element.prototype, "requestPointerLock", {
        configurable: true,
        writable: true,
        value(...args) {
          state.pointerLockRequestCount += 1;
          return originalPointerLock.apply(this, args);
        },
      });
    } catch {
      // Instrumentation remains bounded and fail-closed if wrapping is denied.
    }
  }
  const originalFullscreen = Element.prototype.requestFullscreen;
  if (typeof originalFullscreen === "function") {
    try {
      Object.defineProperty(Element.prototype, "requestFullscreen", {
        configurable: true,
        writable: true,
        value(...args) {
          state.fullscreenRequestCount += 1;
          return originalFullscreen.apply(this, args);
        },
      });
    } catch {
      // Instrumentation remains bounded and fail-closed if wrapping is denied.
    }
  }
}

async function collectRuntimeState(page) {
  return page.evaluate((interestingEvents) => {
    const state = globalThis.__vcgInputObservation;
    const listeners = Object.fromEntries(
      interestingEvents.map((event) => [
        event,
        Number(state?.listenerAdds?.[event] ?? 0),
      ]),
    );
    const handler = (name) =>
      typeof globalThis[name] === "function"
      || typeof document[name] === "function"
      || typeof document.body?.[name] === "function";
    const focusableSelector = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[contenteditable='true']",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    return {
      accessible: true,
      title: document.title.slice(0, 256),
      readyState: document.readyState,
      listenerAdds: listeners,
      handlerProperties: {
        onkeydown: handler("onkeydown"),
        onkeypress: handler("onkeypress"),
        onkeyup: handler("onkeyup"),
        onmousedown: handler("onmousedown"),
        onmousemove: handler("onmousemove"),
        onmouseup: handler("onmouseup"),
        onpointerdown: handler("onpointerdown"),
        onpointermove: handler("onpointermove"),
        onpointerup: handler("onpointerup"),
        ontouchend: handler("ontouchend"),
        ontouchmove: handler("ontouchmove"),
        ontouchstart: handler("ontouchstart"),
      },
      gamepad: {
        originalApiAvailable: Boolean(state?.originalGamepadApiAvailable),
        instrumented: Boolean(state?.gamepadInstrumented),
        pollCount: Number(state?.gamepadPollCount ?? 0),
      },
      requests: {
        pointerLock: Number(state?.pointerLockRequestCount ?? 0),
        fullscreen: Number(state?.fullscreenRequestCount ?? 0),
      },
      dom: {
        canvas: document.querySelectorAll("canvas").length,
        button: document.querySelectorAll("button").length,
        anchor: document.querySelectorAll("a[href]").length,
        input: document.querySelectorAll("input").length,
        select: document.querySelectorAll("select").length,
        textarea: document.querySelectorAll("textarea").length,
        contentEditable: document.querySelectorAll(
          "[contenteditable='true']",
        ).length,
        focusable: document.querySelectorAll(focusableSelector).length,
      },
    };
  }, INTERESTING_EVENTS);
}

function inaccessibleRuntimeState() {
  return {
    accessible: false,
    title: null,
    readyState: null,
    listenerAdds: Object.fromEntries(
      INTERESTING_EVENTS.map((event) => [event, 0]),
    ),
    handlerProperties: {
      onkeydown: false,
      onkeypress: false,
      onkeyup: false,
      onmousedown: false,
      onmousemove: false,
      onmouseup: false,
      onpointerdown: false,
      onpointermove: false,
      onpointerup: false,
      ontouchend: false,
      ontouchmove: false,
      ontouchstart: false,
    },
    gamepad: {
      originalApiAvailable: false,
      instrumented: false,
      pollCount: 0,
    },
    requests: {
      pointerLock: 0,
      fullscreen: 0,
    },
    dom: {
      canvas: 0,
      button: 0,
      anchor: 0,
      input: 0,
      select: 0,
      textarea: 0,
      contentEditable: 0,
      focusable: 0,
    },
  };
}

function eventSignal(runtime, names, handlerNames = []) {
  return (
    names.some((name) => runtime.listenerAdds[name] > 0)
    || handlerNames.some((name) => runtime.handlerProperties[name])
  );
}

export function buildRemoteGameInputFindings(runtime) {
  return {
    gamepadSignal:
      runtime.gamepad.pollCount > 0
      || runtime.listenerAdds.gamepadconnected > 0
      || runtime.listenerAdds.gamepaddisconnected > 0,
    keyboardSignal: eventSignal(
      runtime,
      ["keydown", "keypress", "keyup"],
      ["onkeydown", "onkeypress", "onkeyup"],
    ),
    pointerSignal: eventSignal(
      runtime,
      [
        "mousedown",
        "mousemove",
        "mouseup",
        "pointerdown",
        "pointermove",
        "pointerup",
        "wheel",
      ],
      [
        "onmousedown",
        "onmousemove",
        "onmouseup",
        "onpointerdown",
        "onpointermove",
        "onpointerup",
      ],
    ),
    touchSignal: eventSignal(
      runtime,
      ["touchend", "touchmove", "touchstart"],
      ["ontouchend", "ontouchmove", "ontouchstart"],
    ),
    textEntrySurfaceSignal:
      runtime.dom.input > 0
      || runtime.dom.textarea > 0
      || runtime.dom.contentEditable > 0,
    inputQualification: "none",
  };
}

async function observeGame(browser, game) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    serviceWorkers: "allow",
  });
  await context.addInitScript(neutralInputFixture);
  const page = await context.newPage();
  let requestCount = 0;
  let mutatingRequestCount = 0;
  let requestFailureCount = 0;
  let consoleErrorCount = 0;
  let pageErrorCount = 0;
  page.on("request", (request) => {
    requestCount += 1;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutatingRequestCount += 1;
    }
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

  let navigation = { outcome: "loaded", error: null };
  try {
    await page.goto(game.entrypoint, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForTimeout(SETTLE_MS);
  } catch (error) {
    navigation = { outcome: "failed", error: navigationFailure(error) };
  }
  let dispatchedNeutralGamepadEvent = false;
  try {
    dispatchedNeutralGamepadEvent = await page.evaluate(() => {
      const gamepad = globalThis.__vcgInputObservation?.neutralGamepad;
      if (!gamepad) return false;
      const event = new Event("gamepadconnected");
      Object.defineProperty(event, "gamepad", {
        configurable: false,
        enumerable: true,
        value: gamepad,
      });
      return globalThis.dispatchEvent(event);
    });
    await page.waitForTimeout(250);
  } catch {
    dispatchedNeutralGamepadEvent = false;
  }
  let runtime;
  try {
    runtime = await collectRuntimeState(page);
  } catch {
    runtime = inaccessibleRuntimeState();
  }
  const result = {
    id: game.id,
    title: game.title,
    entrypoint: game.entrypoint,
    finalUrl: canonicalUrl(page.url()) ?? game.entrypoint,
    navigation,
    observation: {
      dispatchedNeutralGamepadEvent,
      requestCount,
      mutatingRequestCount,
      requestFailureCount,
      consoleErrorCount,
      pageErrorCount,
      runtime,
    },
    findings: buildRemoteGameInputFindings(runtime),
  };
  await context.close();
  return result;
}

export function buildRemoteGameInputSummary(games) {
  const count = (predicate) =>
    games.reduce((total, game) => total + (predicate(game) ? 1 : 0), 0);
  return {
    gameCount: games.length,
    navigationLoadedCount: count(
      (game) => game.navigation.outcome === "loaded",
    ),
    gamepadSignalCount: count((game) => game.findings.gamepadSignal),
    keyboardSignalCount: count((game) => game.findings.keyboardSignal),
    pointerSignalCount: count((game) => game.findings.pointerSignal),
    touchSignalCount: count((game) => game.findings.touchSignal),
    textEntrySurfaceSignalCount: count(
      (game) => game.findings.textEntrySurfaceSignal,
    ),
    pointerLockRequestGameCount: count(
      (game) => game.observation.runtime.requests.pointerLock > 0,
    ),
    fullscreenRequestGameCount: count(
      (game) => game.observation.runtime.requests.fullscreen > 0,
    ),
    mutatingRequestGameCount: count(
      (game) => game.observation.mutatingRequestCount > 0,
    ),
    inputQualifiedCount: 0,
  };
}

export async function generateRemoteGameInputSurfaceEvidence() {
  const offline = await validateTrackedRemoteGameOfflineEvidence();
  const chromePath = findChrome();
  assert.ok(chromePath, "installed Google Chrome or Chromium was not found");
  const requireFromConsoleLab = createRequire(resolve(appRoot, "package.json"));
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu"],
  });
  const games = [];
  try {
    for (const [index, game] of offline.games.entries()) {
      console.log(`[${index + 1}/${offline.games.length}] ${game.title}`);
      games.push(await observeGame(browser, game));
    }
    return {
      format: REMOTE_GAME_INPUT_EVIDENCE_FORMAT,
      evidenceDate: REMOTE_GAME_INPUT_EVIDENCE_DATE,
      observedAtUtc: new Date().toISOString(),
      evidenceClass: "neutral-synthetic-input-api-surface-observation",
      qualification: "zero-input-qualifications",
      environment: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        browserProduct: "Google Chrome",
        browserVersion: browser.version(),
        headless: true,
        viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
        navigationTimeoutMs: NAVIGATION_TIMEOUT_MS,
        settleMs: SETTLE_MS,
      },
      provenance: {
        remoteOfflineFormat: offline.format,
        remoteOfflineObservationSha256: offline.observationSha256,
      },
      scope: {
        catalogSnapshotDate: "2026-07-19",
        expectedGameCount: offline.games.length,
        syntheticGamepad:
          "one standard-mapped connected fixture with four neutral axes and seventeen unpressed buttons",
        interactionPolicy:
          "dispatch one neutral gamepadconnected event only; no button, key, pointer, touch, form, permission, login, or game action",
        storedData:
          "listener/control/request/error counts, boolean signals, titles, and query-free URLs only; no values, bodies, messages, identifiers, or user data",
      },
      games,
      observationSha256: remoteGameInputObservationSha256(games),
      summary: buildRemoteGameInputSummary(games),
      limitations: [...REMOTE_GAME_INPUT_LIMITATIONS],
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const artifact = await generateRemoteGameInputSurfaceEvidence();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote ${outputPath}; games=${artifact.summary.gameCount}; gamepad-signals=${artifact.summary.gamepadSignalCount}; input-qualified=${artifact.summary.inputQualifiedCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
