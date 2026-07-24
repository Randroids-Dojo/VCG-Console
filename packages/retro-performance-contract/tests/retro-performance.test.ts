import { describe, expect, it } from "vitest";

import {
  authorizeRetroBenchmarkQualification,
  evaluateRetroBenchmark,
  parseRetroBenchmarkPlan,
  parseRetroBenchmarkPlanJson,
  parseRetroBenchmarkResult,
  parseRetroBenchmarkResultJson,
  RETRO_PERFORMANCE_MAX_JSON_BYTES,
  RETRO_PERFORMANCE_MAX_TARGETS,
  RETRO_SYSTEM_CLASSES,
  type RetroBenchmarkPlan,
} from "../src/index.js";

const digest = (character: string) => character.repeat(64);

type RawKnownLimit = {
  id: string;
  category:
    | "compatibility"
    | "accuracy"
    | "frame-pacing"
    | "audio"
    | "power"
    | "thermal"
    | "input"
    | "storage"
    | "feature";
  evidenceSha256: string;
};

function rawTarget(
  targetId = "ordinary-linux-x64",
  hashCharacter = "a",
) {
  return {
    targetId,
    architecture:
      targetId === "pi-five-arm64" ? "linux-arm64" : "linux-x86-64",
    hardwareFingerprintSha256: digest(hashCharacter),
    osImageSha256: digest("b"),
    frontendId: "retroarch",
    frontendVersion: "1.21.0",
    frontendSha256: digest("c"),
    frameProbeId: "frame-probe-one",
    audioProbeId: "audio-probe-one",
    powerProbeId: "power-probe-one",
    thermalProbeId: "thermal-probe-one",
    instrumentationPolicySha256: digest("d"),
    outputWidthPx: 1920,
    outputHeightPx: 1080,
    refreshMilliHz: 60_000,
  };
}

function rawRun(
  targetId: string,
  systemClass: (typeof RETRO_SYSTEM_CLASSES)[number],
  index: number,
) {
  return {
    targetId,
    systemClass,
    caseId: `${targetId}-case-${String(index + 1)}`,
    systemId: `system-${String(index + 1)}`,
    coreId: `core-${String(index + 1)}`,
    coreVersion: `1.0.${String(index)}`,
    coreSha256: digest(String(index + 1)),
    contentId: `content-${String(index + 1)}`,
    contentSha256: digest(["6", "7", "8", "9", "0"][index]!),
    thresholds: {
      minimumDurationSeconds: 3600,
      maxP95FrameIntervalUs: 18_000,
      maxP99FrameIntervalUs: 25_000,
      maxMissedFrameRatePpm: 10_000,
      maxP95AudioLatencyUs: 80_000,
      maxAudioUnderruns: 0,
      maxPeakPowerMilliW: 150_000,
      maxPeakTemperatureMilliC: 85_000,
    },
  };
}

function rawPlan(targets = [rawTarget()]) {
  return {
    schemaVersion: 1,
    campaignId: "retro-target-matrix-v1",
    revision: 1,
    targets,
    runs: targets.flatMap(({ targetId }) =>
      RETRO_SYSTEM_CLASSES.map((systemClass, index) =>
        rawRun(targetId, systemClass, index),
      ),
    ),
  };
}

function plan(targets = [rawTarget()]): RetroBenchmarkPlan {
  return parseRetroBenchmarkPlan(rawPlan(targets));
}

function passingMetrics() {
  return {
    observedDurationSeconds: 3600,
    frameCount: 216_000,
    missedFrameCount: 100,
    p50FrameIntervalUs: 16_667,
    p95FrameIntervalUs: 17_500,
    p99FrameIntervalUs: 20_000,
    maxFrameIntervalUs: 24_000,
    p50AudioLatencyUs: 35_000,
    p95AudioLatencyUs: 60_000,
    audioUnderrunCount: 0,
    meanPowerMilliW: 70_000,
    peakPowerMilliW: 110_000,
    startTemperatureMilliC: 45_000,
    peakTemperatureMilliC: 72_000,
    endTemperatureMilliC: 60_000,
    throttlingObserved: false,
    crashCount: 0,
    hangCount: 0,
  };
}

