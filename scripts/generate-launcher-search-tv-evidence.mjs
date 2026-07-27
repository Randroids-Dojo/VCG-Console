import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GODOT_EXPORT_BROWSER_PRODUCT,
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";
import {
  countOverlaps,
  findChrome,
  insideSafeArea,
  installFrozenLauncherClock,
  LAUNCHER_TV_BROWSER_CLOCK,
  measureElements,
  normalizedSha256,
  rounded,
  sha256,
  sourceTreeCommitment,
  startProductionPreview,
} from "./generate-launcher-tv-conformance-evidence.mjs";
import {
  TV_CONFORMANCE_EVIDENCE_DATE,
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";

export const LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT =
  "vcg-launcher-search-tv-conformance-evidence/v1";
export const LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY =
  "One Windows x64 installed-Chrome production-build desk run proves that the explicitly marked five-result Motion query, fixed no-result query with local recovery actions, current 20-destination empty query, exact one-result Obstacle query, exact one-result VibeCoded Museum query in ready/blocked-preview and offline-failure states, exact one-result 2048 unavailable-package query, and exact one-result destructive Unassigned progress query satisfy the candidate five-percent CSS safe inset, 24 CSS-pixel visible critical-text floor, 48 CSS-pixel action floor, non-overlap, bounded overlay overflow, and exact interaction traces at 1280x720, 1920x1080, and 3840x2160 with devicePixelRatio 1. The no-result state proves ArrowDown reaches explicit Clear search, clearing restores the current 20-result empty query with input focus, and the fixed Motion category shortcut produces five local results with the first result focused before Back restores the Search opener. The empty-query state measures internal overflow and scroll-to-last focus at 720p/1080p and exact no-overflow density at 4K. At all three resolutions it keyboard-activates the local Profiles destination, offline local-web Obstacle launch surface, remote-web Museum supervisor, unavailable 2048 retro-package supervisor, and Unassigned progress route. The remote states prove the fixed origin disclosure, contained blocked-popup denial, offline failure, Retry availability, and Back focus recovery without opening or qualifying remote content. The unavailable state proves signed-inventory refusal, a closed diagnostic code, Retry visibility, and Back focus recovery without contacting a package runtime. The destructive state proves Cancel receives initial confirmation focus, controller Back denies the exact in-memory Obstacle deletion, retains the entry, restores the destructive action focus, and returns to focused Profiles navigation without a filesystem or native mutation. It does not select the final empty-query or no-result product policy, qualify arbitrary localization or query text, add fuzzy or network suggestions, execute or qualify destructive storage, completed gameplay, remote content, a signed package, every launcher state, a physical television or controller, reserved Home action, native host, target Linux compositor, output mode, overscan, seating-distance legibility, audio, animation smoothness, or frame pacing.";
export const LAUNCHER_SEARCH_TV_LIMITATIONS = Object.freeze([
  "Only eight exact Search states were measured: the five-result lowercase Motion query, one fixed no-result query with Clear/Motion recovery, the current 20-destination empty query, the lowercase one-result Obstacle query, the exact one-result VibeCoded Museum query in ready/blocked-preview and offline-failure modes, the exact one-result 2048 unavailable-package query, and the exact one-result destructive Unassigned progress query. Clear currently returns to the measured 20-result empty query, and the recovery categories are fixed local substring queries, not final density, taxonomy, ranking, spelling, or localization policy. Arbitrary text, localization, voice input, fuzzy/network suggestions, every other catalog revision, and every other overlay remain outside this artifact.",
  "The activated results were limited to the local Profiles shell destination, built-in local-web Obstacle launch surface, remote-web Museum supervisor, unavailable 2048 retro-package supervisor, and synthetic Unassigned progress route, using programmatic focus followed by keyboard Enter and bounded Back recovery. The remote states expose only the fixed origin, fail closed while offline, and deliberately force the separate browser preview to be blocked; no remote page opens and no remote title, gameplay, reachability, containment, controller behavior, or catalog compatibility is qualified. The unavailable state proves only launcher refusal of an absent signed release; no package or native host is qualified. The destructive state cancels one in-memory sample deletion and does not qualify a native save broker, filesystem mutation, persistence, power-loss behavior, or permanent-loss semantics.",
  "The three resolutions used one Windows x64 development host and headless installed Chrome at devicePixelRatio 1, not physical televisions, target Linux, EDID output modes, compositor scaling, HDR, or overscan.",
  "Keyboard input, ArrowDown, Tab wrapping, Escape, opener restoration, programmatic last-result focus, and keyboard Enter were exercised. No physical controller, hot-plug, reserved Home action, pointer lock, fullscreen, compositor focus change, or native recovery authority was tested.",
  "The candidate 5% / 24 CSS px / 48 CSS px values remain provisional under Q-242 and Q-243; passing them is not seating-distance comprehension, accessibility, localization, or catalog-wide compatibility.",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/console-lab");
const outputRoot = resolve(root, "benchmarks/tv-conformance");
const artifactPath = resolve(
  outputRoot,
  "windows-x64-chrome-150-launcher-search-tv-conformance-v1.json",
);
const representativeEvidenceRelativePath =
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json";
const provenancePaths = Object.freeze({
  launcherPath: "apps/console-lab/src/launcher/Launcher.svelte",
  searchPath: "apps/console-lab/src/launcher/SearchOverlay.svelte",
  unassignedViewPath:
    "apps/console-lab/src/launcher/UnassignedProgressView.svelte",
  unassignedControllerPath:
    "apps/console-lab/src/launcher/unassigned-progress.ts",
  stylePath: "apps/console-lab/src/styles.css",
  entryPath: "apps/console-lab/src/main.ts",
  documentPath: "apps/console-lab/index.html",
  viteConfigPath: "apps/console-lab/vite.config.ts",
  browserTestPath: "apps/console-lab/tests/tv-conformance.spec.ts",
  representativeEvidencePath: representativeEvidenceRelativePath,
  commonGeneratorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  generatorPath:
    "scripts/generate-launcher-search-tv-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-search-tv-evidence.mjs",
});

const SEARCH_STATES = Object.freeze([
  {
    id: "motion-results",
    query: "motion",
    resultCount: 5,
    criticalTextCount: 13,
    actionTargetCount: 6,
    measurementMode: "all-marked",
    scrollingExpectedResolutionIds: [],
    activation: null,
    interactionTrace: [
      "universal-search",
      "result-first",
      "result-last",
      "universal-search",
      "search-trigger",
    ],
  },
  {
    id: "no-results",
    query: "no-such-vcg-destination",
    resultCount: 0,
    criticalTextCount: 9,
    actionTargetCount: 5,
    measurementMode: "all-marked",
    scrollingExpectedResolutionIds: [],
    activation: null,
    recoveryExpectation: {
      clearActionLabel: "Clear search",
      clearQuery: "",
      clearResultCount: 20,
      categoryActionLabel: "Motion",
      categoryQuery: "motion",
      categoryResultCount: 5,
      categoryFirstResultTitle: "Obstacle",
      backRecoveryFocus: "search-trigger",
    },
    interactionTrace: [
      "universal-search",
      "clear-search-action",
      "empty-query-restored",
      "universal-search",
      "motion-category-action",
      "motion-result-first",
      "search-trigger",
    ],
  },
  {
    id: "empty-query-scroll-activation",
    query: "",
    resultCount: 20,
    criticalTextCount: 43,
    actionTargetCount: 21,
    measurementMode: "fully-visible-marked",
    scrollingExpectedResolutionIds: ["720p", "1080p"],
    activation: {
      resultTitle: "Profiles",
      method: "keyboard-enter",
      outcomeKind: "launcher-view",
      outcomeLabel: "Who is playing?",
      expectedAdapter: null,
      expectedNetworkOnline: true,
      remoteWebExpectation: null,
      unavailableExpectation: null,
      destructiveExpectation: null,
      backRecoveryFocus: "launcher-home-navigation",
    },
    interactionTrace: [
      "universal-search",
      "result-last",
      "profiles-result",
      "profiles-destination",
      "launcher-home-navigation",
    ],
  },
  {
    id: "offline-package-activation",
    query: "obstacle",
    resultCount: 1,
    criticalTextCount: 5,
    actionTargetCount: 2,
    measurementMode: "all-marked",
    scrollingExpectedResolutionIds: [],
    activation: {
      resultTitle: "Obstacle",
      method: "keyboard-enter",
      outcomeKind: "launch-dialog",
      outcomeLabel: "Obstacle",
      expectedAdapter: "local-web",
      expectedNetworkOnline: true,
      remoteWebExpectation: null,
      unavailableExpectation: null,
      destructiveExpectation: null,
      backRecoveryFocus: "search-trigger",
    },
    interactionTrace: [
      "universal-search",
      "obstacle-result",
      "obstacle-launch-dialog",
      "search-trigger",
    ],
  },
  {
    id: "remote-web-ready-denial",
    query: "vibecoded.games",
    resultCount: 1,
    criticalTextCount: 5,
    actionTargetCount: 2,
    measurementMode: "all-marked",
    scrollingExpectedResolutionIds: [],
    activation: {
      resultTitle: "VibeCoded Museum",
      method: "keyboard-enter",
      outcomeKind: "launch-dialog",
      outcomeLabel: "VibeCoded Museum",
      expectedAdapter: "remote-web",
      expectedNetworkOnline: true,
      remoteWebExpectation: {
        statusLabel: "READY",
        originLabel: "VIBECODED.GAMES / ONLINE",
        actionLabel: "Open unsupervised preview",
        failureMessage: null,
        retryAvailable: false,
        denial: {
          kind: "browser-popup-blocked",
          message:
            "The browser blocked the separate preview tab. Try again.",
          launchRetained: true,
        },
      },
      unavailableExpectation: null,
      destructiveExpectation: null,
      backRecoveryFocus: "search-trigger",
    },
    interactionTrace: [
      "universal-search",
      "museum-result",
      "remote-web-ready-dialog",
      "fixed-origin-disclosure",
      "blocked-preview-denial",
      "search-trigger",
    ],
  },
  {
    id: "remote-web-offline-failure",
    query: "vibecoded.games",
    resultCount: 1,
    criticalTextCount: 5,
    actionTargetCount: 2,
    measurementMode: "all-marked",
    scrollingExpectedResolutionIds: [],
    activation: {
      resultTitle: "VibeCoded Museum",
      method: "keyboard-enter",
      outcomeKind: "launch-dialog",
      outcomeLabel: "VibeCoded Museum",
      expectedAdapter: "remote-web",
      expectedNetworkOnline: false,
      remoteWebExpectation: {
        statusLabel: "OFFLINE",
        originLabel: "VIBECODED.GAMES / ONLINE",
        actionLabel: "Open unsupervised preview",
        failureMessage: "No network connection",
        retryAvailable: true,
        denial: null,
      },
      unavailableExpectation: null,
      destructiveExpectation: null,
      backRecoveryFocus: "search-trigger",
    },
    interactionTrace: [
      "universal-search",
      "museum-result",
      "remote-web-offline-failure",
      "retry-action-visible",
      "search-trigger",
    ],
  },
  {
    id: "unavailable-package-denial",
    query: "2048",
    resultCount: 1,
    criticalTextCount: 5,
    actionTargetCount: 2,
    measurementMode: "all-marked",
    scrollingExpectedResolutionIds: [],
    activation: {
      resultTitle: "2048",
      method: "keyboard-enter",
      outcomeKind: "launch-dialog",
      outcomeLabel: "2048",
      expectedAdapter: "retro",
      expectedNetworkOnline: true,
      remoteWebExpectation: null,
      unavailableExpectation: {
        statusLabel: "NOT AVAILABLE",
        detail:
          "The selected release is not present in the current signed package inventory",
        diagnosticCode: "PACKAGE_RELEASE_MISMATCH",
        retryAvailable: true,
      },
      destructiveExpectation: null,
      backRecoveryFocus: "search-trigger",
    },
    interactionTrace: [
      "universal-search",
      "retro-2048-result",
      "unavailable-package-denial",
      "package-release-mismatch-diagnostic",
      "retry-action-visible",
      "search-trigger",
    ],
  },
  {
    id: "destructive-settings-denial",
    query: "delete local progress",
    resultCount: 1,
    criticalTextCount: 5,
    actionTargetCount: 2,
    measurementMode: "all-marked",
    scrollingExpectedResolutionIds: [],
    activation: {
      resultTitle: "Unassigned progress",
      method: "keyboard-enter",
      outcomeKind: "launcher-view",
      outcomeLabel: "Progress without a profile.",
      expectedAdapter: null,
      expectedNetworkOnline: true,
      remoteWebExpectation: null,
      unavailableExpectation: null,
      destructiveExpectation: {
        selectedEntryTitle: "Obstacle",
        actionLabel: "Delete permanently",
        dialogLabel: "Delete Obstacle · Checkpoint 12?",
        warning:
          "This permanently removes the selected console-managed save. There is no backup, export, cloud copy, migration, or undo.",
        prototypeBoundary: "Prototype only · no filesystem mutation",
        safeDefaultLabel: "Cancel",
        safeDefaultInitiallyFocused: true,
        denialKind: "controller-back-cancelled",
        confirmationDismissed: true,
        entryRetainedAfterDenial: true,
        denialRecoveryFocus: "delete-unassigned-progress",
      },
      backRecoveryFocus: "profiles-navigation",
    },
    interactionTrace: [
      "universal-search",
      "unassigned-progress-result",
      "unassigned-progress-view",
      "obstacle-delete-action",
      "safe-cancel-default",
      "controller-back-denial",
      "obstacle-entry-retained",
      "delete-action-focus-restored",
      "profiles-navigation",
    ],
  },
]);

async function provenance() {
  const entries = await Promise.all(
    Object.entries(provenancePaths).map(async ([key, path]) => [
      key,
      path,
      normalizedSha256(await readFile(resolve(root, path))),
    ]),
  );
  return {
    ...Object.fromEntries(
      entries.flatMap(([key, path, digest]) => [
        [key, path],
        [`${key}Sha256`, digest],
      ]),
    ),
    productionSourceTree: await sourceTreeCommitment(),
  };
}

function safeAreaFor(resolution) {
  return {
    left: resolution.width * 0.05,
    top: resolution.height * 0.05,
    right: resolution.width * 0.95,
    bottom: resolution.height * 0.95,
  };
}

async function measureCriticalText(page, state) {
  if (state.measurementMode === "all-marked") {
    return measureElements(
      page,
      ".search-overlay [data-tv-critical-text]:visible",
    );
  }
  assert.equal(state.measurementMode, "fully-visible-marked");
  return page
    .locator(".search-overlay [data-tv-critical-text]:visible")
    .evaluateAll((elements) => {
      const results = document.querySelector("#search-results");
      if (!(results instanceof HTMLElement)) {
        throw new Error("Search results scroller is unavailable");
      }
      const clip = results.getBoundingClientRect();
      return elements
        .filter((element) => {
          if (!element.closest("#search-results")) return true;
          const bounds = element.getBoundingClientRect();
          return (
            bounds.top >= clip.top - 0.5
            && bounds.bottom <= clip.bottom + 0.5
          );
        })
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            label:
              element.getAttribute("aria-label")
              ?? element.textContent?.trim().replace(/\s+/gu, " ")
              ?? element.tagName,
            left: Number(bounds.left.toFixed(3)),
            top: Number(bounds.top.toFixed(3)),
            right: Number(bounds.right.toFixed(3)),
            bottom: Number(bounds.bottom.toFixed(3)),
            width: Number(bounds.width.toFixed(3)),
            height: Number(bounds.height.toFixed(3)),
            fontSize: Number(
              Number.parseFloat(getComputedStyle(element).fontSize).toFixed(3),
            ),
          };
        });
    });
}

