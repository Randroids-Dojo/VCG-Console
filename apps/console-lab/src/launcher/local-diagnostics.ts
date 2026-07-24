export const MAX_LOCAL_DIAGNOSTIC_EVENTS = 256;
export const MAX_LOCAL_DIAGNOSTIC_EXPORT_BYTES = 64 * 1_024;

const DIAGNOSTIC_DEFINITIONS = {
  "launcher.ready": { subsystem: "launcher", severity: "info" },
  "package.inventory.available": { subsystem: "packages", severity: "info" },
  "package.inventory.unavailable": { subsystem: "packages", severity: "warning" },
  "launch.started": { subsystem: "launcher", severity: "info" },
  "mode.admin.requested": { subsystem: "access", severity: "info" },
  "mode.admin.entered": { subsystem: "access", severity: "info" },
  "mode.developer.requested": { subsystem: "access", severity: "info" },
  "mode.developer.entered": { subsystem: "access", severity: "warning" },
  "mode.confirmation.cancelled": { subsystem: "access", severity: "info" },
  "mode.confirmation.expired": { subsystem: "access", severity: "warning" },
  "mode.developer.ended": { subsystem: "access", severity: "info" },
  "mode.family.locked": { subsystem: "access", severity: "info" },
  "mode.identity-change.locked": { subsystem: "access", severity: "info" },
} as const;

export type LocalDiagnosticCode = keyof typeof DIAGNOSTIC_DEFINITIONS;
export type LocalDiagnosticSubsystem =
  (typeof DIAGNOSTIC_DEFINITIONS)[LocalDiagnosticCode]["subsystem"];
export type LocalDiagnosticSeverity =
  (typeof DIAGNOSTIC_DEFINITIONS)[LocalDiagnosticCode]["severity"];

export interface LocalDiagnosticEvent {
  readonly sequence: number;
  readonly uptimeMs: number;
  readonly subsystem: LocalDiagnosticSubsystem;
  readonly severity: LocalDiagnosticSeverity;
  readonly code: LocalDiagnosticCode;
}

export interface LocalDiagnosticBundle {
  readonly schemaVersion: 1;
  readonly generatedAtUptimeMs: number;
  readonly privacy: {
    readonly containsRawFrames: false;
    readonly containsSkeletons: false;
    readonly containsProfiles: false;
    readonly containsPersonalIdentifiers: false;
    readonly containsCredentials: false;
    readonly containsFreeText: false;
  };
  readonly retention: {
    readonly storage: "memory-only";
    readonly maximumEvents: number;
    readonly droppedEvents: number;
  };
  readonly events: readonly LocalDiagnosticEvent[];
}

export interface PreparedLocalDiagnosticExport {
  readonly bundle: LocalDiagnosticBundle;
  readonly serialized: string;
}

/**
 * Bounded volatile diagnostic events for the browser prototype.
 *
 * Only closed codes enter the buffer. Subsystem and severity are derived from
 * the code, so callers cannot attach text, identity, paths, tokens, or payloads.
 */
export class LocalDiagnosticBuffer {
  readonly #events: LocalDiagnosticEvent[] = [];
  #nextSequence = 1;
  #lastUptimeMs: number | undefined;
  #droppedEvents = 0;
  #preparedExport: PreparedLocalDiagnosticExport | undefined;

  record(code: LocalDiagnosticCode, uptimeMs: number): LocalDiagnosticEvent {
    requireUptime(uptimeMs);
    if (!Object.hasOwn(DIAGNOSTIC_DEFINITIONS, code)) {
      throw new Error("diagnostic code is not allowed");
    }
    if (this.#lastUptimeMs !== undefined && uptimeMs < this.#lastUptimeMs) {
      throw new Error("diagnostic uptime cannot move backward");
    }
    if (!Number.isSafeInteger(this.#nextSequence)) {
      throw new Error("diagnostic sequence exhausted");
    }

    const definition = DIAGNOSTIC_DEFINITIONS[code];
    const event: LocalDiagnosticEvent = {
      sequence: this.#nextSequence,
      uptimeMs,
      subsystem: definition.subsystem,
      severity: definition.severity,
      code,
    };
    this.#nextSequence += 1;
    this.#lastUptimeMs = uptimeMs;
    this.#events.push(event);
    if (this.#events.length > MAX_LOCAL_DIAGNOSTIC_EVENTS) {
      this.#events.shift();
      this.#droppedEvents = Math.min(Number.MAX_SAFE_INTEGER, this.#droppedEvents + 1);
    }
    return { ...event };
  }

  snapshot(generatedAtUptimeMs: number): LocalDiagnosticBundle {
    requireUptime(generatedAtUptimeMs);
    if (
      this.#lastUptimeMs !== undefined &&
      generatedAtUptimeMs < this.#lastUptimeMs
    ) {
      throw new Error("diagnostic bundle time cannot precede its events");
    }
    return {
      schemaVersion: 1,
      generatedAtUptimeMs,
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
        droppedEvents: this.#droppedEvents,
      },
      events: this.#events.map((event) => ({ ...event })),
    };
  }

  serialize(generatedAtUptimeMs: number): string {
    return serializeDiagnosticBundle(this.snapshot(generatedAtUptimeMs));
  }

  prepareExport(generatedAtUptimeMs: number): PreparedLocalDiagnosticExport {
    const bundle = freezeDiagnosticBundle(this.snapshot(generatedAtUptimeMs));
    const prepared = Object.freeze({
      bundle,
      serialized: serializeDiagnosticBundle(bundle),
    });
    this.#preparedExport = prepared;
    return prepared;
  }

  confirmExport(prepared: PreparedLocalDiagnosticExport): string {
    if (this.#preparedExport !== prepared) {
      throw new Error("diagnostic export was not issued by this buffer");
    }
    return prepared.serialized;
  }

  discardExport(prepared: PreparedLocalDiagnosticExport): void {
    if (this.#preparedExport !== prepared) {
      throw new Error("diagnostic export was not issued by this buffer");
    }
    this.#preparedExport = undefined;
  }

  clear(): void {
    this.#events.length = 0;
    this.#nextSequence = 1;
    this.#lastUptimeMs = undefined;
    this.#droppedEvents = 0;
    this.#preparedExport = undefined;
  }
}

export function diagnosticUptimeMs(): number {
  return Math.floor(performance.now());
}

function requireUptime(uptimeMs: number): void {
  if (!Number.isSafeInteger(uptimeMs) || uptimeMs < 0) {
    throw new Error("diagnostic uptime must be a non-negative safe integer");
  }
}

function freezeDiagnosticBundle(
  bundle: LocalDiagnosticBundle,
): LocalDiagnosticBundle {
  return Object.freeze({
    ...bundle,
    privacy: Object.freeze({ ...bundle.privacy }),
    retention: Object.freeze({ ...bundle.retention }),
    events: Object.freeze(
      bundle.events.map((event) => Object.freeze({ ...event })),
    ),
  });
}

function serializeDiagnosticBundle(bundle: LocalDiagnosticBundle): string {
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > MAX_LOCAL_DIAGNOSTIC_EXPORT_BYTES) {
    throw new Error("diagnostic bundle exceeds its export bound");
  }
  return serialized;
}
