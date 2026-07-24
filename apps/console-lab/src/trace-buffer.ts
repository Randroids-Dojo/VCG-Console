import {
  MOTION_API_SCHEMA_VERSION,
  MOTION_TRACE_MAX_FRAMES,
  MOTION_TRACE_MAX_HEALTH_EVENTS,
  MOTION_TRACE_MAX_PLAYERS,
  MOTION_TRACE_MAX_TRACKS,
  MotionTraceV2Schema,
  type MotionFrame,
  type MotionProfile,
  type MotionTraceV2,
  type TrackerHealthEvent,
} from "@vcg/motion-contract";

export class TraceBuffer {
  readonly #frames: MotionFrame[] = [];
  readonly #healthEvents: TrackerHealthEvent[] = [];
  readonly #tracePlayerIds = new Map<string, string>();
  #nextTracePlayerId = 1;
  #droppedFrames = 0;
  #droppedHealthEvents = 0;
  #trackLimitReached = false;
  #playerLimitExceeded = false;

  constructor(private readonly capacity: number = MOTION_TRACE_MAX_FRAMES) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > MOTION_TRACE_MAX_FRAMES) {
      throw new Error(`trace capacity must be an integer from 1 through ${MOTION_TRACE_MAX_FRAMES}`);
    }
  }

  push(frame: MotionFrame): boolean {
    if (
      frame.capabilities.maxPlayers > MOTION_TRACE_MAX_PLAYERS ||
      frame.players.length > MOTION_TRACE_MAX_PLAYERS
    ) {
      this.#droppedFrames += 1;
      this.#playerLimitExceeded = true;
      return false;
    }
    const newSourceIds = new Set(
      frame.players
        .map((player) => player.id)
        .filter((playerId) => !this.#tracePlayerIds.has(playerId)),
    );
    if (this.#tracePlayerIds.size + newSourceIds.size > MOTION_TRACE_MAX_TRACKS) {
      this.#droppedFrames += 1;
      this.#trackLimitReached = true;
      return false;
    }
    this.#frames.push(this.#minimizeFrame(frame));
    if (this.#frames.length > this.capacity) {
      const overflow = this.#frames.length - this.capacity;
      this.#frames.splice(0, overflow);
      this.#droppedFrames += overflow;
    }
    return true;
  }

  pushHealth(event: TrackerHealthEvent): void {
    this.#healthEvents.push(structuredClone(event));
    if (this.#healthEvents.length > MOTION_TRACE_MAX_HEALTH_EVENTS) {
      const overflow = this.#healthEvents.length - MOTION_TRACE_MAX_HEALTH_EVENTS;
      this.#healthEvents.splice(0, overflow);
      this.#droppedHealthEvents += overflow;
    }
  }

  clear(): void {
    this.#frames.length = 0;
    this.#healthEvents.length = 0;
    this.#tracePlayerIds.clear();
    this.#nextTracePlayerId = 1;
    this.#droppedFrames = 0;
    this.#droppedHealthEvents = 0;
    this.#trackLimitReached = false;
    this.#playerLimitExceeded = false;
  }

  snapshot(createdAt = new Date()): MotionTraceV2 {
    if (this.#frames.length === 0) throw new Error("a debug trace requires at least one frame");
    if (!Number.isFinite(createdAt.getTime())) throw new Error("trace creation time must be valid");

    const frameSources = new Set<MotionFrame["source"]>();
    const timestampQualities = new Set<MotionFrame["capabilities"]["timestampQuality"]>();
    const exportedProfiles = new Set<MotionProfile>();
    for (const event of this.#healthEvents) frameSources.add(event.source);
    for (const frame of this.#frames) {
      frameSources.add(frame.source);
      timestampQualities.add(frame.capabilities.timestampQuality);
      for (const profile of frame.capabilities.profiles) exportedProfiles.add(profile);
    }

    return MotionTraceV2Schema.parse({
      format: "vcg-motion-trace",
      formatVersion: 2,
      createdAt: createdAt.toISOString(),
      containsRawFrames: false,
      privacy: {
        containsRawFrames: false,
        containsAudio: false,
        containsPortraits: false,
        containsProfileIdentifiers: false,
        containsFreeText: false,
        containsDerivedSkeletons: true,
        containsTraceLocalTrackIds: true,
        containsExactExportTime: true,
      },
      retention: {
        volatileFrameLimit: MOTION_TRACE_MAX_FRAMES,
        volatileHealthEventLimit: MOTION_TRACE_MAX_HEALTH_EVENTS,
        volatileTrackLimit: MOTION_TRACE_MAX_TRACKS,
        droppedFrames: this.#droppedFrames,
        droppedHealthEvents: this.#droppedHealthEvents,
        trackLimitReached: this.#trackLimitReached,
        playerLimitExceeded: this.#playerLimitExceeded,
        persistentBeforeExport: false,
        exportPersistence: "user-managed-file",
        deletionControl: "clear-volatile-buffer-and-delete-exported-file",
      },
      provenance: {
        motionSchemaVersion: MOTION_API_SCHEMA_VERSION,
        coordinateSpecVersion: this.#frames[0]!.capabilities.coordinateSpecVersion,
        frameSources: [...frameSources].sort(),
        timestampQualities: [...timestampQualities].sort(),
        exportedProfiles: [...exportedProfiles].sort(),
      },
      healthEvents: this.#healthEvents,
      frames: this.#frames,
    });
  }

  get size(): number {
    return this.#frames.length;
  }

  get healthSize(): number {
    return this.#healthEvents.length;
  }

  #minimizeFrame(frame: MotionFrame): MotionFrame {
    const profiles = frame.capabilities.profiles.filter(
      (profile): profile is MotionProfile =>
        profile === "body.core17" ||
        profile === "actions.obstacle.v1" ||
        profile === "actions.shell.v1",
    );
    return {
      ...frame,
      capabilities: {
        profiles,
        maxPlayers: frame.capabilities.maxPlayers,
        coordinateSpecVersion: frame.capabilities.coordinateSpecVersion,
        coordinateSystem: frame.capabilities.coordinateSystem,
        timestampQuality: frame.capabilities.timestampQuality,
      },
      players: frame.players.map((player) => ({
        id: this.#tracePlayerId(player.id),
        sessionSlot: player.sessionSlot,
        confidence: player.confidence,
        state: player.state,
        coreLandmarks: player.coreLandmarks.map((landmark) => ({
          name: landmark.name,
          position: {
            x: landmark.position.x,
            y: landmark.position.y,
          },
          visibility: landmark.visibility,
          observed: landmark.observed,
        })),
        bounds: { ...player.bounds },
        actions: player.actions.map((action) => ({ ...action })),
      })),
    };
  }

  #tracePlayerId(playerId: string): string {
    const existing = this.#tracePlayerIds.get(playerId);
    if (existing !== undefined) return existing;
    if (this.#nextTracePlayerId > MOTION_TRACE_MAX_TRACKS) {
      throw new Error(`debug traces support at most ${MOTION_TRACE_MAX_TRACKS} distinct tracks`);
    }
    const tracePlayerId = `trace-player-${this.#nextTracePlayerId}`;
    this.#nextTracePlayerId += 1;
    this.#tracePlayerIds.set(playerId, tracePlayerId);
    return tracePlayerId;
  }
}