function rawResult(
  selectedPlan: RetroBenchmarkPlan,
  overrides: Record<string, unknown> = {},
) {
  const targetById = new Map(
    selectedPlan.targets.map((target) => [target.targetId, target]),
  );
  return {
    schemaVersion: 1,
    resultId: "retro-target-result-one",
    campaignId: selectedPlan.campaignId,
    campaignRevision: selectedPlan.revision,
    evidenceClass: "physical-target",
    observedAt: "2026-07-24T18:00:00Z",
    runs: selectedPlan.runs.map((run) => {
      const target = targetById.get(run.targetId)!;
      return {
        targetId: run.targetId,
        systemClass: run.systemClass,
        caseId: run.caseId,
        hardwareFingerprintSha256: target.hardwareFingerprintSha256,
        osImageSha256: target.osImageSha256,
        frontendSha256: target.frontendSha256,
        coreSha256: run.coreSha256,
        contentSha256: run.contentSha256,
        instrumentation: {
          frameProbeId: "frame-probe-one",
          audioProbeId: "audio-probe-one",
          powerProbeId: "power-probe-one",
          thermalProbeId: "thermal-probe-one",
          instrumentationPolicySha256:
            target.instrumentationPolicySha256,
          calibrationEvidenceSha256: digest("e"),
          rawTelemetrySha256: digest("f"),
        },
        metrics: passingMetrics(),
        knownLimits: [] as RawKnownLimit[],
      };
    }),
    ...overrides,
  };
}

function mutable<T>(value: T): any {
  return structuredClone(value);
}

function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