async function measureResultsScroll(page) {
  return page.locator("#search-results").evaluate((element) => ({
    clientHeightCssPx: element.clientHeight,
    scrollHeightCssPx: element.scrollHeight,
    scrollTopCssPx: Number(element.scrollTop.toFixed(3)),
    maximumScrollTopCssPx: Number(
      (element.scrollHeight - element.clientHeight).toFixed(3),
    ),
  }));
}

async function prepareScrollingState(page, state, resolution) {
  const initial = await measureResultsScroll(page);
  const scrollingExpected =
    state.scrollingExpectedResolutionIds.includes(resolution.id);
  if (state.id !== "empty-query-scroll-activation") {
    return {
      clientHeightCssPx: initial.clientHeightCssPx,
      scrollHeightCssPx: initial.scrollHeightCssPx,
      initialScrollTopCssPx: initial.scrollTopCssPx,
      finalScrollTopCssPx: initial.scrollTopCssPx,
      maximumScrollTopCssPx: initial.maximumScrollTopCssPx,
      lastResultInsideViewportAfterFocus: null,
    };
  }
  assert.equal(initial.scrollTopCssPx, 0);
  if (scrollingExpected) {
    assert.ok(initial.scrollHeightCssPx > initial.clientHeightCssPx);
  } else {
    assert.equal(initial.scrollHeightCssPx, initial.clientHeightCssPx);
  }
  const results = page.locator("#search-results button");
  await results.last().focus();
  assert.equal(
    await results.last().evaluate((element) => element === document.activeElement),
    true,
  );
  const final = await measureResultsScroll(page);
  if (scrollingExpected) {
    assert.ok(final.scrollTopCssPx > 0);
  } else {
    assert.equal(final.scrollTopCssPx, 0);
  }
  const lastResultInsideViewportAfterFocus = await page.evaluate(() => {
    const scroller = document.querySelector("#search-results");
    const last = scroller?.querySelector("button:last-of-type");
    if (!(scroller instanceof HTMLElement) || !(last instanceof HTMLElement)) {
      throw new Error("Search result scroll target is unavailable");
    }
    const clip = scroller.getBoundingClientRect();
    const bounds = last.getBoundingClientRect();
    return (
      bounds.top >= clip.top - 0.5
      && bounds.bottom <= clip.bottom + 0.5
    );
  });
  assert.equal(lastResultInsideViewportAfterFocus, true);
  return {
    clientHeightCssPx: final.clientHeightCssPx,
    scrollHeightCssPx: final.scrollHeightCssPx,
    initialScrollTopCssPx: initial.scrollTopCssPx,
    finalScrollTopCssPx: final.scrollTopCssPx,
    maximumScrollTopCssPx: final.maximumScrollTopCssPx,
    lastResultInsideViewportAfterFocus,
  };
}

