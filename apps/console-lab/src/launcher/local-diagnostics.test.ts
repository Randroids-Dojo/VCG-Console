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
  });

  it("clears all retained and linkable buffer state", () => {
    const diagnostics = new LocalDiagnosticBuffer();
    diagnostics.record("launcher.ready", 99);
    diagnostics.clear();
    expect(diagnostics.snapshot(0).events).toEqual([]);
    expect(diagnostics.record("launcher.ready", 0).sequence).toBe(1);
  });
});