describe("retro performance qualification contract", () => {
  it("qualifies and binds one exact complete physical target matrix", () => {
    const selectedPlan = plan();
    const raw = rawResult(selectedPlan);
    raw.runs[0]!.knownLimits = [
      {
        id: "single-title-coverage",
        category: "compatibility",
        evidenceSha256: digest("f"),
      },
    ];
    const result = parseRetroBenchmarkResult(raw);
    const qualification = evaluateRetroBenchmark(selectedPlan, result);
    expect(qualification).toMatchObject({
      status: "qualified",
      blockingCodes: [],
      runFailures: [],
      knownLimits: [
        {
          id: "single-title-coverage",
          category: "compatibility",
          evidenceSha256: digest("f"),
        },
      ],
    });
    expect(
      authorizeRetroBenchmarkQualification(
        qualification,
        selectedPlan,
        result,
      ),
    ).toEqual({
      campaignId: "retro-target-matrix-v1",
      campaignRevision: 1,
      resultId: "retro-target-result-one",
      observedAt: "2026-07-24T18:00:00Z",
      targetIds: ["ordinary-linux-x64"],
      caseIds: selectedPlan.runs.map(({ caseId }) => caseId),
      knownLimits: [
        {
          id: "single-title-coverage",
          category: "compatibility",
          evidenceSha256: digest("f"),
        },
      ],
    });
  });

  it("requires every system class independently for every target", () => {
    const targets = [
      rawTarget("ordinary-linux-x64", "a"),
      rawTarget("pi-five-arm64", "9"),
    ];
    const complete = plan(targets);
    expect(complete.runs).toHaveLength(10);

    const missing = rawPlan(targets);
    missing.runs.splice(7, 1);
    expect(() => parseRetroBenchmarkPlan(missing)).toThrow(/exactly one/u);

    const duplicateClass = rawPlan(targets);
    duplicateClass.runs[9] = {
      ...duplicateClass.runs[8]!,
      caseId: "different-case",
    };
    expect(() => parseRetroBenchmarkPlan(duplicateClass)).toThrow();
  });

  it("blocks development dry runs even when every metric passes", () => {
    const selectedPlan = plan();
    const result = parseRetroBenchmarkResult(
      rawResult(selectedPlan, { evidenceClass: "development-dry-run" }),
    );
    const qualification = evaluateRetroBenchmark(selectedPlan, result);
    expect(qualification.status).toBe("blocked");
    expect(qualification.blockingCodes).toEqual([
      "development-evidence-only",
    ]);
    expect(() =>
      authorizeRetroBenchmarkQualification(
        qualification,
        selectedPlan,
        result,
      ),
    ).toThrow(/not qualified/u);
  });

  it("reports every measured threshold and lifecycle failure", () => {
    const selectedPlan = plan();
    const raw = rawResult(selectedPlan);
    raw.runs[0]!.metrics = {
      ...passingMetrics(),
      observedDurationSeconds: 3599,
      missedFrameCount: 10_000,
      p95FrameIntervalUs: 20_000,
      p99FrameIntervalUs: 30_000,
      maxFrameIntervalUs: 40_000,
      p95AudioLatencyUs: 90_000,
      audioUnderrunCount: 1,
      peakPowerMilliW: 160_000,
      peakTemperatureMilliC: 90_000,
      throttlingObserved: true,
      crashCount: 1,
      hangCount: 1,
    };
    const result = parseRetroBenchmarkResult(raw);
    const qualification = evaluateRetroBenchmark(selectedPlan, result);
    expect(qualification.status).toBe("blocked");
    expect(qualification.runFailures[0]!.codes).toEqual([
      "insufficient-duration",
      "frame-p95-limit",
      "frame-p99-limit",
      "missed-frame-rate-limit",
      "audio-latency-limit",
      "audio-underrun-limit",
      "power-limit",
      "temperature-limit",
      "throttling-observed",
      "crash-observed",
      "hang-observed",
    ]);
  });

  it("rejects platform, frontend, core, and content substitution", () => {
    const selectedPlan = plan();
    for (const field of [
      "hardwareFingerprintSha256",
      "osImageSha256",
      "frontendSha256",
      "coreSha256",
      "contentSha256",
    ] as const) {
      const raw = rawResult(selectedPlan);
      raw.runs[0]![field] = digest("0");
      const result = parseRetroBenchmarkResult(raw);
      expect(() => evaluateRetroBenchmark(selectedPlan, result)).toThrow(
        /does not match/u,
      );
    }
  });

  it("rejects instrumentation method or probe substitution", () => {
    const selectedPlan = plan();
    for (const field of [
      "frameProbeId",
      "audioProbeId",
      "powerProbeId",
      "thermalProbeId",
    ] as const) {
      const raw = rawResult(selectedPlan);
      raw.runs[0]!.instrumentation[field] = "substitute-probe";
      expect(() =>
        evaluateRetroBenchmark(
          selectedPlan,
          parseRetroBenchmarkResult(raw),
        ),
      ).toThrow(/does not match/u);
    }
    const raw = rawResult(selectedPlan);
    raw.runs[0]!.instrumentation.instrumentationPolicySha256 = digest("0");
    expect(() =>
      evaluateRetroBenchmark(
        selectedPlan,
        parseRetroBenchmarkResult(raw),
      ),
    ).toThrow(/does not match/u);
  });

  it("rejects incomplete, reordered, or stale campaign results", () => {
    const selectedPlan = plan();
    const incomplete = rawResult(selectedPlan);
    incomplete.runs.pop();
    expect(() =>
      evaluateRetroBenchmark(
        selectedPlan,
        parseRetroBenchmarkResult(incomplete),
      ),
    ).toThrow(/complete run matrix/u);

    const reordered = rawResult(selectedPlan);
    [reordered.runs[0], reordered.runs[1]] = [
      reordered.runs[1]!,
      reordered.runs[0]!,
    ];
    expect(() => parseRetroBenchmarkResult(reordered)).toThrow(/sorted/u);

    const stale = rawResult(selectedPlan, { campaignRevision: 2 });
    expect(() =>
      evaluateRetroBenchmark(
        selectedPlan,
        parseRetroBenchmarkResult(stale),
      ),
    ).toThrow(/campaign identity/u);
  });

  it("rejects malformed target and run ordering or identity", () => {
    const reversedTargets = rawPlan([
      rawTarget("pi-five-arm64", "9"),
      rawTarget("ordinary-linux-x64", "a"),
    ]);
    expect(() => parseRetroBenchmarkPlan(reversedTargets)).toThrow(
      /target-ID-sorted/u,
    );

    const duplicateCase = rawPlan();
    duplicateCase.runs[1]!.caseId = duplicateCase.runs[0]!.caseId;
    expect(() => parseRetroBenchmarkPlan(duplicateCase)).toThrow(/case IDs/u);

    const unknownTarget = rawPlan();
    unknownTarget.runs[0]!.targetId = "undeclared-target";
    expect(() => parseRetroBenchmarkPlan(unknownTarget)).toThrow();

    const reorderedRuns = rawPlan();
    [reorderedRuns.runs[0], reorderedRuns.runs[1]] = [
      reorderedRuns.runs[1]!,
      reorderedRuns.runs[0]!,
    ];
    expect(() => parseRetroBenchmarkPlan(reorderedRuns)).toThrow(/sorted/u);
  });

  it("rejects invalid thresholds and internally inconsistent metrics", () => {
    const badThresholds = rawPlan();
    badThresholds.runs[0]!.thresholds.maxP95FrameIntervalUs = 30_000;
    badThresholds.runs[0]!.thresholds.maxP99FrameIntervalUs = 20_000;
    expect(() => parseRetroBenchmarkPlan(badThresholds)).toThrow(/p99/u);

    const selectedPlan = plan();
    for (const mutation of [
      (metrics: ReturnType<typeof passingMetrics>) => {
        metrics.p50FrameIntervalUs = 30_000;
      },
      (metrics: ReturnType<typeof passingMetrics>) => {
        metrics.p50AudioLatencyUs = 100_000;
      },
      (metrics: ReturnType<typeof passingMetrics>) => {
        metrics.missedFrameCount = metrics.frameCount + 1;
      },
      (metrics: ReturnType<typeof passingMetrics>) => {
        metrics.meanPowerMilliW = metrics.peakPowerMilliW + 1;
      },
      (metrics: ReturnType<typeof passingMetrics>) => {
        metrics.startTemperatureMilliC =
          metrics.peakTemperatureMilliC + 1;
      },
    ]) {
      const raw = rawResult(selectedPlan);
      mutation(raw.runs[0]!.metrics);
      expect(() => parseRetroBenchmarkResult(raw)).toThrow();
    }
  });

  it("rejects duplicate or noncanonical known-limit records", () => {
    const selectedPlan = plan();
    const raw = rawResult(selectedPlan);
    raw.runs[0]!.knownLimits = [
      {
        id: "z-limit",
        category: "feature",
        evidenceSha256: digest("8"),
      },
      {
        id: "a-limit",
        category: "input",
        evidenceSha256: digest("7"),
      },
    ];
    expect(() => parseRetroBenchmarkResult(raw)).toThrow(/known limits/u);
    raw.runs[0]!.knownLimits[1]!.id = "z-limit";
    expect(() => parseRetroBenchmarkResult(raw)).toThrow(/known limits/u);
  });

  it("rejects one known-limit ID bound to conflicting evidence", () => {
    const selectedPlan = plan();
    const raw = rawResult(selectedPlan);
    raw.runs[0]!.knownLimits = [
      {
        id: "shared-limit",
        category: "compatibility",
        evidenceSha256: digest("1"),
      },
    ];
    raw.runs[1]!.knownLimits = [
      {
        id: "shared-limit",
        category: "compatibility",
        evidenceSha256: digest("2"),
      },
    ];
    expect(() =>
      evaluateRetroBenchmark(
        selectedPlan,
        parseRetroBenchmarkResult(raw),
      ),
    ).toThrow(/conflicting evidence/u);
  });

  it("evaluates missed-frame rate exactly at safe-integer bounds", () => {
    const rawSelectedPlan = rawPlan();
    rawSelectedPlan.runs[0]!.thresholds.maxMissedFrameRatePpm = 1;
    const selectedPlan = parseRetroBenchmarkPlan(rawSelectedPlan);
    const raw = rawResult(selectedPlan);
    raw.runs[0]!.metrics.frameCount = Number.MAX_SAFE_INTEGER;
    raw.runs[0]!.metrics.missedFrameCount = Math.floor(
      Number.MAX_SAFE_INTEGER / 1_000_000,
    );
    expect(
      evaluateRetroBenchmark(
        selectedPlan,
        parseRetroBenchmarkResult(raw),
      ).runFailures,
    ).toEqual([]);

    raw.runs[0]!.metrics.missedFrameCount += 1;
    expect(
      evaluateRetroBenchmark(
        selectedPlan,
        parseRetroBenchmarkResult(raw),
      ).runFailures[0]!.codes,
    ).toContain("missed-frame-rate-limit");
  });

  it("rejects paths, names, URLs, bytes, and arbitrary summary fields", () => {
    const selectedPlan = plan();
    const cases = [
      () => {
        const raw = mutable(rawPlan());
        raw.targets[0].devicePath = "/dev/dri/renderD128";
        return () => parseRetroBenchmarkPlan(raw);
      },
      () => {
        const raw = mutable(rawPlan());
        raw.runs[0].romFilename = "commercial-game.zip";
        return () => parseRetroBenchmarkPlan(raw);
      },
      () => {
        const raw = mutable(rawResult(selectedPlan));
        raw.operatorName = "Person Name";
        return () => parseRetroBenchmarkResult(raw);
      },
      () => {
        const raw = mutable(rawResult(selectedPlan));
        raw.runs[0].downloadUrl = "https://example.test/result";
        return () => parseRetroBenchmarkResult(raw);
      },
      () => {
        const raw = mutable(rawResult(selectedPlan));
        raw.runs[0].instrumentation.rawSamples = "base64";
        return () => parseRetroBenchmarkResult(raw);
      },
      () => {
        const raw = mutable(rawResult(selectedPlan));
        raw.runs[0].metrics.averageFps = 60;
        return () => parseRetroBenchmarkResult(raw);
      },
    ];
    for (const create of cases) expect(create()).toThrow();
  });

  it("requires canonical bounded UTF-8 JSON", () => {
    const raw = rawPlan();
    const parsedPlan = parseRetroBenchmarkPlanJson(canonicalBytes(raw));
    const rawObserved = rawResult(parsedPlan);
    expect(
      parseRetroBenchmarkResultJson(canonicalBytes(rawObserved)).resultId,
    ).toBe("retro-target-result-one");

    const compact = new TextEncoder().encode(JSON.stringify(raw));
    expect(() => parseRetroBenchmarkPlanJson(compact)).toThrow(/canonical/u);
    expect(() =>
      parseRetroBenchmarkPlanJson(
        new Uint8Array(RETRO_PERFORMANCE_MAX_JSON_BYTES + 1),
      ),
    ).toThrow(/size/u);
    expect(() =>
      parseRetroBenchmarkPlanJson(new Uint8Array([0xff])),
    ).toThrow();
  });

  it("bounds target count, IDs, versions, output modes, and timestamps", () => {
    const tooManyTargets = Array.from(
      { length: RETRO_PERFORMANCE_MAX_TARGETS + 1 },
      (_, index) =>
        rawTarget(
          `target-${String(index).padStart(2, "0")}`,
          String(index % 10),
        ),
    );
    expect(() => parseRetroBenchmarkPlan(rawPlan(tooManyTargets))).toThrow();

    const badId = rawPlan();
    badId.campaignId = "../campaign";
    expect(() => parseRetroBenchmarkPlan(badId)).toThrow();

    const badVersion = rawPlan();
    badVersion.runs[0]!.coreVersion = "version with spaces";
    expect(() => parseRetroBenchmarkPlan(badVersion)).toThrow();

    const badMode = rawPlan();
    badMode.targets[0]!.outputWidthPx = 100;
    expect(() => parseRetroBenchmarkPlan(badMode)).toThrow();

    const selectedPlan = plan();
    expect(() =>
      parseRetroBenchmarkResult(
        rawResult(selectedPlan, { observedAt: "yesterday" }),
      ),
    ).toThrow();
    expect(() =>
      parseRetroBenchmarkResult(
        rawResult(selectedPlan, {
          observedAt: "2026-07-24T11:00:00-07:00",
        }),
      ),
    ).toThrow();
  });

  it("rejects cloned plan, result, or qualification authority", () => {
    const selectedPlan = plan();
    const result = parseRetroBenchmarkResult(rawResult(selectedPlan));
    expect(() =>
      evaluateRetroBenchmark(mutable(selectedPlan), result),
    ).toThrow(/parsed authority/u);
    expect(() =>
      evaluateRetroBenchmark(selectedPlan, mutable(result)),
    ).toThrow(/parsed authority/u);

    const qualification = evaluateRetroBenchmark(selectedPlan, result);
    expect(() =>
      authorizeRetroBenchmarkQualification(
        mutable(qualification),
        selectedPlan,
        result,
      ),
    ).toThrow(/exact current/u);
    const anotherResult = parseRetroBenchmarkResult(rawResult(selectedPlan));
    expect(() =>
      authorizeRetroBenchmarkQualification(
        qualification,
        selectedPlan,
        anotherResult,
      ),
    ).toThrow(/exact current/u);
  });

  it("deeply freezes every parsed and derived authority", () => {
    const selectedPlan = plan();
    const result = parseRetroBenchmarkResult(rawResult(selectedPlan));
    const qualification = evaluateRetroBenchmark(selectedPlan, result);
    expect(Object.isFrozen(selectedPlan)).toBe(true);
    expect(Object.isFrozen(selectedPlan.runs[0]!.thresholds)).toBe(true);
    expect(Object.isFrozen(result.runs[0]!.metrics)).toBe(true);
    expect(Object.isFrozen(qualification.runFailures)).toBe(true);
    expect(
      Object.isFrozen(
        authorizeRetroBenchmarkQualification(
          qualification,
          selectedPlan,
          result,
        ),
      ),
    ).toBe(true);
  });
});
