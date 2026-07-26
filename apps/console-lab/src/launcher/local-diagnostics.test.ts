import { describe, expect, it } from "vitest";
import {
  LocalDiagnosticBuffer,
  MAX_LOCAL_DIAGNOSTIC_EVENTS,
  MAX_LOCAL_DIAGNOSTIC_EXPORT_BYTES,
} from "./local-diagnostics";

describe("LocalDiagnosticBuffer", () => {
  it("derives closed metadata and declares every excluded data class", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    expect(diagnostics.record("package.inventory.unavailable", 10)).toEqual({
      sequence: 1,
      uptimeMs: 10,
      subsystem: "packages",
      severity: "warning",
      code: "package.inventory.unavailable",
    });
    expect(diagnostics.snapshot(11)).toMatchObject({
      schemaVersion: 1,
      generatedAtUptimeMs: 11,
      privacy: {
        containsRawFrames: false,
        containsSkeletons: false,
        containsProfiles: false,
        containsPersonalIdentifiers: false,
        containsCredentials: false,
        containsFreeText: false,
      },
      retention: {
        storage: "memory-only",
        maximumEvents: MAX_LOCAL_DIAGNOSTIC_EVENTS,
        droppedEvents: 0,
      },
    });
  });

  it("retains only the newest bounded events and reports exact eviction", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    for (let index = 0; index < MAX_LOCAL_DIAGNOSTIC_EVENTS + 17; index += 1) {
      diagnostics.record("launcher.ready", index);
    }
    const snapshot = diagnostics.snapshot(MAX_LOCAL_DIAGNOSTIC_EVENTS + 17);
    expect(snapshot.events).toHaveLength(MAX_LOCAL_DIAGNOSTIC_EVENTS);
    expect(snapshot.events[0]?.sequence).toBe(18);
    expect(snapshot.events.at(-1)?.sequence).toBe(
      MAX_LOCAL_DIAGNOSTIC_EVENTS + 17,
    );
    expect(snapshot.retention.droppedEvents).toBe(17);
    expect(
      diagnostics.prepareExport(MAX_LOCAL_DIAGNOSTIC_EVENTS + 17).summary,
    ).toMatchObject({
      recordQuality: "history-evicted",
      attention: "history-incomplete",
      retainedEvents: MAX_LOCAL_DIAGNOSTIC_EVENTS,
      droppedEvents: 17,
    });
  });

  it("summarizes only fixed subsystem counts and retained warning history", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    diagnostics.record("launcher.ready", 1);
    diagnostics.record("package.inventory.unavailable", 2);
    diagnostics.record("mode.confirmation.expired", 3);
    const summary = diagnostics.prepareExport(4).summary;

    expect(summary).toEqual({
      schemaVersion: 1,
      recordQuality: "complete",
      attention: "retained-warning",
      retainedEvents: 3,
      droppedEvents: 0,
      retainedWarningEvents: 2,
      subsystemCounts: {
        launcher: 1,
        packages: 1,
        access: 1,
      },
    });
    expect(Object.isFrozen(summary)).toBe(true);
    expect(Object.isFrozen(summary.subsystemCounts)).toBe(true);
  });

  it("rejects unknown codes, malformed time, and time reversal", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    expect(() =>
      diagnostics.record("secret.payload" as "launcher.ready", 0),
    ).toThrow("not allowed");
    expect(() => diagnostics.record("launcher.ready", -1)).toThrow("safe integer");
    expect(() => diagnostics.record("launcher.ready", 0.5)).toThrow("safe integer");
    diagnostics.record("launcher.ready", 10);
    expect(() => diagnostics.record("launch.started", 9)).toThrow("backward");
    expect(() => diagnostics.snapshot(9)).toThrow("precede");
  });

  it("cannot serialize caller text, identity, paths, tokens, or payloads", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    const hostile = {
      code: "launch.started",
      uptimeMs: 1,
      detail: "Randy / C:\\profiles\\randy / bearer-secret",
      token: "bearer-secret",
      rawFrame: [1, 2, 3],
    } as const;
    diagnostics.record(hostile.code, hostile.uptimeMs);
    const serialized = diagnostics.serialize(2);
    expect(serialized).not.toContain(hostile.detail);
    expect(serialized).not.toContain(hostile.token);
    expect(serialized).not.toContain("rawFrame");
    expect(serialized).not.toContain("profile");
  });

  it("produces a deterministic bounded JSON document", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    diagnostics.record("launcher.ready", 1);
    diagnostics.record("package.inventory.available", 2);
    const prepared = diagnostics.prepareExport(3);
    const first = prepared.serialized;
    expect(first).toBe(diagnostics.serialize(3));
    expect(new TextEncoder().encode(first).byteLength).toBeLessThanOrEqual(
      MAX_LOCAL_DIAGNOSTIC_EXPORT_BYTES,
    );
    expect(JSON.parse(first)).toEqual(prepared.bundle);
    expect(diagnostics.confirmExport(prepared)).toBe(first);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.bundle)).toBe(true);
    expect(Object.isFrozen(prepared.summary)).toBe(true);
    expect(Object.isFrozen(prepared.bundle.privacy)).toBe(true);
    expect(Object.isFrozen(prepared.bundle.retention)).toBe(true);
    expect(Object.isFrozen(prepared.bundle.events)).toBe(true);
    expect(prepared.bundle.events.every(Object.isFrozen)).toBe(true);
  });

  it("confirms only the exact current export issued by the same buffer", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    const other = new LocalDiagnosticBuffer();
    diagnostics.record("launcher.ready", 1);
    const first = diagnostics.prepareExport(2);
    const clone = structuredClone(first);

    expect(() => diagnostics.confirmExport(clone)).toThrow("not issued");
    expect(() => other.confirmExport(first)).toThrow("not issued");

    const replacement = diagnostics.prepareExport(3);
    expect(() => diagnostics.confirmExport(first)).toThrow("not issued");
    expect(diagnostics.confirmExport(replacement)).toBe(replacement.serialized);
    expect(diagnostics.confirmExport(replacement)).toBe(replacement.serialized);

    diagnostics.discardExport(replacement);
    expect(() => diagnostics.confirmExport(replacement)).toThrow("not issued");
  });

  it("revokes every prepared export when the buffer is cleared", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    const prepared = diagnostics.prepareExport(0);
    diagnostics.clear();
    expect(() => diagnostics.confirmExport(prepared)).toThrow("not issued");
  });

  it("clears all retained and linkable buffer state", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    diagnostics.record("launcher.ready", 99);
    diagnostics.clear();
    expect(diagnostics.snapshot(0).events).toEqual([]);
    expect(diagnostics.record("launcher.ready", 0).sequence).toBe(1);
  });
});
