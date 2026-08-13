import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizedSha256,
  sha256,
  sourceTreeCommitment,
} from "./generate-launcher-tv-conformance-evidence.mjs";
import {
  LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY,
  LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT,
  LAUNCHER_SEARCH_TV_LIMITATIONS,
} from "./generate-launcher-search-tv-evidence.mjs";
import {
  TV_CONFORMANCE_BROWSER_PRODUCT,
  TV_CONFORMANCE_EVIDENCE_DATE,
  TV_CONFORMANCE_RESOLUTIONS,
} from "./generate-tv-conformance-evidence.mjs";
import {
  GODOT_EXPORT_NODE_VERSION,
} from "./generate-godot-export-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultArtifactPath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-tv-conformance-v1.json",
);
const representativeEvidencePath = resolve(
  root,
  "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
);
const MAX_ARTIFACT_BYTES = 80 * 1024;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const EXPECTED_STATES = Object.freeze([
  {
    id: "motion-results",
    query: "motion",
    resultCount: 5,
    criticalTextCount: 8,
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
      clearResultCount: 22,
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
    resultCount: 22,
    criticalTextCount: 25,
    actionTargetCount: 23,
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
    criticalTextCount: 4,
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
    criticalTextCount: 4,
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
    criticalTextCount: 4,
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
    criticalTextCount: 4,
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
    criticalTextCount: 4,
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

const EXPECTED_SCREENSHOTS = Object.freeze({
  "motion-results/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-720p.png",
    bytes: 127008,
    sha256: "293111a3926febe7c2f89521cc57e4e52db9ef48c82a0a6a989eced1cc5f0aca",
  },
  "no-results/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-720p.png",
    bytes: 127347,
    sha256: "6c343e5555f5ff2f3d80b15eba7ea8a4f52ec92431ada1ec8604adba5f8295aa",
  },
  "empty-query-scroll-activation/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-empty-query-scroll-activation-720p.png",
    bytes: 136686,
    sha256: "3106648e096693c360333aaa432845c9bd1ea17ff48d5beaf4d2062df2b8c789",
  },
  "offline-package-activation/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-offline-package-activation-720p.png",
    bytes: 129099,
    sha256: "42456b0aee4e42ef1ae328b6bd7565135f72df6a6f9e2364a293b10a16c4ae00",
  },
  "remote-web-ready-denial/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-remote-web-ready-denial-720p.png",
    bytes: 133408,
    sha256: "c4270a84fe241ac52173fb3aea248cf73a357d7ea95686710c30ce7bb96ab37c",
  },
  "remote-web-offline-failure/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-remote-web-offline-failure-720p.png",
    bytes: 133408,
    sha256: "c4270a84fe241ac52173fb3aea248cf73a357d7ea95686710c30ce7bb96ab37c",
  },
  "unavailable-package-denial/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-unavailable-package-denial-720p.png",
    bytes: 128851,
    sha256: "c4a7e74efa8932fea99d0251052fdedc410bb0b0dee54a56ecf996e6b3906bc7",
  },
  "destructive-settings-denial/720p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-destructive-settings-denial-720p.png",
    bytes: 135126,
    sha256: "a19898da976e836bdd036f1c24ef66954c74a2d32998de1cf1fcc7b56c5c7ef6",
  },
  "motion-results/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-1080p.png",
    bytes: 245009,
    sha256: "8ced0d848fab010fa55a8c3d54239e0ede1879bdedfa826da57a6eb703602d90",
  },
  "no-results/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-1080p.png",
    bytes: 231961,
    sha256: "675f7cd6c3665e7f69b91266c7be5623008414d53f6f92962a514c6edc9285c3",
  },
  "empty-query-scroll-activation/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-empty-query-scroll-activation-1080p.png",
    bytes: 282361,
    sha256: "deda18fca4b42db3c142ec7b3d3c7bff123ca920e172d97ecfcc6ea3a3e8820a",
  },
  "offline-package-activation/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-offline-package-activation-1080p.png",
    bytes: 221284,
    sha256: "299f9d096507519717f84a0a3664d7cf6878ce75bb4b600df973f1a536083ec0",
  },
  "remote-web-ready-denial/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-remote-web-ready-denial-1080p.png",
    bytes: 226199,
    sha256: "bca4a1180f55fa569904dcf0840c4acd26d663fe35cc88cdb5768a3d7eb6cc68",
  },
  "remote-web-offline-failure/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-remote-web-offline-failure-1080p.png",
    bytes: 226199,
    sha256: "bca4a1180f55fa569904dcf0840c4acd26d663fe35cc88cdb5768a3d7eb6cc68",
  },
  "unavailable-package-denial/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-unavailable-package-denial-1080p.png",
    bytes: 221255,
    sha256: "a162c00c6ec267d5b74fe78485c078479fc7e0a1ffaec93045863374dd3b1c14",
  },
  "destructive-settings-denial/1080p": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-destructive-settings-denial-1080p.png",
    bytes: 229045,
    sha256: "93ce2510400c6df93f7d3c049b5bb20b5c4297533d0d7e4f47846aad4abcc5f4",
  },
  "motion-results/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-motion-results-4k.png",
    bytes: 621635,
    sha256: "ef305888c8f8f994a8408c63a3bd908ef75ef31a73734601dce25c0f73257162",
  },
  "no-results/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-no-results-4k.png",
    bytes: 593389,
    sha256: "aa9772c9ec288f333ba03032af83e8fbce69b68bafb943742f8ec77f454418e2",
  },
  "empty-query-scroll-activation/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-empty-query-scroll-activation-4k.png",
    bytes: 773452,
    sha256: "44a2d5304217fd280d1b100deea53d5d6e8e53d8ebf5e9a955d8cb74f44b629b",
  },
  "offline-package-activation/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-offline-package-activation-4k.png",
    bytes: 559128,
    sha256: "6667244a4afc0f104d4becda2d414385652fb4e70f657d4e5953d930dd2d2fe6",
  },
  "remote-web-ready-denial/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-remote-web-ready-denial-4k.png",
    bytes: 568880,
    sha256: "5764412bc88d59997df26b82122fc05d38f3d49d80b05c32f70a4290855ffa1e",
  },
  "remote-web-offline-failure/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-remote-web-offline-failure-4k.png",
    bytes: 568880,
    sha256: "5764412bc88d59997df26b82122fc05d38f3d49d80b05c32f70a4290855ffa1e",
  },
  "unavailable-package-denial/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-unavailable-package-denial-4k.png",
    bytes: 560221,
    sha256: "4fb307644d6c20e08bba7504abfed885107e2b64d0be7ad7c5970096f834de07",
  },
  "destructive-settings-denial/4k": {
    path: "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-search-destructive-settings-denial-4k.png",
    bytes: 574880,
    sha256: "deddd8b7c0d1620070d69d8b0cb59240a86143bedf9711f496021f62128a0e35",
  },
});
const EXPECTED_MEASUREMENTS = Object.freeze({
  "motion-results/720p": {
    measuredCriticalTextCount: 8,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 693.141,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 272,
      scrollHeightCssPx: 272,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "no-results/720p": {
    measuredCriticalTextCount: 9,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 198.703,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 0,
      scrollHeightCssPx: 0,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "empty-query-scroll-activation/720p": {
    measuredCriticalTextCount: 10,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 693.141,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 420,
      scrollHeightCssPx: 1224,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 804,
      maximumScrollTopCssPx: 804,
      lastResultInsideViewportAfterFocus: true,
    },
  },
  "offline-package-activation/720p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 693.141,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "remote-web-ready-denial/720p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 693.141,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "remote-web-offline-failure/720p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 693.141,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "unavailable-package-denial/720p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 693.141,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "destructive-settings-denial/720p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 693.141,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "motion-results/1080p": {
    measuredCriticalTextCount: 8,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 677.922,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 276,
      scrollHeightCssPx: 276,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "no-results/1080p": {
    measuredCriticalTextCount: 9,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 194.891,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 0,
      scrollHeightCssPx: 0,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "empty-query-scroll-activation/1080p": {
    measuredCriticalTextCount: 16,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 677.922,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 726,
      scrollHeightCssPx: 1234,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 508,
      maximumScrollTopCssPx: 508,
      lastResultInsideViewportAfterFocus: true,
    },
  },
  "offline-package-activation/1080p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 677.922,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "remote-web-ready-denial/1080p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 677.922,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "remote-web-offline-failure/1080p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 677.922,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "unavailable-package-denial/1080p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 677.922,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 48,
      scrollHeightCssPx: 48,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "destructive-settings-denial/1080p": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetWidthCssPx: 677.922,
    minimumActionTargetHeightCssPx: 48,
    resultsScroll: {
      clientHeightCssPx: 50,
      scrollHeightCssPx: 50,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "motion-results/4k": {
    measuredCriticalTextCount: 8,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1548.656,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 374,
      scrollHeightCssPx: 374,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "no-results/4k": {
    measuredCriticalTextCount: 9,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 425.297,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 0,
      scrollHeightCssPx: 0,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "empty-query-scroll-activation/4k": {
    measuredCriticalTextCount: 25,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1548.656,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 1564,
      scrollHeightCssPx: 1564,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: true,
    },
  },
  "offline-package-activation/4k": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1548.656,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 62,
      scrollHeightCssPx: 62,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "remote-web-ready-denial/4k": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1548.656,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 62,
      scrollHeightCssPx: 62,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "remote-web-offline-failure/4k": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1548.656,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 62,
      scrollHeightCssPx: 62,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "unavailable-package-denial/4k": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1548.656,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 62,
      scrollHeightCssPx: 62,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
  "destructive-settings-denial/4k": {
    measuredCriticalTextCount: 4,
    minimumCriticalTextCssPx: 48,
    minimumActionTargetWidthCssPx: 1548.656,
    minimumActionTargetHeightCssPx: 62,
    resultsScroll: {
      clientHeightCssPx: 62,
      scrollHeightCssPx: 62,
      initialScrollTopCssPx: 0,
      finalScrollTopCssPx: 0,
      maximumScrollTopCssPx: 0,
      lastResultInsideViewportAfterFocus: null,
    },
  },
});
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
  representativeEvidencePath:
    "benchmarks/tv-conformance/windows-x64-chrome-150-launcher-representative-surfaces-tv-conformance-v1.json",
  commonGeneratorPath:
    "scripts/generate-launcher-tv-conformance-evidence.mjs",
  generatorPath:
    "scripts/generate-launcher-search-tv-evidence.mjs",
  validatorPath:
    "scripts/validate-launcher-search-tv-evidence.mjs",
});

function exactKeys(value, expected, label) {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  assert.deepEqual(Object.keys(value), expected, `${label} keys changed`);
}

function finite(value, label) {
  assert.equal(typeof value, "number", `${label} must be numeric`);
  assert.equal(Number.isFinite(value), true, `${label} must be finite`);
  return value;
}

function observationKey(observation) {
  return `${observation.state}/${observation.id}`;
}

async function validateScreenshot(observation) {
  const expected = EXPECTED_SCREENSHOTS[observationKey(observation)];
  assert.ok(expected, `no frozen screenshot for ${observationKey(observation)}`);
  assert.deepEqual(observation.screenshot, expected);
  const absolute = resolve(root, observation.screenshot.path);
  assert.equal(
    absolute.startsWith(resolve(root, "benchmarks/tv-conformance")),
    true,
  );
  const metadata = await stat(absolute);
  assert.equal(metadata.isFile(), true);
  assert.ok(metadata.size <= MAX_SCREENSHOT_BYTES);
  assert.equal(metadata.size, observation.screenshot.bytes);
  const bytes = await readFile(absolute);
  assert.equal(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);
  assert.equal(sha256(bytes), observation.screenshot.sha256);
}

function validateRequests(requestCounts) {
  exactKeys(
    requestCounts,
    Object.keys(requestCounts).sort((left, right) => left.localeCompare(right)),
    "requestCounts",
  );
  const entries = Object.entries(requestCounts);
  assert.equal(entries.length, 9);
  assert.equal(requestCounts["/"], 24);
  assert.equal(requestCounts["/fonts/OCRA.ttf"], 24);
  assert.equal(requestCounts["/fonts/InterVariable.woff2"], 24);
  const assets = entries.filter(([path]) => path.startsWith("/assets/"));
  assert.equal(assets.length, 6);
  assert.equal(assets.filter(([path]) => path.endsWith(".css")).length, 1);
  assert.equal(assets.filter(([path]) => path.endsWith(".js")).length, 5);
  for (const [path, count] of assets) {
    assert.match(path, /^\/assets\/[A-Za-z0-9_-]+\.(?:css|js)$/u);
    assert.equal(count, 24);
  }
}

async function validateProvenance(provenance) {
  const expectedKeys = Object.keys(provenancePaths).flatMap((key) => [
    key,
    `${key}Sha256`,
  ]);
  expectedKeys.push("productionSourceTree");
  exactKeys(provenance, expectedKeys, "provenance");
  for (const [key, path] of Object.entries(provenancePaths)) {
    assert.equal(provenance[key], path);
    assert.equal(
      provenance[`${key}Sha256`],
      normalizedSha256(await readFile(resolve(root, path))),
    );
  }
  assert.deepEqual(
    provenance.productionSourceTree,
    await sourceTreeCommitment(),
  );
}

async function validateObservation(observation, expectedState, resolution) {
  exactKeys(
    observation,
    [
      "state",
      "id",
      "width",
      "height",
      "query",
      "safeArea",
      "documentReadyState",
      "resultCount",
      "emptyStateVisible",
      "criticalTextCount",
      "measuredCriticalTextCount",
      "criticalTextInsideSafeArea",
      "minimumCriticalTextCssPx",
      "criticalTextOverlapCount",
      "actionTargetCount",
      "minimumActionTargetWidthCssPx",
      "minimumActionTargetHeightCssPx",
      "overlayOverflowCssPx",
      "resultsScroll",
      "interactionTrace",
      "activation",
      "recovery",
      "screenshot",
    ],
    `observation ${expectedState.id}/${resolution.id}`,
  );
  assert.equal(observation.state, expectedState.id);
  assert.equal(observation.id, resolution.id);
  assert.equal(observation.width, resolution.width);
  assert.equal(observation.height, resolution.height);
  assert.equal(observation.query, expectedState.query);
  assert.deepEqual(observation.safeArea, {
    left: resolution.width * 0.05,
    top: resolution.height * 0.05,
    right: resolution.width * 0.95,
    bottom: resolution.height * 0.95,
  });
  assert.equal(observation.documentReadyState, "complete");
  assert.equal(observation.resultCount, expectedState.resultCount);
  assert.equal(observation.emptyStateVisible, expectedState.resultCount === 0);
  assert.equal(observation.criticalTextCount, expectedState.criticalTextCount);
  assert.ok(observation.measuredCriticalTextCount > 0);
  assert.ok(
    observation.measuredCriticalTextCount <= observation.criticalTextCount,
  );
  assert.equal(
    observation.criticalTextInsideSafeArea,
    observation.measuredCriticalTextCount,
  );
  assert.ok(finite(observation.minimumCriticalTextCssPx, "minimum text") >= 24);
  assert.equal(observation.criticalTextOverlapCount, 0);
  assert.equal(observation.actionTargetCount, expectedState.actionTargetCount);
  assert.ok(finite(observation.minimumActionTargetWidthCssPx, "minimum width") >= 48);
  assert.ok(finite(observation.minimumActionTargetHeightCssPx, "minimum height") >= 48);
  assert.deepEqual(observation.overlayOverflowCssPx, {
    horizontal: 0,
    vertical: 0,
  });
  exactKeys(
    observation.resultsScroll,
    [
      "clientHeightCssPx",
      "scrollHeightCssPx",
      "initialScrollTopCssPx",
      "finalScrollTopCssPx",
      "maximumScrollTopCssPx",
      "lastResultInsideViewportAfterFocus",
    ],
    `resultsScroll ${expectedState.id}/${resolution.id}`,
  );
  for (const key of [
    "clientHeightCssPx",
    "scrollHeightCssPx",
    "initialScrollTopCssPx",
    "finalScrollTopCssPx",
    "maximumScrollTopCssPx",
  ]) {
    assert.ok(
      finite(observation.resultsScroll[key], `resultsScroll ${key}`) >= 0,
    );
  }
  assert.equal(
    observation.resultsScroll.maximumScrollTopCssPx,
    observation.resultsScroll.scrollHeightCssPx
      - observation.resultsScroll.clientHeightCssPx,
  );
  assert.equal(observation.resultsScroll.initialScrollTopCssPx, 0);
  const scrollingExpected =
    expectedState.scrollingExpectedResolutionIds.includes(resolution.id);
  if (expectedState.id === "empty-query-scroll-activation") {
    assert.equal(
      observation.resultsScroll.lastResultInsideViewportAfterFocus,
      true,
    );
    if (scrollingExpected) {
      assert.ok(
        observation.resultsScroll.scrollHeightCssPx
          > observation.resultsScroll.clientHeightCssPx,
      );
      assert.ok(observation.resultsScroll.finalScrollTopCssPx > 0);
    } else {
      assert.equal(
        observation.resultsScroll.scrollHeightCssPx,
        observation.resultsScroll.clientHeightCssPx,
      );
      assert.equal(observation.resultsScroll.finalScrollTopCssPx, 0);
    }
  } else {
    assert.equal(
      observation.resultsScroll.lastResultInsideViewportAfterFocus,
      null,
    );
    assert.equal(observation.resultsScroll.finalScrollTopCssPx, 0);
  }
  assert.deepEqual(
    observation.interactionTrace,
    expectedState.interactionTrace,
  );
  if (expectedState.activation === null) {
    assert.equal(observation.activation, null);
  } else {
    const remoteExpectation =
      expectedState.activation.remoteWebExpectation;
    const remoteWebEvidence = remoteExpectation === null
      ? null
      : {
          statusLabel: remoteExpectation.statusLabel,
          statusVisible: true,
          originLabel: remoteExpectation.originLabel,
          originVisible: true,
          actionLabel: remoteExpectation.actionLabel,
          actionVisible: true,
          failureMessage: remoteExpectation.failureMessage,
          failureMessageVisible:
            remoteExpectation.failureMessage === null ? null : true,
          retryAvailable: remoteExpectation.retryAvailable,
          denialKind: remoteExpectation.denial?.kind ?? null,
          denialObserved: remoteExpectation.denial !== null,
          denialMessage: remoteExpectation.denial?.message ?? null,
          launchRetainedAfterDenial:
            remoteExpectation.denial?.launchRetained ?? null,
        };
    const unavailableExpectation =
      expectedState.activation.unavailableExpectation;
    const unavailableEvidence = unavailableExpectation === null
      ? null
      : {
          statusLabel: unavailableExpectation.statusLabel,
          statusVisible: true,
          detail: unavailableExpectation.detail,
          detailVisible: true,
          diagnosticCode: unavailableExpectation.diagnosticCode,
          diagnosticVisible: true,
          retryAvailable: unavailableExpectation.retryAvailable,
        };
    const destructiveExpectation =
      expectedState.activation.destructiveExpectation;
    const destructiveEvidence = destructiveExpectation === null
      ? null
      : {
          selectedEntryTitle: destructiveExpectation.selectedEntryTitle,
          entryCountBeforeDenial: 4,
          actionLabel: destructiveExpectation.actionLabel,
          dialogLabel: destructiveExpectation.dialogLabel,
          warning: destructiveExpectation.warning,
          warningVisible: true,
          prototypeBoundary: destructiveExpectation.prototypeBoundary,
          prototypeBoundaryVisible: true,
          safeDefaultLabel: destructiveExpectation.safeDefaultLabel,
          safeDefaultInitiallyFocused:
            destructiveExpectation.safeDefaultInitiallyFocused,
          denialKind: destructiveExpectation.denialKind,
          confirmationDismissed:
            destructiveExpectation.confirmationDismissed,
          entryRetainedAfterDenial:
            destructiveExpectation.entryRetainedAfterDenial,
          entryCountAfterDenial: 4,
          denialRecoveryFocus:
            destructiveExpectation.denialRecoveryFocus,
        };
    assert.deepEqual(observation.activation, {
      resultTitle: expectedState.activation.resultTitle,
      method: expectedState.activation.method,
      searchOverlayHidden: true,
      outcomeKind: expectedState.activation.outcomeKind,
      outcomeLabel: expectedState.activation.outcomeLabel,
      outcomeVisible: true,
      adapter: expectedState.activation.expectedAdapter,
      networkOnlineAtActivation:
        expectedState.activation.expectedNetworkOnline,
      remoteWebEvidence,
      unavailableEvidence,
      destructiveEvidence,
      backRecoveryVerified: true,
      backRecoveryFocus: expectedState.activation.backRecoveryFocus,
    });
  }
  const recoveryExpectation = expectedState.recoveryExpectation ?? null;
  if (recoveryExpectation === null) {
    assert.equal(observation.recovery, null);
  } else {
    assert.deepEqual(observation.recovery, {
      clearActionLabel: recoveryExpectation.clearActionLabel,
      clearActionFocused: true,
      clearQuery: recoveryExpectation.clearQuery,
      clearResultCount: recoveryExpectation.clearResultCount,
      clearInputFocused: true,
      categoryActionLabel: recoveryExpectation.categoryActionLabel,
      categoryActionFocused: true,
      categoryQuery: recoveryExpectation.categoryQuery,
      categoryResultCount: recoveryExpectation.categoryResultCount,
      categoryFirstResultTitle:
        recoveryExpectation.categoryFirstResultTitle,
      categoryFirstResultFocused: true,
      backRecoveryVerified: true,
      backRecoveryFocus: recoveryExpectation.backRecoveryFocus,
    });
  }
  assert.deepEqual(
    {
      measuredCriticalTextCount: observation.measuredCriticalTextCount,
      minimumCriticalTextCssPx: observation.minimumCriticalTextCssPx,
      minimumActionTargetWidthCssPx:
        observation.minimumActionTargetWidthCssPx,
      minimumActionTargetHeightCssPx:
        observation.minimumActionTargetHeightCssPx,
      resultsScroll: observation.resultsScroll,
    },
    EXPECTED_MEASUREMENTS[observationKey(observation)],
  );
  await validateScreenshot(observation);
}

export async function validateLauncherSearchTvEvidence(
  artifactFile = defaultArtifactPath,
) {
  const bytes = await readFile(artifactFile);
  assert.ok(bytes.length <= MAX_ARTIFACT_BYTES);
  const artifact = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    bytes.toString("utf8"),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "artifact must use canonical pretty JSON",
  );
  exactKeys(
    artifact,
    [
      "format",
      "evidenceDate",
      "evidenceClass",
      "qualification",
      "retrievedAtUtc",
      "baseRepresentativeEvidence",
      "environment",
      "contract",
      "browser",
      "disposition",
      "summary",
      "provenance",
      "claimBoundary",
      "limitations",
    ],
    "artifact",
  );
  assert.equal(artifact.format, LAUNCHER_SEARCH_TV_EVIDENCE_FORMAT);
  assert.equal(artifact.evidenceDate, TV_CONFORMANCE_EVIDENCE_DATE);
  assert.equal(
    artifact.evidenceClass,
    "windows-x64-headless-chrome-launcher-search-tv-conformance",
  );
  assert.equal(
    artifact.qualification,
    "candidate-eight-search-states-with-local-no-result-recovery-and-five-activation-classes-with-remote-unavailable-and-destructive-failure-denial-only-not-tv-target-or-catalog-qualification",
  );
  assert.match(
    artifact.retrievedAtUtc,
    new RegExp(`^${TV_CONFORMANCE_EVIDENCE_DATE}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`, "u"),
  );
  assert.deepEqual(artifact.baseRepresentativeEvidence, {
    format:
      "vcg-launcher-representative-surfaces-tv-conformance-evidence/v1",
    sha256: sha256(await readFile(representativeEvidencePath)),
  });
  assert.deepEqual(artifact.environment, {
    producerPlatform: "win32",
    producerArchitecture: "x64",
    nodeVersion: GODOT_EXPORT_NODE_VERSION,
    browserProduct: TV_CONFORMANCE_BROWSER_PRODUCT,
    devicePixelRatio: 1,
    browserClock: "2026-07-24T19:00:00-07:00",
  });
  assert.deepEqual(artifact.contract, {
    states: EXPECTED_STATES,
    safeInsetPercent: 5,
    minimumCriticalTextCssPx: 24,
    minimumActionTargetCssPx: 48,
    resolutions: TV_CONFORMANCE_RESOLUTIONS,
  });

  exactKeys(
    artifact.browser,
    [
      "browserProduct",
      "observations",
      "consoleErrorCount",
      "pageErrorCount",
      "requestFailureCount",
      "requestCounts",
    ],
    "browser",
  );
  assert.equal(artifact.browser.browserProduct, TV_CONFORMANCE_BROWSER_PRODUCT);
  assert.equal(artifact.browser.observations.length, 24);
  let observationIndex = 0;
  for (const resolution of TV_CONFORMANCE_RESOLUTIONS) {
    for (const state of EXPECTED_STATES) {
      await validateObservation(
        artifact.browser.observations[observationIndex],
        state,
        resolution,
      );
      observationIndex += 1;
    }
  }
  assert.equal(artifact.browser.consoleErrorCount, 0);
  assert.equal(artifact.browser.pageErrorCount, 0);
  assert.equal(artifact.browser.requestFailureCount, 0);
  validateRequests(artifact.browser.requestCounts);
  assert.deepEqual(artifact.disposition, {
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
  });
  assert.deepEqual(artifact.summary, {
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
  });
  await validateProvenance(artifact.provenance);
  assert.equal(artifact.claimBoundary, LAUNCHER_SEARCH_TV_CLAIM_BOUNDARY);
  assert.deepEqual(artifact.limitations, LAUNCHER_SEARCH_TV_LIMITATIONS);
  return artifact;
}

async function main() {
  const artifact = await validateLauncherSearchTvEvidence(
    process.argv[2] ? resolve(process.argv[2]) : defaultArtifactPath,
  );
  console.log(
    `validated launcher Search TV evidence; states=${artifact.summary.searchStateCount}; observations=${artifact.summary.observationCount}; physicalTVs=${artifact.summary.physicalTelevisionCount}`,
  );
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