async function exerciseInteraction(page, state) {
  const input = page.locator("#universal-search");
  const results = page.locator("#search-results button");
  if (state.id === "empty-query-scroll-activation") {
    assert.equal(
      await results.last().evaluate((element) => element === document.activeElement),
      true,
    );
    const profiles = page.getByRole("button", {
      name: /Profiles Players on this console/u,
    });
    await profiles.focus();
    assert.equal(
      await profiles.evaluate((element) => element === document.activeElement),
      true,
    );
    const networkOnlineAtActivation = await page.evaluate(
      () => navigator.onLine,
    );
    assert.equal(
      networkOnlineAtActivation,
      state.activation.expectedNetworkOnline,
    );
    await page.keyboard.press("Enter");
    const destination = page.getByRole("heading", {
      name: state.activation.outcomeLabel,
    });
    await destination.waitFor();
    const searchOverlayHidden = await page.locator("#search-overlay").isHidden();
    const outcomeVisible = await destination.isVisible();
    assert.equal(searchOverlayHidden, true);
    assert.equal(outcomeVisible, true);
    await page.keyboard.press("Escape");
    const home = page.getByRole("heading", { name: /Good evening/u });
    await home.waitFor();
    const homeNavigation = page.locator(
      '.launcher-nav [data-view-target="home"]',
    );
    assert.equal(
      await homeNavigation.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    const activation = {
      resultTitle: state.activation.resultTitle,
      method: state.activation.method,
      searchOverlayHidden,
      outcomeKind: state.activation.outcomeKind,
      outcomeLabel: state.activation.outcomeLabel,
      outcomeVisible,
      adapter: state.activation.expectedAdapter,
      networkOnlineAtActivation,
      remoteWebEvidence: null,
      unavailableEvidence: null,
      destructiveEvidence: null,
      backRecoveryVerified: true,
      backRecoveryFocus: state.activation.backRecoveryFocus,
    };
    return {
      interactionTrace: [
        "universal-search",
        "result-last",
        "profiles-result",
        "profiles-destination",
        "launcher-home-navigation",
      ],
      activation,
      recovery: null,
    };
  }
  assert.equal(
    await input.evaluate((element) => element === document.activeElement),
    true,
  );
  if (state.id === "offline-package-activation") {
    const obstacle = page.getByRole("button", {
      name: /Motion Obstacle Motion game/u,
    });
    await obstacle.focus();
    assert.equal(
      await obstacle.evaluate((element) => element === document.activeElement),
      true,
    );
    const networkOnlineAtActivation = await page.evaluate(
      () => navigator.onLine,
    );
    assert.equal(
      networkOnlineAtActivation,
      state.activation.expectedNetworkOnline,
    );
    await page.keyboard.press("Enter");
    const launch = page.getByRole("dialog", {
      name: state.activation.outcomeLabel,
    });
    await launch.waitFor();
    const searchOverlayHidden = await page.locator("#search-overlay").isHidden();
    const outcomeVisible = await launch.isVisible();
    const adapter = await launch.getAttribute("data-launch-adapter");
    assert.equal(searchOverlayHidden, true);
    assert.equal(outcomeVisible, true);
    assert.equal(adapter, state.activation.expectedAdapter);
    await page.keyboard.press("Escape");
    await launch.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      state.activation.backRecoveryFocus,
    );
    return {
      interactionTrace: [
        "universal-search",
        "obstacle-result",
        "obstacle-launch-dialog",
        "search-trigger",
      ],
      activation: {
        resultTitle: state.activation.resultTitle,
        method: state.activation.method,
        searchOverlayHidden,
        outcomeKind: state.activation.outcomeKind,
        outcomeLabel: state.activation.outcomeLabel,
        outcomeVisible,
        adapter,
        networkOnlineAtActivation,
        remoteWebEvidence: null,
        unavailableEvidence: null,
        destructiveEvidence: null,
        backRecoveryVerified: true,
        backRecoveryFocus: state.activation.backRecoveryFocus,
      },
      recovery: null,
    };
  }
  if (
    state.id === "remote-web-ready-denial"
    || state.id === "remote-web-offline-failure"
  ) {
    const museum = page.getByRole("button", {
      name: /Online VibeCoded Museum vibecoded\.games/u,
    });
    await museum.focus();
    assert.equal(
      await museum.evaluate((element) => element === document.activeElement),
      true,
    );
    if (!state.activation.expectedNetworkOnline) {
      await page.context().setOffline(true);
    }
    const networkOnlineAtActivation = await page.evaluate(
      () => navigator.onLine,
    );
    assert.equal(
      networkOnlineAtActivation,
      state.activation.expectedNetworkOnline,
    );
    await page.keyboard.press("Enter");
    const launch = page.getByRole("dialog", {
      name: state.activation.outcomeLabel,
    });
    await launch.waitFor();
    const searchOverlayHidden = await page.locator("#search-overlay").isHidden();
    const outcomeVisible = await launch.isVisible();
    const adapter = await launch.getAttribute("data-launch-adapter");
    assert.equal(searchOverlayHidden, true);
    assert.equal(outcomeVisible, true);
    assert.equal(adapter, state.activation.expectedAdapter);

    const expected = state.activation.remoteWebExpectation;
    const statusVisible = await launch
      .getByText(expected.statusLabel, { exact: true })
      .isVisible();
    const originVisible = await launch
      .getByText(expected.originLabel, { exact: true })
      .isVisible();
    const actionVisible = await launch
      .getByRole("button", { name: expected.actionLabel, exact: true })
      .isVisible();
    const retryAvailable = await launch
      .getByRole("button", { name: "Retry", exact: true })
      .isVisible();
    assert.equal(statusVisible, true);
    assert.equal(originVisible, true);
    assert.equal(actionVisible, true);
    assert.equal(retryAvailable, expected.retryAvailable);
    let failureMessageVisible = null;
    if (expected.failureMessage !== null) {
      failureMessageVisible = await launch
        .getByText(expected.failureMessage, { exact: true })
        .isVisible();
      assert.equal(failureMessageVisible, true);
    }
    let denialObserved = false;
    let denialMessage = null;
    let launchRetainedAfterDenial = null;
    if (expected.denial !== null) {
      await launch
        .getByRole("button", { name: expected.actionLabel, exact: true })
        .click();
      denialMessage = expected.denial.message;
      denialObserved = await page
        .getByText(denialMessage, { exact: true })
        .isVisible();
      launchRetainedAfterDenial = await launch.isVisible();
      assert.equal(denialObserved, true);
      assert.equal(
        launchRetainedAfterDenial,
        expected.denial.launchRetained,
      );
    }
    await page.keyboard.press("Escape");
    await launch.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      state.activation.backRecoveryFocus,
    );
    return {
      interactionTrace: state.interactionTrace,
      activation: {
        resultTitle: state.activation.resultTitle,
        method: state.activation.method,
        searchOverlayHidden,
        outcomeKind: state.activation.outcomeKind,
        outcomeLabel: state.activation.outcomeLabel,
        outcomeVisible,
        adapter,
        networkOnlineAtActivation,
        remoteWebEvidence: {
          statusLabel: expected.statusLabel,
          statusVisible,
          originLabel: expected.originLabel,
          originVisible,
          actionLabel: expected.actionLabel,
          actionVisible,
          failureMessage: expected.failureMessage,
          failureMessageVisible,
          retryAvailable,
          denialKind: expected.denial?.kind ?? null,
          denialObserved,
          denialMessage,
          launchRetainedAfterDenial,
        },
        unavailableEvidence: null,
        destructiveEvidence: null,
        backRecoveryVerified: true,
        backRecoveryFocus: state.activation.backRecoveryFocus,
      },
      recovery: null,
    };
  }
  if (state.id === "unavailable-package-denial") {
    const candidate = page.getByRole("button", {
      name: /Retro 2048 Retro qualification candidate/u,
    });
    await candidate.focus();
    assert.equal(
      await candidate.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    const networkOnlineAtActivation = await page.evaluate(
      () => navigator.onLine,
    );
    assert.equal(
      networkOnlineAtActivation,
      state.activation.expectedNetworkOnline,
    );
    await page.keyboard.press("Enter");
    const launch = page.getByRole("dialog", {
      name: state.activation.outcomeLabel,
    });
    await launch.waitFor();
    const searchOverlayHidden = await page.locator("#search-overlay").isHidden();
    const outcomeVisible = await launch.isVisible();
    const adapter = await launch.getAttribute("data-launch-adapter");
    assert.equal(searchOverlayHidden, true);
    assert.equal(outcomeVisible, true);
    assert.equal(adapter, state.activation.expectedAdapter);

    const expected = state.activation.unavailableExpectation;
    const statusVisible = await launch
      .getByText(expected.statusLabel, { exact: true })
      .isVisible();
    const detailVisible = await launch
      .getByText(expected.detail, { exact: true })
      .isVisible();
    assert.equal(statusVisible, true);
    assert.equal(detailVisible, true);
    await launch.getByRole("button", { name: "Details" }).click();
    const diagnosticVisible = await launch
      .getByText(expected.diagnosticCode, { exact: true })
      .isVisible();
    const retryAvailable = await launch
      .getByRole("button", { name: "Retry", exact: true })
      .isVisible();
    assert.equal(diagnosticVisible, true);
    assert.equal(retryAvailable, expected.retryAvailable);
    await page.keyboard.press("Escape");
    await launch.waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      state.activation.backRecoveryFocus,
    );
    return {
      interactionTrace: state.interactionTrace,
      activation: {
        resultTitle: state.activation.resultTitle,
        method: state.activation.method,
        searchOverlayHidden,
        outcomeKind: state.activation.outcomeKind,
        outcomeLabel: state.activation.outcomeLabel,
        outcomeVisible,
        adapter,
        networkOnlineAtActivation,
        remoteWebEvidence: null,
        unavailableEvidence: {
          statusLabel: expected.statusLabel,
          statusVisible,
          detail: expected.detail,
          detailVisible,
          diagnosticCode: expected.diagnosticCode,
          diagnosticVisible,
          retryAvailable,
        },
        destructiveEvidence: null,
        backRecoveryVerified: true,
        backRecoveryFocus: state.activation.backRecoveryFocus,
      },
      recovery: null,
    };
  }
  if (state.id === "destructive-settings-denial") {
    const candidate = page.getByRole("button", {
      name: /System Unassigned progress Device-only saves without a profile/u,
    });
    await candidate.focus();
    assert.equal(
      await candidate.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    const networkOnlineAtActivation = await page.evaluate(
      () => navigator.onLine,
    );
    assert.equal(
      networkOnlineAtActivation,
      state.activation.expectedNetworkOnline,
    );
    await page.keyboard.press("Enter");
    const destination = page.getByRole("heading", {
      name: state.activation.outcomeLabel,
    });
    await destination.waitFor();
    const searchOverlayHidden = await page.locator("#search-overlay").isHidden();
    const outcomeVisible = await destination.isVisible();
    assert.equal(searchOverlayHidden, true);
    assert.equal(outcomeVisible, true);

    const expected = state.activation.destructiveExpectation;
    const view = page.locator('[data-launcher-view="unassigned"]');
    const selectedEntry = view.getByRole("button", {
      name: new RegExp(expected.selectedEntryTitle, "u"),
    });
    assert.equal(
      await selectedEntry.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    const entryCountBeforeDenial = await view
      .locator(".unassigned-list button")
      .count();
    const action = view.getByRole("button", {
      name: expected.actionLabel,
      exact: true,
    });
    await action.focus();
    await page.keyboard.press("Enter");
    const confirmation = page.getByRole("dialog", {
      name: expected.dialogLabel,
      exact: true,
    });
    await confirmation.waitFor();
    const warningVisible = await confirmation
      .getByText(expected.warning, { exact: true })
      .isVisible();
    const prototypeBoundaryVisible = await confirmation
      .getByText(expected.prototypeBoundary, { exact: true })
      .isVisible();
    const safeDefault = confirmation.getByRole("button", {
      name: expected.safeDefaultLabel,
      exact: true,
    });
    const safeDefaultInitiallyFocused = await safeDefault.evaluate(
      (element) => element === document.activeElement,
    );
    assert.equal(warningVisible, true);
    assert.equal(prototypeBoundaryVisible, true);
    assert.equal(
      safeDefaultInitiallyFocused,
      expected.safeDefaultInitiallyFocused,
    );

    await page.keyboard.press("Escape");
    await confirmation.waitFor({ state: "hidden" });
    const confirmationDismissed = await confirmation.isHidden();
    const entryCountAfterDenial = await view
      .locator(".unassigned-list button")
      .count();
    const entryRetainedAfterDenial =
      entryCountAfterDenial === entryCountBeforeDenial
      && await selectedEntry.isVisible();
    const denialRecoveryFocus = await page.evaluate(
      () => document.activeElement?.id,
    );
    assert.equal(
      confirmationDismissed,
      expected.confirmationDismissed,
    );
    assert.equal(
      entryRetainedAfterDenial,
      expected.entryRetainedAfterDenial,
    );
    assert.equal(denialRecoveryFocus, expected.denialRecoveryFocus);

    await page.keyboard.press("Escape");
    const profiles = page.getByRole("heading", {
      name: "Who is playing?",
      exact: true,
    });
    await profiles.waitFor();
    const profilesNavigation = page.locator(
      '.launcher-nav [data-view-target="profiles"]',
    );
    assert.equal(
      await profilesNavigation.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    return {
      interactionTrace: state.interactionTrace,
      activation: {
        resultTitle: state.activation.resultTitle,
        method: state.activation.method,
        searchOverlayHidden,
        outcomeKind: state.activation.outcomeKind,
        outcomeLabel: state.activation.outcomeLabel,
        outcomeVisible,
        adapter: state.activation.expectedAdapter,
        networkOnlineAtActivation,
        remoteWebEvidence: null,
        unavailableEvidence: null,
        destructiveEvidence: {
          selectedEntryTitle: expected.selectedEntryTitle,
          entryCountBeforeDenial,
          actionLabel: expected.actionLabel,
          dialogLabel: expected.dialogLabel,
          warning: expected.warning,
          warningVisible,
          prototypeBoundary: expected.prototypeBoundary,
          prototypeBoundaryVisible,
          safeDefaultLabel: expected.safeDefaultLabel,
          safeDefaultInitiallyFocused,
          denialKind: expected.denialKind,
          confirmationDismissed,
          entryRetainedAfterDenial,
          entryCountAfterDenial,
          denialRecoveryFocus,
        },
        backRecoveryVerified: true,
        backRecoveryFocus: state.activation.backRecoveryFocus,
      },
      recovery: null,
    };
  }
  if (state.id === "motion-results") {
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await results.first().evaluate((element) => element === document.activeElement),
      true,
    );
    await results.last().focus();
    assert.equal(
      await results.last().evaluate((element) => element === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(await input.evaluate((element) => element === document.activeElement), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#search-overlay").isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), "search-trigger");
    return {
      interactionTrace: [
        "universal-search",
        "result-first",
        "result-last",
        "universal-search",
        "search-trigger",
      ],
      activation: null,
      recovery: null,
    };
  }
  if (state.id === "no-results") {
    const expected = state.recoveryExpectation;
    const recovery = page.getByLabel("Search recovery");
    await page.keyboard.press("ArrowDown");
    const clear = recovery.getByRole("button", {
      name: expected.clearActionLabel,
      exact: true,
    });
    const clearActionFocused = await clear.evaluate(
      (element) => element === document.activeElement,
    );
    assert.equal(clearActionFocused, true);
    await page.keyboard.press("Enter");
    const clearQuery = await input.inputValue();
    const clearResultCount = await results.count();
    const clearInputFocused = await input.evaluate(
      (element) => element === document.activeElement,
    );
    assert.equal(clearQuery, expected.clearQuery);
    assert.equal(clearResultCount, expected.clearResultCount);
    assert.equal(clearInputFocused, true);

    await input.fill(state.query);
    assert.equal(await results.count(), 0);
    await page.keyboard.press("ArrowDown");
    const restoredRecovery = page.getByLabel("Search recovery");
    const restoredClear = restoredRecovery.getByRole("button", {
      name: expected.clearActionLabel,
      exact: true,
    });
    assert.equal(
      await restoredClear.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    await page.keyboard.press("Tab");
    const category = restoredRecovery.getByRole("button", {
      name: expected.categoryActionLabel,
      exact: true,
    });
    const categoryActionFocused = await category.evaluate(
      (element) => element === document.activeElement,
    );
    assert.equal(categoryActionFocused, true);
    await page.keyboard.press("Enter");
    const categoryQuery = await input.inputValue();
    const categoryResultCount = await results.count();
    const firstResult = results.first();
    const categoryFirstResultFocused = await firstResult.evaluate(
      (element) => element === document.activeElement,
    );
    const categoryFirstResultTitle = await firstResult
      .locator("strong")
      .textContent();
    assert.equal(categoryQuery, expected.categoryQuery);
    assert.equal(categoryResultCount, expected.categoryResultCount);
    assert.equal(
      categoryFirstResultTitle?.trim(),
      expected.categoryFirstResultTitle,
    );
    assert.equal(categoryFirstResultFocused, true);

    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#search-overlay").isHidden(), true);
    const backRecoveryFocus = await page.evaluate(
      () => document.activeElement?.id,
    );
    assert.equal(backRecoveryFocus, expected.backRecoveryFocus);
    return {
      interactionTrace: state.interactionTrace,
      activation: null,
      recovery: {
        clearActionLabel: expected.clearActionLabel,
        clearActionFocused,
        clearQuery,
        clearResultCount,
        clearInputFocused,
        categoryActionLabel: expected.categoryActionLabel,
        categoryActionFocused,
        categoryQuery,
        categoryResultCount,
        categoryFirstResultTitle: categoryFirstResultTitle?.trim(),
        categoryFirstResultFocused,
        backRecoveryVerified: true,
        backRecoveryFocus,
      },
    };
  }
  throw new Error(`unhandled Search state ${state.id}`);
}

async function exercise(chromePath) {
  const requireFromConsoleLab = createRequire(resolve(appRoot, "package.json"));
  const { chromium } = requireFromConsoleLab("@playwright/test");
  const server = await startProductionPreview();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--disable-gpu"],
  });
  const observations = [];
  const requestCounts = new Map();
  const consoleErrors = [];
  let pageErrorCount = 0;
  let requestFailureCount = 0;
  try {
    for (const resolution of TV_CONFORMANCE_RESOLUTIONS) {
      for (const state of SEARCH_STATES) {
        const page = await browser.newPage({
          viewport: {
            width: resolution.width,
            height: resolution.height,
          },
          deviceScaleFactor: 1,
        });
        if (state.id === "remote-web-ready-denial") {
          await page.addInitScript(() => {
            window.open = () => null;
          });
        }
        await installFrozenLauncherClock(page);
        page.on("console", (message) => {
          if (message.type() === "error") consoleErrors.push(message.text());
        });
        page.on("pageerror", () => {
          pageErrorCount += 1;
        });
        page.on("requestfailed", () => {
          requestFailureCount += 1;
        });
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (url.origin !== server.origin) return;
          requestCounts.set(
            url.pathname,
            (requestCounts.get(url.pathname) ?? 0) + 1,
          );
        });
        const response = await page.goto(`${server.origin}/?skipBoot=1`, {
          waitUntil: "load",
          timeout: 30_000,
        });
        assert.equal(response?.status(), 200);
        await page.getByRole("heading", { name: /Good evening/ }).waitFor();
        await page.locator("#search-trigger").focus();
        await page.locator("#search-trigger").click();
        const input = page.locator("#universal-search");
        await input.fill(state.query);
        const results = page.locator("#search-results button");
        assert.equal(await results.count(), state.resultCount);
        assert.equal(
          await page.locator("#search-empty").isVisible(),
          state.resultCount === 0,
        );
        await page.evaluate(() => document.fonts.ready);
        await page.clock.runFor(1_000);
        const resultsScroll = await prepareScrollingState(
          page,
          state,
          resolution,
        );

        const safeArea = safeAreaFor(resolution);
        const allCriticalText = await measureElements(
          page,
          ".search-overlay [data-tv-critical-text]:visible",
        );
        const measuredCriticalText = await measureCriticalText(page, state);
        const actions = await measureElements(
          page,
          ".search-overlay [data-tv-action]:visible",
        );
        assert.equal(allCriticalText.length, state.criticalTextCount);
        assert.equal(actions.length, state.actionTargetCount);
        assert.ok(
          measuredCriticalText.every(
            (item) =>
              insideSafeArea(item, safeArea) && item.fontSize >= 24,
          ),
        );
        assert.equal(countOverlaps(measuredCriticalText), 0);
        assert.ok(
          actions.every(
            (item) => item.width >= 48 && item.height >= 48,
          ),
        );
        const overflow = await page.locator(".search-overlay").evaluate(
          (element) => ({
            horizontal: element.scrollWidth - element.clientWidth,
            vertical: element.scrollHeight - element.clientHeight,
          }),
        );
        assert.ok(overflow.horizontal <= 1 && overflow.vertical <= 1);

        const screenshotPath = resolve(
          outputRoot,
          `windows-x64-chrome-150-launcher-search-${state.id}-${resolution.id}.png`,
        );
        await mkdir(dirname(screenshotPath), { recursive: true });
        const screenshot = await page.screenshot({
          path: screenshotPath,
          fullPage: false,
        });
        const interaction = await exerciseInteraction(page, state);
        assert.deepEqual(
          interaction.interactionTrace,
          state.interactionTrace,
        );
        observations.push({
          state: state.id,
          ...resolution,
          query: state.query,
          safeArea,
          documentReadyState: await page.evaluate(() => document.readyState),
          resultCount: state.resultCount,
          emptyStateVisible: state.resultCount === 0,
          criticalTextCount: allCriticalText.length,
          measuredCriticalTextCount: measuredCriticalText.length,
          criticalTextInsideSafeArea: measuredCriticalText.filter((item) =>
            insideSafeArea(item, safeArea)
          ).length,
          minimumCriticalTextCssPx: rounded(
            Math.min(...measuredCriticalText.map((item) => item.fontSize)),
          ),
          criticalTextOverlapCount: countOverlaps(measuredCriticalText),
          actionTargetCount: actions.length,
          minimumActionTargetWidthCssPx: rounded(
            Math.min(...actions.map((item) => item.width)),
          ),
          minimumActionTargetHeightCssPx: rounded(
            Math.min(...actions.map((item) => item.height)),
          ),
          overlayOverflowCssPx: overflow,
          resultsScroll,
          interactionTrace: interaction.interactionTrace,
          activation: interaction.activation,
          recovery: interaction.recovery,
          screenshot: {
            path:
              `benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-${state.id}-${resolution.id}.png`,
            bytes: screenshot.length,
            sha256: createHash("sha256").update(screenshot).digest("hex"),
          },
        });
        await page.close();
      }
    }
    assert.deepEqual(consoleErrors, []);
    assert.equal(pageErrorCount, 0);
    assert.equal(requestFailureCount, 0);
    return {
      browserProduct: `Chrome/${browser.version()}`,
      observations,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount,
      requestFailureCount,
      requestCounts: Object.fromEntries(
        [...requestCounts].sort(([left], [right]) =>
          left.localeCompare(right)
        ),
      ),
    };
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function generateLauncherSearchTvEvidence() {
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "x64");
  assert.equal(process.version, GODOT_EXPORT_NODE_VERSION);
  const retrievedAtUtc = new Date().toISOString();
  assert.ok(
    retrievedAtUtc.startsWith(`${TV_CONFORMANCE_EVIDENCE_DATE}T`),
    `this evidence generator is frozen to ${TV_CONFORMANCE_EVIDENCE_DATE}`,
  );
  const browser = await exercise(findChrome());
  assert.equal(browser.browserProduct, GODOT_EXPORT_BROWSER_PRODUCT);
  const representativeEvidenceBytes = await readFile(
    resolve(root, representativeEvidenceRelativePath),
  );
  return {
    format: LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT,
    evidenceDate: TV_CONFORMANCE_EVIDENCE_DATE,
    evidenceClass:
      "windows-x64-headless-chrome-launcher-search-tv-conformance",
    qualification:
      "candidate-eight-search-states-with-local-no-result-recovery-and-five-activation-classes-with-remote-unavailable-and-destructive-failure-denial-only-not-tv-target-or-catalog-qualification",
    retrievedAtUtc,
    baseRepresentativeEvidence: {
      format:
        "vcg-launcher-representative-surfaces-tv-conformance-evidence/v1",
      sha256: sha256(representativeEvidenceBytes),
    },
    environment: {
      producerPlatform: process.platform,
      producerArchitecture: process.arch,
      nodeVersion: process.version,
      browserProduct: browser.browserProduct,
      devicePixelRatio: 1,
      browserClock: LAUNCHER_TV_BROWSER_CLOCK,
    },
    contract: {
      states: SEARCH_STATES,
      safeInsetPercent: 5,
      minimumCriticalTextCssPx: 24,
      minimumActionTargetCssPx: 48,
      resolutions: TV_CONFORMANCE_RESOLUTIONS,
    },
    browser,
    disposition: {
      productionBuildLoaded: true,
      markedCriticalTextVerified: true,
      markedActionTargetsVerified: true,
      criticalTextOverlapRejected: true,
      keyboardInputFocusBackVerified: true,
      overlayOverflowRejected: true,
      arbitraryQueryVerified: false,
      scrollingResultsVerified: true,
      noResultRecoveryVerified: true,
      resultActivationVerified: true,
      remoteWebActivationVerified: true,
      remoteWebOfflineFailureVerified: true,
      externalOriginDisclosureVerified: true,
      blockedPreviewDenialVerified: true,
      unavailablePackageDenialVerified: true,
      destructiveSettingsDenialVerified: true,
      physicalTelevisionVerified: false,
      physicalControllerVerified: false,
      reservedHomeVerified: false,
      nativeHostVerified: false,
      catalogGameCompatibilityVerified: false,
      allLauncherStatesVerified: false,
      targetPlatformQualified: false,
      frameRateQualified: false,
    },
    summary: {
      resolutionCount: 3,
      searchStateCount: 8,
      observationCount: 24,
      screenshotCount: 24,
      distinctQueryCount: 7,
      activatedResultClassCount: 5,
      remoteWebOutcomeStateCount: 2,
      unavailableOutcomeStateCount: 1,
      destructiveOutcomeStateCount: 1,
      recoveryStateCount: 1,
      failureOutcomeStateCount: 2,
      denialOutcomeStateCount: 3,
      physicalTelevisionCount: 0,
      physicalControllerCount: 0,
      participantCount: 0,
      catalogGameCount: 0,
      targetHardwareCount: 0,
    },
    provenance: await provenance(),
    claimBoundary: LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY,
    limitations: LAUNCHER_SEARCH_TV_LIMITATIONS,
  };
}

async function main() {
  const artifact = await generateLauncherSearchTvEvidence();
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(
    `wrote launcher Search TV evidence for ${artifact.summary.searchStateCount} states, ${artifact.summary.observationCount} observations, and ${artifact.summary.screenshotCount} screenshots`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
