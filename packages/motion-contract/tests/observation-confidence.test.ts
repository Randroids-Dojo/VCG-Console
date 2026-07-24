import { describe, expect, it } from "vitest";
import {
  OBSERVATION_CONFIDENCE_GATE_DEFAULTS,
  ObservationConfidenceGate,
} from "../src";

describe("ObservationConfidenceGate", () => {
  it("requires bounded consecutive high-confidence samples to acquire", () => {
    const gate = new ObservationConfidenceGate();
    expect(gate.update({
      timestampMs: 0,
      providerObserved: true,
      confidence: 0.9,
    })).toMatchObject({
      observed: false,
      reason: "rearming",
      consecutiveAcquireSamples: 1,
    });
    expect(gate.update({
      timestampMs: 16,
      providerObserved: true,
      confidence: 0.9,
    })).toMatchObject({
      observed: false,
      reason: "rearming",
      consecutiveAcquireSamples: 2,
    });
    expect(gate.update({
      timestampMs: 32,
      providerObserved: true,
      confidence: 0.9,
    })).toMatchObject({
      observed: true,
      reason: "observed",
      consecutiveAcquireSamples: 3,
    });
  });

  it("drops immediately on low confidence and rearms from zero", () => {
    const gate = new ObservationConfidenceGate({ acquireSamples: 2 });
    gate.update({ timestampMs: 0, providerObserved: true, confidence: 0.9 });
    expect(gate.update({
      timestampMs: 16,
      providerObserved: true,
      confidence: 0.9,
    }).observed).toBe(true);
    expect(gate.update({
      timestampMs: 32,
      providerObserved: true,
      confidence: 0.49,
    })).toMatchObject({
      observed: false,
      reason: "blocked-confidence",
      consecutiveAcquireSamples: 0,
    });
    expect(gate.update({
      timestampMs: 48,
      providerObserved: true,
      confidence: 0.9,
    })).toMatchObject({
      observed: false,
      reason: "rearming",
      consecutiveAcquireSamples: 1,
    });
  });

  it("honors an explicit provider loss regardless of score", () => {
    const gate = new ObservationConfidenceGate({ acquireSamples: 1 });
    expect(gate.update({
      timestampMs: 0,
      providerObserved: false,
      confidence: 1,
    })).toMatchObject({
      observed: false,
      reason: "blocked-provider",
    });
  });

  it("retains an acquired landmark in the hysteresis band", () => {
    const gate = new ObservationConfidenceGate({ acquireSamples: 1 });
    expect(gate.update({
      timestampMs: 0,
      providerObserved: true,
      confidence: 0.8,
    }).observed).toBe(true);
    expect(gate.update({
      timestampMs: 16,
      providerObserved: true,
      confidence: 0.6,
    })).toMatchObject({
      observed: true,
      reason: "observed",
    });
  });

  it("reset requires a fresh acquisition epoch", () => {
    const gate = new ObservationConfidenceGate({ acquireSamples: 1 });
    expect(gate.update({
      timestampMs: 0,
      providerObserved: true,
      confidence: 0.9,
    }).observed).toBe(true);
    gate.reset();
    expect(gate.update({
      timestampMs: 0,
      providerObserved: true,
      confidence: 0.6,
    })).toMatchObject({
      observed: false,
      reason: "blocked-confidence",
    });
  });

  it("rejects ambiguous configuration, samples, and replayed timestamps", () => {
    expect(
      () =>
        new ObservationConfidenceGate({
          releaseConfidence: 0.8,
          acquireConfidence: 0.7,
        }),
    ).toThrow(/acquireConfidence/);
    expect(
      () =>
        new ObservationConfidenceGate({
          acquireSamples: 0,
        }),
    ).toThrow(/acquireSamples/);
    expect(
      () =>
        new ObservationConfidenceGate({
          inferMissing: true,
        } as never),
    ).toThrow(/unknown keys/);
    const gate = new ObservationConfidenceGate();
    gate.update({ timestampMs: 1, providerObserved: true, confidence: 0.9 });
    expect(
      () =>
        gate.update({
          timestampMs: 1,
          providerObserved: true,
          confidence: 0.9,
        }),
    ).toThrow(/strictly increasing/);
    expect(
      () =>
        gate.update({
          timestampMs: 2,
          providerObserved: true,
          confidence: Number.NaN,
        }),
    ).toThrow(/confidence/);
    expect(OBSERVATION_CONFIDENCE_GATE_DEFAULTS).toEqual({
      releaseConfidence: 0.5,
      acquireConfidence: 0.75,
      acquireSamples: 3,
    });
  });
});
